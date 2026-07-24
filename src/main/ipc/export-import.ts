import { dialog } from 'electron'
import { IPC_CHANNELS } from '@shared/ipc'
import fs from 'fs'
import type { SchemaColumn } from '@shared/types'
import type { ExportFormatInfo, ImportFormatInfo } from '@shared/export-import'
import type { ExporterRegistry } from '../plugins/sdk/exporter-registry'
import type { ImporterRegistry } from '../plugins/sdk/importer-registry'
import { importCsvToTable } from '../plugins/sdk/csv-into-table'
import type { IpcContext, Handle } from './context'

interface RegistryDeps {
  exporterRegistry: ExporterRegistry
  importerRegistry: ImporterRegistry
}

function safeFileName(name: string): string {
  // Strip path separators, NUL, control chars, and Windows-reserved characters
  // from a user-supplied "table" name before using it as a filename. Anything
  // that survives is then constrained by the save dialog, but defense in depth.
  return name.replace(/[\x00-\x1F<>:"/\\|?*]/g, '_').slice(0, 200) || 'export'
}

async function readRowsForExport(
  ctx: IpcContext,
  profileId: string,
  table: string,
  schema?: string
): Promise<{ rows: Record<string, unknown>[]; columns: SchemaColumn[] }> {
  const adapter = ctx.activeAdapters.get(profileId)
  if (!adapter) throw new Error('Not connected')
  const profile = ctx.configStore.getConnection(profileId)
  const connectionType = profile?.type ?? ''
  const driver = ctx.driverRegistry.get(connectionType)
  if (!driver?.getTableData) {
    throw new Error(
      `Driver '${connectionType}' does not implement getTableData(). ` +
      `Cannot export this connection type without a driver-provided data fetcher.`
    )
  }
  // Export deliberately passes no `limit`: it needs every row. Bounding the
  // browse ("View data") path is #213; streaming export so it isn't fully
  // buffered is the separate concern tracked by #214/#17.
  return driver.getTableData(adapter, table, schema)
}

export function registerExportImportHandlers(
  ctx: IpcContext,
  handle: Handle,
  deps: RegistryDeps
): void {
  const { exporterRegistry, importerRegistry } = deps

  /** The driver type for a saved connection profile (''=unknown). */
  const typeOf = (profileId: string): string =>
    ctx.configStore.getConnection(profileId)?.type ?? ''

  handle(IPC_CHANNELS.EXPORT_FORMATS_LIST, async (profileId) => {
    const seen = new Set<string>()
    const out: ExportFormatInfo[] = []
    for (const e of exporterRegistry.list(typeOf(profileId))) {
      if (seen.has(e.format)) continue // first registration wins per format
      seen.add(e.format)
      out.push({
        format: e.format,
        displayName: e.displayName,
        extension: e.extension,
        supportsSchema: !!e.supportsSchema,
      })
    }
    return out
  })

  handle(IPC_CHANNELS.IMPORT_FORMATS_LIST, async (profileId) => {
    const seen = new Set<string>()
    const out: ImportFormatInfo[] = []
    for (const i of importerRegistry.list(typeOf(profileId))) {
      if (seen.has(i.format)) continue
      seen.add(i.format)
      out.push({
        format: i.format,
        displayName: i.displayName,
        extensions: i.extensions,
        driverExecutes: !!i.driverExecutes,
      })
    }
    return out
  })

  handle(IPC_CHANNELS.EXPORT_TABLE, async (profileId, tableName, format, options) => {
    const profile = ctx.configStore.getConnection(profileId)
    const connectionType = profile?.type ?? ''
    const exporter = exporterRegistry.resolve(format, connectionType)
    if (!exporter) {
      throw new Error(`No exporter registered for format '${format}' on '${connectionType}' connections`)
    }

    const { rows, columns } = await readRowsForExport(ctx, profileId, tableName, options?.schema)
    const content = await exporter.execute(rows, columns, {
      tableName,
      schema: options?.schema,
      connectionType,
      includeSchema: options?.includeSchema
    })

    const { filePath, canceled } = await dialog.showSaveDialog({
      defaultPath: `${safeFileName(tableName)}.${exporter.extension}`,
      filters: [{ name: exporter.displayName, extensions: [exporter.extension] }]
    })
    if (canceled || !filePath) return { cancelled: true as const }
    fs.writeFileSync(filePath, content)
    return { filePath }
  })

  handle(IPC_CHANNELS.EXPORT_QUERY_RESULT, async (rows, fields, format) => {
    const exporter = exporterRegistry.resolve(format, '')
    if (!exporter) {
      throw new Error(`No exporter registered for format '${format}'`)
    }
    const columns: SchemaColumn[] = fields.map(name => ({
      name, dataType: 'unknown', nullable: true,
      isPrimaryKey: false, isForeignKey: false, defaultValue: null
    }))
    const content = await exporter.execute(rows, columns, {
      tableName: 'query-result',
      connectionType: ''
    })

    const { filePath, canceled } = await dialog.showSaveDialog({
      defaultPath: `query-result.${exporter.extension}`,
      filters: [{ name: exporter.displayName, extensions: [exporter.extension] }]
    })
    if (canceled || !filePath) return { cancelled: true as const }
    fs.writeFileSync(filePath, content)
    return { filePath }
  })

  handle(IPC_CHANNELS.IMPORT_CSV, async (profileId, tableName, columnMapping, onConflict) => {
    const adapter = ctx.activeAdapters.get(profileId)
    if (!adapter) throw new Error('Not connected')
    const profile = ctx.configStore.getConnection(profileId)
    const connectionType = profile?.type ?? ''

    const { filePaths, canceled } = await dialog.showOpenDialog({
      filters: [{ name: 'CSV', extensions: ['csv', 'tsv'] }],
      properties: ['openFile']
    })
    if (canceled || filePaths.length === 0) return { cancelled: true as const }

    const importer = importerRegistry.findByExtension('csv', connectionType)
    if (!importer) {
      throw new Error('No CSV importer is registered')
    }
    const content = fs.readFileSync(filePaths[0], 'utf-8')
    const result = await importer.parse(content, {
      tableName, connectionType, adapter, columnMapping, onConflict
    })
    if (!importer.driverExecutes) {
      // Generic CSV-into-relational-table fallback. The orchestrator drives
      // it using the driver's contributed `quoteChar` + `placeholderStyle`, so
      // no dialect knowledge has to live in this file. Drivers that need
      // upserts or other dialect-specific behaviour should ship their own
      // importer with driverExecutes:true.
      const driver = ctx.driverRegistry.get(connectionType)
      if (!driver?.quoteChar || !driver?.placeholderStyle) {
        throw new Error(
          `Driver '${connectionType}' did not contribute quoteChar + placeholderStyle. ` +
          `The generic CSV → table importer cannot be used; register a ` +
          `driverExecutes importer instead.`
        )
      }
      return importCsvToTable(adapter, result.rows as Record<string, string>[], {
        tableName,
        columnMapping,
        onConflict,
        quoteChar: driver.quoteChar,
        placeholderStyle: driver.placeholderStyle,
      })
    }
    return {
      inserted: result.executed ?? result.rows.length,
      skipped: 0,
      errors: result.errors ?? []
    }
  })

  handle(IPC_CHANNELS.IMPORT_SQL, async (profileId) => {
    const adapter = ctx.activeAdapters.get(profileId)
    if (!adapter) throw new Error('Not connected')
    const profile = ctx.configStore.getConnection(profileId)
    const connectionType = profile?.type ?? ''

    const { filePaths, canceled } = await dialog.showOpenDialog({
      filters: [{ name: 'SQL', extensions: ['sql'] }],
      properties: ['openFile']
    })
    if (canceled || filePaths.length === 0) return { cancelled: true as const }

    const importer = importerRegistry.findByExtension('sql', connectionType)
    if (!importer) {
      throw new Error(`No SQL importer is registered for '${connectionType}' connections`)
    }
    const content = fs.readFileSync(filePaths[0], 'utf-8')
    const result = await importer.parse(content, { connectionType, adapter })
    return {
      executed: result.executed ?? 0,
      errors: result.errors ?? []
    }
  })
}
