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
