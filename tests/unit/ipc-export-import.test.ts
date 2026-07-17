// src/main/ipc/export-import.ts writes/reads files chosen through native
// dialogs and shells out to driver/exporter/importer plugins. It is a good
// place for a hostile or buggy driver/plugin to smuggle a bad path into a
// filename, or for a missing capability to be silently swallowed instead of
// surfaced as an error. We mock only the electron/fs I/O boundary.
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { showSaveDialogMock, showOpenDialogMock, writeFileSyncMock, readFileSyncMock } = vi.hoisted(() => ({
  showSaveDialogMock: vi.fn(),
  showOpenDialogMock: vi.fn(),
  writeFileSyncMock: vi.fn(),
  readFileSyncMock: vi.fn(() => 'file-content'),
}))

vi.mock('electron', () => ({
  dialog: { showSaveDialog: showSaveDialogMock, showOpenDialog: showOpenDialogMock },
}))

vi.mock('fs', () => ({
  default: { writeFileSync: writeFileSyncMock, readFileSync: readFileSyncMock },
}))

import { registerExportImportHandlers } from '../../src/main/ipc/export-import'
import { ExporterRegistryImpl } from '../../src/main/plugins/sdk/exporter-registry'
import { ImporterRegistryImpl } from '../../src/main/plugins/sdk/importer-registry'
import { IPC_CHANNELS } from '../../shared/ipc'
import type { IpcContext, Handle } from '../../src/main/ipc/context'
import type { IpcChannelMap } from '../../shared/ipc'

function buildHarness(opts: {
  adapter?: Record<string, unknown> | null
  driver?: Record<string, unknown> | null
  connectionType?: string
} = {}) {
  const handlers = new Map<string, (...a: unknown[]) => unknown>()
  const handle = ((channel: string, fn: (...a: unknown[]) => unknown) => {
    handlers.set(channel, fn)
  }) as unknown as Handle

  const exporterRegistry = new ExporterRegistryImpl()
  const importerRegistry = new ImporterRegistryImpl()

  const adapter = opts.adapter === undefined ? { id: 'adapter' } : opts.adapter
  const ctx = {
    activeAdapters: adapter ? new Map([['p1', adapter]]) : new Map(),
    configStore: {
      getConnection: (id: string) =>
        id === 'p1' ? { id: 'p1', type: opts.connectionType ?? 'postgresql' } : undefined,
    },
    driverRegistry: {
      get: () => opts.driver === undefined ? { getTableData: async () => ({ rows: [{ a: 1 }], columns: [] }) } : opts.driver,
    },
  } as unknown as IpcContext

  registerExportImportHandlers(ctx, handle, { exporterRegistry, importerRegistry })

  const invoke = (<K extends keyof IpcChannelMap>(channel: K, ...args: IpcChannelMap[K]['args']) => {
    const fn = handlers.get(channel)
    if (!fn) throw new Error(`No handler for ${channel}`)
    return Promise.resolve(fn(...args))
  }) as <K extends keyof IpcChannelMap>(channel: K, ...args: IpcChannelMap[K]['args']) => Promise<IpcChannelMap[K]['return']>

  return { invoke, exporterRegistry, importerRegistry, ctx }
}

beforeEach(() => {
  vi.clearAllMocks()
  showSaveDialogMock.mockResolvedValue({ canceled: false, filePath: '/tmp/out.csv' })
  showOpenDialogMock.mockResolvedValue({ canceled: false, filePaths: ['/tmp/in.csv'] })
})

describe('export:table', () => {
  it('throws a descriptive error when no exporter is registered for the requested format', async () => {
    const { invoke } = buildHarness()
    await expect(invoke('export:table', 'p1', 'users', 'nonexistent-format')).rejects.toThrow(
      /No exporter registered for format 'nonexistent-format'/,
    )
  })

  it('throws when the connection has no active adapter (not connected)', async () => {
    const { invoke, exporterRegistry } = buildHarness({ adapter: null })
    exporterRegistry.register('csv', {
      format: 'csv', extension: 'csv', displayName: 'CSV', execute: () => 'a,b\n1,2',
    })
    await expect(invoke('export:table', 'p1', 'users', 'csv')).rejects.toThrow(/Not connected/)
  })

  it('throws when the driver does not implement getTableData()', async () => {
    const { invoke, exporterRegistry } = buildHarness({ driver: {} })
    exporterRegistry.register('csv', {
      format: 'csv', extension: 'csv', displayName: 'CSV', execute: () => 'a,b\n1,2',
    })
    await expect(invoke('export:table', 'p1', 'users', 'csv')).rejects.toThrow(/does not implement getTableData/)
  })

  it('returns {cancelled:true} without writing a file when the save dialog is dismissed', async () => {
    showSaveDialogMock.mockResolvedValue({ canceled: true, filePath: undefined })
    const { invoke, exporterRegistry } = buildHarness()
    exporterRegistry.register('csv', {
      format: 'csv', extension: 'csv', displayName: 'CSV', execute: () => 'a,b\n1,2',
    })
    const result = await invoke('export:table', 'p1', 'users', 'csv')
    expect(result).toEqual({ cancelled: true })
    expect(writeFileSyncMock).not.toHaveBeenCalled()
  })

  it('writes the exporter output to the chosen path and returns it', async () => {
    const { invoke, exporterRegistry } = buildHarness()
    exporterRegistry.register('csv', {
      format: 'csv', extension: 'csv', displayName: 'CSV', execute: () => 'a,b\n1,2',
    })
    const result = await invoke('export:table', 'p1', 'users', 'csv')
    expect(result).toEqual({ filePath: '/tmp/out.csv' })
    expect(writeFileSyncMock).toHaveBeenCalledWith('/tmp/out.csv', 'a,b\n1,2')
  })

  it('sanitizes a table name containing path separators before using it as the default filename', async () => {
    const { invoke, exporterRegistry } = buildHarness()
    exporterRegistry.register('csv', {
      format: 'csv', extension: 'csv', displayName: 'CSV', execute: () => 'x',
    })
    await invoke('export:table', 'p1', '../../etc/passwd', 'csv')
    const call = showSaveDialogMock.mock.calls[0][0]
    expect(call.defaultPath).not.toMatch(/[/\\]/)
    expect(call.defaultPath).toBe('.._.._etc_passwd.csv')
  })
})

describe('export:formats-list / import:formats-list — dedup', () => {
  it('keeps only the first registration when two exporters share the same advertised format', async () => {
    const { invoke, exporterRegistry } = buildHarness()
    exporterRegistry.register('csv-generic', {
      format: 'csv', extension: 'csv', displayName: 'Generic CSV', execute: () => '',
    })
    exporterRegistry.register('csv-postgres', {
      format: 'csv', extension: 'csv', displayName: 'Postgres CSV', execute: () => '',
    })
    const list = await invoke('export:formats-list', 'p1')
    const csvEntries = list.filter(f => f.format === 'csv')
    expect(csvEntries).toHaveLength(1)
    expect(csvEntries[0].displayName).toBe('Generic CSV')
  })
})

describe('import:csv', () => {
  it('throws when there is no active adapter', async () => {
    const { invoke } = buildHarness({ adapter: null })
    await expect(invoke('import:csv', 'p1', 'users', {}, 'skip')).rejects.toThrow(/Not connected/)
  })

  it('returns {cancelled:true} when the open dialog is dismissed, without reading any file', async () => {
    showOpenDialogMock.mockResolvedValue({ canceled: true, filePaths: [] })
    const { invoke } = buildHarness()
    const result = await invoke('import:csv', 'p1', 'users', {}, 'skip')
    expect(result).toEqual({ cancelled: true })
    expect(readFileSyncMock).not.toHaveBeenCalled()
  })

  it('throws when no CSV importer is registered for the connection type', async () => {
    const { invoke } = buildHarness()
    await expect(invoke('import:csv', 'p1', 'users', {}, 'skip')).rejects.toThrow(/No CSV importer is registered/)
  })

  it('throws when a non-driverExecutes importer is used but the driver lacks quoteChar/placeholderStyle', async () => {
    const { invoke, importerRegistry } = buildHarness({ driver: {} })
    importerRegistry.register('csv', {
      format: 'csv', extensions: ['csv'], displayName: 'CSV',
      parse: () => ({ rows: [{ a: '1' }] }),
    })
    await expect(invoke('import:csv', 'p1', 'users', {}, 'skip')).rejects.toThrow(
      /did not contribute quoteChar \+ placeholderStyle/,
    )
  })

  it('reports executed/errors from a driverExecutes importer without a generic fallback insert', async () => {
    const { invoke, importerRegistry } = buildHarness()
    importerRegistry.register('sql-native', {
      format: 'csv', extensions: ['csv'], displayName: 'Native CSV', driverExecutes: true,
      parse: () => ({ rows: [], executed: 7, errors: ['row 3 failed'] }),
    })
    const result = await invoke('import:csv', 'p1', 'users', {}, 'error')
    expect(result).toEqual({ inserted: 7, skipped: 0, errors: ['row 3 failed'] })
  })
})

describe('import:sql', () => {
  it('throws when there is no active adapter', async () => {
    const { invoke } = buildHarness({ adapter: null })
    await expect(invoke('import:sql', 'p1')).rejects.toThrow(/Not connected/)
  })

  it('throws a connection-type-specific error when no SQL importer is registered', async () => {
    const { invoke } = buildHarness({ connectionType: 'mongodb' })
    await expect(invoke('import:sql', 'p1')).rejects.toThrow(/No SQL importer is registered for 'mongodb'/)
  })

  it('defaults executed to 0 and errors to [] when the importer reports neither', async () => {
    const { invoke, importerRegistry } = buildHarness()
    importerRegistry.register('sql', {
      format: 'sql', extensions: ['sql'], displayName: 'SQL', parse: () => ({ rows: [] }),
    })
    const result = await invoke('import:sql', 'p1')
    expect(result).toEqual({ executed: 0, errors: [] })
  })
})
