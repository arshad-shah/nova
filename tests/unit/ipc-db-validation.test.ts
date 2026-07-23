// Complements tests/unit/db-session-handlers.test.ts and
// tests/unit/bugs/db-connect-*.test.ts: this file targets db.ts's input
// validation and driver-capability error paths that aren't covered there —
// the places a hostile/buggy renderer argument or an incomplete driver
// plugin should produce a clear thrown error rather than a silent wrong
// result.
import { describe, it, expect, vi } from 'vitest'
import { registerDbHandlers } from '../../src/main/ipc/db'
import type { IpcChannelMap } from '../../shared/ipc'
import type { IpcContext, Handle } from '../../src/main/ipc/context'

function harness(opts: {
  adapter?: Record<string, unknown> | null
  driver?: Record<string, unknown> | null
  connection?: { type: string } | undefined
} = {}) {
  const handlers = new Map<string, (...a: unknown[]) => unknown>()
  const handle = ((ch: string, fn: (...a: unknown[]) => unknown) => handlers.set(ch, fn)) as unknown as Handle
  const adapter = opts.adapter === undefined ? { id: 'adapter' } : opts.adapter
  const ctx = {
    activeAdapters: adapter ? new Map([['p1', adapter]]) : new Map(),
    driverRegistry: {
      get: () => (opts.driver === undefined ? {} : opts.driver),
      getMiddlewares: () => [],
    },
    configStore: { getConnection: () => opts.connection },
  } as unknown as IpcContext
  const connectionAccess = { setActiveConnectionId() {}, getActiveConnectionId: () => null } as never
  registerDbHandlers(ctx, handle, connectionAccess)

  return (<K extends keyof IpcChannelMap>(channel: K, ...args: IpcChannelMap[K]['args']) => {
    const fn = handlers.get(channel)
    if (!fn) throw new Error(`No handler for ${channel}`)
    return Promise.resolve(fn(...args))
  }) as <K extends keyof IpcChannelMap>(channel: K, ...args: IpcChannelMap[K]['args']) => Promise<IpcChannelMap[K]['return']>
}

describe('db:switch-database — empty name guard', () => {
  it('rejects an empty string database name instead of forwarding it to the adapter', async () => {
    const invoke = harness()
    await expect(invoke('db:switch-database', 'p1', '')).rejects.toThrow(/Database name is required/)
  })

  it('accepts a non-empty database name and forwards it verbatim', async () => {
    const switchDatabase = vi.fn(async () => {})
    const invoke = harness({ adapter: { switchDatabase } })
    await invoke('db:switch-database', 'p1', 'analytics')
    expect(switchDatabase).toHaveBeenCalledWith('analytics')
  })
})

describe('db:get-table-data — requires a driver-provided reader', () => {
  it('throws naming the connection type when the driver has no getTableData()', async () => {
    const invoke = harness({ connection: { type: 'mongodb' }, driver: {} })
    await expect(invoke('db:get-table-data', 'p1', 'coll')).rejects.toThrow(
      /Driver 'mongodb' does not implement getTableData/,
    )
  })

  it('throws "Not connected" (not a driver error) when there is no active adapter at all', async () => {
    const invoke = harness({ adapter: null })
    await expect(invoke('db:get-table-data', 'p1', 'coll')).rejects.toThrow(/Not connected/)
  })
})

describe('db:sample-query — requires a driver-provided sample', () => {
  it('throws naming the connection type when the driver has no sampleQuery()', async () => {
    const invoke = harness({ connection: { type: 'redis' }, driver: {} })
    await expect(invoke('db:sample-query', 'p1', 'key')).rejects.toThrow(
      /Driver 'redis' does not contribute a sampleQuery/,
    )
  })

  it('throws "Unknown connection" when the profile has been deleted out from under an open tab', async () => {
    const invoke = harness({ connection: undefined })
    await expect(invoke('db:sample-query', 'p1', 'key')).rejects.toThrow(/Unknown connection/)
  })
})

describe('db:disconnect — middleware teardown isolation', () => {
  it('still releases the adapter when a connection middleware onDisconnect() throws', async () => {
    const disconnect = vi.fn(async () => {})
    const handlers = new Map<string, (...a: unknown[]) => unknown>()
    const handle = ((ch: string, fn: (...a: unknown[]) => unknown) => handlers.set(ch, fn)) as unknown as Handle
    const ctx = {
      activeAdapters: new Map([['p1', { disconnect }]]),
      driverRegistry: {
        get: () => ({}),
        getMiddlewares: () => [{
          pluginName: 'ssh-tunnel',
          middleware: { onDisconnect: async () => { throw new Error('tunnel already dead') } },
        }],
      },
      configStore: { getConnection: () => ({ name: 'Prod' }) },
    } as unknown as IpcContext
    const connectionAccess = { setActiveConnectionId() {}, getActiveConnectionId: () => 'p1' } as never
    registerDbHandlers(ctx, handle, connectionAccess)
    const invoke = (<K extends keyof IpcChannelMap>(channel: K, ...args: IpcChannelMap[K]['args']) =>
      Promise.resolve(handlers.get(channel)!(...args))) as <K extends keyof IpcChannelMap>(
      channel: K, ...args: IpcChannelMap[K]['args']
    ) => Promise<IpcChannelMap[K]['return']>

    // A broken SSH tunnel's onDisconnect() rejecting must not prevent the
    // adapter itself from being disconnected and cleared.
    await expect(invoke('db:disconnect', 'p1')).resolves.toBeUndefined()
    expect(disconnect).toHaveBeenCalled()
    expect(ctx.activeAdapters.has('p1')).toBe(false)
  })
})

describe('requireAdapter error surfaced through query/schema handlers', () => {
  it('db:query rejects with an actionable message when nothing is connected', async () => {
    const invoke = harness({ adapter: null })
    await expect(invoke('db:query', 'p1', 'SELECT 1')).rejects.toThrow(
      /Not connected — select a connection from the sidebar first/,
    )
  })

  it('db:get-schemas rejects the same way for an unconnected profile', async () => {
    const invoke = harness({ adapter: null })
    await expect(invoke('db:get-schemas', 'p1')).rejects.toThrow(/Not connected/)
  })
})

describe('db:set-active-connection — guards against stale ids', () => {
  it('ignores a profileId with no active adapter (does not update the active connection)', async () => {
    const setActiveConnectionId = vi.fn()
    const handlers = new Map<string, (...a: unknown[]) => unknown>()
    const handle = ((ch: string, fn: (...a: unknown[]) => unknown) => handlers.set(ch, fn)) as unknown as Handle
    const ctx = {
      activeAdapters: new Map(),
      driverRegistry: { getMiddlewares: () => [] },
      configStore: { getConnection: () => undefined },
    } as unknown as IpcContext
    const connectionAccess = { setActiveConnectionId, getActiveConnectionId: () => null } as never
    registerDbHandlers(ctx, handle, connectionAccess)
    await Promise.resolve(handlers.get('db:set-active-connection')!('ghost-profile'))
    expect(setActiveConnectionId).not.toHaveBeenCalled()
  })

  it('always allows clearing the active connection (null)', async () => {
    const setActiveConnectionId = vi.fn()
    const handlers = new Map<string, (...a: unknown[]) => unknown>()
    const handle = ((ch: string, fn: (...a: unknown[]) => unknown) => handlers.set(ch, fn)) as unknown as Handle
    const ctx = {
      activeAdapters: new Map(),
      driverRegistry: { getMiddlewares: () => [] },
      configStore: { getConnection: () => undefined },
    } as unknown as IpcContext
    const connectionAccess = { setActiveConnectionId, getActiveConnectionId: () => null } as never
    registerDbHandlers(ctx, handle, connectionAccess)
    await Promise.resolve(handlers.get('db:set-active-connection')!(null))
    expect(setActiveConnectionId).toHaveBeenCalledWith(null)
  })

  it('accepts a profileId that IS actively connected', async () => {
    const setActiveConnectionId = vi.fn()
    const handlers = new Map<string, (...a: unknown[]) => unknown>()
    const handle = ((ch: string, fn: (...a: unknown[]) => unknown) => handlers.set(ch, fn)) as unknown as Handle
    const ctx = {
      activeAdapters: new Map([['p1', {}]]),
      driverRegistry: { getMiddlewares: () => [] },
      configStore: { getConnection: () => undefined },
    } as unknown as IpcContext
    const connectionAccess = { setActiveConnectionId, getActiveConnectionId: () => null } as never
    registerDbHandlers(ctx, handle, connectionAccess)
    await Promise.resolve(handlers.get('db:set-active-connection')!('p1'))
    expect(setActiveConnectionId).toHaveBeenCalledWith('p1')
  })
})

describe('db:get-schema-objects — falls back to [] when the adapter has no schema-objects reader', () => {
  it('returns [] when getSchemaObjects is absent', async () => {
    const invoke = harness({ adapter: {} })
    await expect(invoke('db:get-schema-objects', 'p1', 'public')).resolves.toEqual([])
  })

  it('delegates to the adapter when present', async () => {
    const getSchemaObjects = vi.fn(async () => [{ name: 'view1', kind: 'view' }])
    const invoke = harness({ adapter: { getSchemaObjects } })
    const result = await invoke('db:get-schema-objects', 'p1', 'public')
    expect(getSchemaObjects).toHaveBeenCalledWith('public')
    expect(result).toEqual([{ name: 'view1', kind: 'view' }])
  })
})

describe('db:get-table-names — maps getTables() results down to plain names', () => {
  it('returns only the name field from each table object', async () => {
    const getTables = vi.fn(async () => [{ name: 'users', schema: 'public' }, { name: 'orders', schema: 'public' }])
    const invoke = harness({ adapter: { getTables } })
    const result = await invoke('db:get-table-names', 'p1', 'public')
    expect(result).toEqual(['users', 'orders'])
  })
})

describe('db:set-schema / db:switch-warehouse / db:switch-role — optional adapter methods', () => {
  it('is a no-op when the adapter does not implement setSchema', async () => {
    const invoke = harness({ adapter: {} })
    await expect(invoke('db:set-schema', 'p1', 'public')).resolves.toBeUndefined()
  })

  it('forwards to setSchema when implemented', async () => {
    const setSchema = vi.fn(async () => {})
    const invoke = harness({ adapter: { setSchema } })
    await invoke('db:set-schema', 'p1', 'analytics')
    expect(setSchema).toHaveBeenCalledWith('analytics')
  })

  it('forwards to switchWarehouse when implemented, no-ops otherwise', async () => {
    const switchWarehouse = vi.fn(async () => {})
    const invoke = harness({ adapter: { switchWarehouse } })
    await invoke('db:switch-warehouse', 'p1', 'WH_LARGE')
    expect(switchWarehouse).toHaveBeenCalledWith('WH_LARGE')

    const invokeNoop = harness({ adapter: {} })
    await expect(invokeNoop('db:switch-warehouse', 'p1', 'WH_LARGE')).resolves.toBeUndefined()
  })

  it('forwards to switchRole when implemented, no-ops otherwise', async () => {
    const switchRole = vi.fn(async () => {})
    const invoke = harness({ adapter: { switchRole } })
    await invoke('db:switch-role', 'p1', 'ANALYST')
    expect(switchRole).toHaveBeenCalledWith('ANALYST')

    const invokeNoop = harness({ adapter: {} })
    await expect(invokeNoop('db:switch-role', 'p1', 'ANALYST')).resolves.toBeUndefined()
  })
})

describe('db:cancel-query', () => {
  it('is a silent no-op when there is no active adapter', async () => {
    const invoke = harness({ adapter: null })
    await expect(invoke('db:cancel-query', 'p1')).resolves.toBeUndefined()
  })

  it('is a silent no-op when the adapter has no cancelQuery()', async () => {
    const invoke = harness({ adapter: {} })
    await expect(invoke('db:cancel-query', 'p1')).resolves.toBeUndefined()
  })

  it('calls cancelQuery() on the active adapter when implemented', async () => {
    const cancelQuery = vi.fn(async () => {})
    const invoke = harness({ adapter: { cancelQuery } })
    await invoke('db:cancel-query', 'p1')
    expect(cancelQuery).toHaveBeenCalled()
  })
})

describe('db:connection-capabilities', () => {
  it('returns null when the connection profile is unknown', async () => {
    const invoke = harness({ connection: undefined })
    await expect(invoke('db:connection-capabilities', 'p1')).resolves.toBeNull()
  })

  it('returns null when the driver has no getRuntimeCapabilities or there is no active adapter', async () => {
    const invoke = harness({ connection: { type: 'sqlite' }, driver: {}, adapter: null })
    await expect(invoke('db:connection-capabilities', 'p1')).resolves.toBeNull()
  })

  it('returns the driver-computed runtime capabilities when both the driver method and adapter exist', async () => {
    const getRuntimeCapabilities = vi.fn(() => ({ canCancel: true }))
    const invoke = harness({ connection: { type: 'postgresql' }, driver: { getRuntimeCapabilities }, adapter: { id: 'adapter' } })
    const result = await invoke('db:connection-capabilities', 'p1')
    expect(getRuntimeCapabilities).toHaveBeenCalledWith({ id: 'adapter' })
    expect(result).toEqual({ canCancel: true })
  })
})

describe('db:driver-capabilities', () => {
  it('returns null for an unregistered driver type', async () => {
    const invoke = harness({ driver: null })
    await expect(invoke('db:driver-capabilities', 'nonexistent')).resolves.toBeNull()
  })

  it('serializes the static capabilities of a registered driver', async () => {
    const invoke = harness({
      driver: { sqlDialect: 'postgres', editorLanguage: 'sql', sampleQuery: () => '' },
    })
    const result = await invoke('db:driver-capabilities', 'postgresql')
    expect(result).toMatchObject({ sqlDialect: 'postgres', editorLanguage: 'sql', hasSampleQuery: true, hasGetTableData: false })
  })
})

describe('db:parse-plan', () => {
  it('returns [] when there is no active adapter', async () => {
    const invoke = harness({ adapter: null })
    await expect(invoke('db:parse-plan', 'p1', { rows: [], fields: [], rowCount: 0, duration: 0 } as never)).resolves.toEqual([])
  })

  it('returns [] when the adapter has no parseQueryPlan()', async () => {
    const invoke = harness({ adapter: {} })
    await expect(invoke('db:parse-plan', 'p1', { rows: [], fields: [], rowCount: 0, duration: 0 } as never)).resolves.toEqual([])
  })

  it('delegates to the adapter parser and returns its result', async () => {
    const parseQueryPlan = vi.fn(() => [{ nodeType: 'Seq Scan' }])
    const invoke = harness({ adapter: { parseQueryPlan } })
    const result = await invoke('db:parse-plan', 'p1', { rows: [], fields: [], rowCount: 0, duration: 0 } as never)
    expect(parseQueryPlan).toHaveBeenCalled()
    expect(result).toEqual([{ nodeType: 'Seq Scan' }])
  })
})
