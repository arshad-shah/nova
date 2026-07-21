import type { DbAdapter } from '../../../db/adapter'
import type { SchemaColumn } from '@shared/types'
import type { RegisteredExporter } from '../../sdk/exporter-registry'
import type { RegisteredImporter } from '../../sdk/importer-registry'
import { errorMessage } from '@shared/errors'

/**
 * MongoDB cannot use the relational `getTableData` helper because there is no
 * SELECT. Documents go through the adapter's mongo-query API instead. The
 * collection name is embedded in a JSON payload (not a SQL string), so the
 * adapter's own JSON parser validates it — no string interpolation here.
 */
export async function getTableData(
  adapter: DbAdapter,
  collection: string,
  _schema?: string
): Promise<{ rows: Record<string, unknown>[]; columns: SchemaColumn[] }> {
  // Use the adapter's query() entrypoint — it parses the JSON payload and
  // validates operation/collection/filter, so we don't need to escape anything
  // ourselves.
  const payload = JSON.stringify({ collection, operation: 'find', filter: {} })
  const result = await adapter.query(payload)
  // Best-effort columns from the first document's keys; mongo documents are
  // free-form, so this is a snapshot rather than a true schema.
  const columns: SchemaColumn[] = []
  if (result.rows.length > 0) {
    for (const key of Object.keys(result.rows[0])) {
      columns.push({
        name: key,
        dataType: typeof (result.rows[0] as Record<string, unknown>)[key],
        nullable: true,
        isPrimaryKey: key === '_id',
        isForeignKey: false,
        defaultValue: null
      })
    }
  }
  return { rows: result.rows, columns }
}

export const jsonLinesExporter: RegisteredExporter = {
  format: 'jsonl',
  extension: 'jsonl',
  displayName: 'JSON Lines (one document per line)',
  appliesToTypes: ['mongodb'],
  execute(rows) {
    return rows.map(r => JSON.stringify(r)).join('\n') + (rows.length ? '\n' : '')
  }
}

export const bsonArrayExporter: RegisteredExporter = {
  format: 'json',
  extension: 'json',
  displayName: 'JSON Array (Mongo Extended JSON)',
  appliesToTypes: ['mongodb'],
  execute(rows) {
    return JSON.stringify(rows, null, 2)
  }
}

/**
 * JSON-lines importer: one JSON document per line. Each document is sent
 * through the adapter's mongo `insertOne` operation, so the adapter's input
 * validator handles the heavy lifting.
 */
export const jsonLinesImporter: RegisteredImporter = {
  format: 'jsonl',
  extensions: ['jsonl', 'ndjson'],
  displayName: 'JSON Lines',
  appliesToTypes: ['mongodb'],
  driverExecutes: true,
  async parse(content, options) {
    const text = typeof content === 'string' ? content : content.toString('utf-8')
    const adapter = options.adapter
    if (!adapter) throw new Error('JSON-lines importer requires an active adapter')
    if (!options.tableName) {
      throw new Error('JSON-lines importer requires a target collection (tableName)')
    }
    const lines = text.split('\n').filter(l => l.trim().length > 0)
    let executed = 0
    const errors: string[] = []
    for (let i = 0; i < lines.length; i++) {
      let doc: unknown
      try {
        doc = JSON.parse(lines[i])
      } catch (err) {
        errors.push(`Line ${i + 1}: invalid JSON — ${errorMessage(err)}`)
        continue
      }
      try {
        await adapter.query(JSON.stringify({
          collection: options.tableName,
          operation: 'insertOne',
          document: doc
        }))
        executed++
      } catch (err) {
        errors.push(`Line ${i + 1}: ${errorMessage(err)}`)
      }
    }
    return { rows: [], executed, errors }
  }
}
