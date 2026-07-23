// Regression test for the `db:connect` TOCTOU race.
//
// The handler in `src/main/ipc/db.ts` checks
//
//   if (ctx.activeAdapters.has(profileId)) return { success: true }
//
// then constructs and `await`s a new adapter, then `set()`s it into the
// map. Two concurrent renderer calls (e.g. a user double-clicking a
// connection, or the auto-reconnect on app launch overlapping with a
// manual click) both see the map empty, both build adapters, and the
// second `set()` overwrites — and orphans — the first. The orphaned
// adapter never gets `disconnect()`'d, leaking a pool until the app
// quits.
//
// We dedupe in-flight connects so concurrent calls share a single
// adapter and a single connect() invocation.
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { ConnectionProfile } from '../../../shared/types'
import type { IpcChannelMap } from '../../../shared/ipc'
import type { DbAdapter } from '../../../src/main/db/adapter'
import type { IpcContext } from '../../../src/main/ipc/context'
import { registerDbHandlers } from '../../../src/main/ipc/db'
import { ConnectionAccessImpl } from '../../../src/main/plugins/sdk/connection-access'
import { DriverRegistryImpl } from '../../../src/main/plugins/sdk/driver-registry'
import { setDriverRegistry } from '../../../src/main/db/factory'

class StubAdapter implements DbAdapter {
  static instances: StubAdapter[] = []
  static connectCount = 0
  static disconnectCount = 0

  connected = false
  disconnected = false

  constructor() { StubAdapter.instances.push(this) }

  async connect(): Promise<void> {
    StubAdapter.connectCount++
    // Yield a few microtasks so two parallel callers actually overlap.
    await new Promise(r => setTimeout(r, 5))
    this.connected = true
  }
  async disconnect(): Promise<void> {
    StubAdapter.disconnectCount++
    this.disconnected = true
  }
  isConnected(): boolean { return this.connected }
  async testConnection() { return { version: 'stub' } }
  async query() { return { rows: [], fields: [], rowCount: 0, duration: 0, affectedRows: 0 } }
  async getTables() { return [] }
  async getColumns() { return [] }
  async getIndexes() { return [] }
  async getRowCount() { return 0 }
  async getSchemas() { return [] }
  async getDatabases() { return [] }
}

function buildHarness(): {
  invoke: <K extends keyof IpcChannelMap>(
    channel: K,
    ...args: IpcChannelMap[K]['args']
  ) => Promise<IpcChannelMap[K]['return']>
  ctx: IpcContext
} {
  const handlers = new Map<string, (...a: unknown[]) => unknown>()
  const handle = ((channel: string, fn: (...a: unknown[]) => unknown) => {
    handlers.set(channel, fn)
  }) as unknown as Parameters<typeof registerDbHandlers>[1]

  const driverRegistry = new DriverRegistryImpl()
  driverRegistry.register('stub', {
    createAdapter: () => new StubAdapter(),
  })
  setDriverRegistry(driverRegistry)

  const profile: ConnectionProfile = {
    id: 'p1', name: 'Stub', type: 'stub' as ConnectionProfile['type'],
  }
  const ctx: IpcContext = {
    configStore: {
      getConnection: (id: string) => id === 'p1' ? profile : undefined,
    } as unknown as IpcContext['configStore'],
    keyring: {} as IpcContext['keyring'],
    driverRegistry,
    activeAdapters: new Map(),
  }
  const connAccess = new ConnectionAccessImpl(
    id => ctx.activeAdapters.get(id),
    id => ctx.configStore.getConnection(id),
  )
  registerDbHandlers(ctx, handle, connAccess)

  return {
    ctx,
    invoke: ((channel, ...args) => {
      const fn = handlers.get(channel)
      if (!fn) throw new Error(`No handler registered for ${channel}`)
      return Promise.resolve(fn(...args))
    }) as ReturnType<typeof buildHarness>['invoke'],
  }
}

beforeEach(() => {
  StubAdapter.instances = []
  StubAdapter.connectCount = 0
  StubAdapter.disconnectCount = 0
})

afterEach(() => {
  // The race test shouldn't leak module-global registry state across files.
  setDriverRegistry(new DriverRegistryImpl())
})

describe('db:connect — concurrent connects to the same profileId', () => {
  it('only constructs ONE adapter even when called in parallel', async () => {
    const { invoke } = buildHarness()
    const [a, b, c] = await Promise.all([
      invoke('db:connect', 'p1'),
      invoke('db:connect', 'p1'),
      invoke('db:connect', 'p1'),
    ])

    expect(a).toEqual({ success: true })
    expect(b).toEqual({ success: true })
    expect(c).toEqual({ success: true })
    // Exactly one adapter, exactly one connect(). Without dedup the original
    // code constructs 3, calls connect() on each, and orphans 2.
    expect(StubAdapter.instances.length).toBe(1)
    expect(StubAdapter.connectCount).toBe(1)
    expect(StubAdapter.disconnectCount).toBe(0)
  })

  it('records the adapter in activeAdapters exactly once', async () => {
    const { invoke, ctx } = buildHarness()
    await Promise.all([
      invoke('db:connect', 'p1'),
      invoke('db:connect', 'p1'),
    ])
    expect(ctx.activeAdapters.size).toBe(1)
    expect(ctx.activeAdapters.get('p1')).toBe(StubAdapter.instances[0])
  })

  it('subsequent serial connects still no-op when already connected', async () => {
    const { invoke } = buildHarness()
    await invoke('db:connect', 'p1')
    await invoke('db:connect', 'p1')
    expect(StubAdapter.connectCount).toBe(1)
  })
})
