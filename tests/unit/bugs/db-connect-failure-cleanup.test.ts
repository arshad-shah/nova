// Regression test: a failed `db:connect` must release the adapter.
//
// `createAdapter()` builds a driver and `connect()` can partially
// initialise a pool/socket (e.g. pg.Pool spins up background reconnect
// timers) before throwing on a bad password / unreachable host. The old
// handler returned the error without calling `disconnect()`, so every
// failed attempt — including auto-reconnect retry loops — leaked a pool
// that lived until app exit. The fix disconnects the adapter in the catch
// when it never made it into `activeAdapters`.
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { ConnectionProfile } from '../../../shared/types'
import type { IpcChannelMap } from '../../../shared/ipc'
import type { DbAdapter } from '../../../src/main/db/adapter'
import type { IpcContext } from '../../../src/main/ipc/context'
import { registerDbHandlers } from '../../../src/main/ipc/db'
import { ConnectionAccessImpl } from '../../../src/main/plugins/sdk/connection-access'
import { DriverRegistryImpl } from '../../../src/main/plugins/sdk/driver-registry'
import { setDriverRegistry } from '../../../src/main/db/factory'

class FailingAdapter implements DbAdapter {
  static instances: FailingAdapter[] = []
  static disconnectCount = 0
  disconnected = false

  constructor() { FailingAdapter.instances.push(this) }

  async connect(): Promise<void> {
    // Simulate a pool that was created before the handshake failed.
    throw new Error('ECONNREFUSED: connection refused')
  }
  async disconnect(): Promise<void> {
    FailingAdapter.disconnectCount++
    this.disconnected = true
  }
  isConnected(): boolean { return false }
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
  invoke: <K extends keyof IpcChannelMap>(channel: K, ...args: IpcChannelMap[K]['args']) => Promise<IpcChannelMap[K]['return']>
  ctx: IpcContext
} {
  const handlers = new Map<string, (...a: unknown[]) => unknown>()
  const handle = ((channel: string, fn: (...a: unknown[]) => unknown) => {
    handlers.set(channel, fn)
  }) as unknown as Parameters<typeof registerDbHandlers>[1]

  const driverRegistry = new DriverRegistryImpl()
  driverRegistry.register('stub', { createAdapter: () => new FailingAdapter() })
  setDriverRegistry(driverRegistry)

  const profile: ConnectionProfile = { id: 'p1', name: 'Stub', type: 'stub' as ConnectionProfile['type'] }
  const ctx: IpcContext = {
    configStore: { getConnection: (id: string) => (id === 'p1' ? profile : undefined) } as unknown as IpcContext['configStore'],
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
  FailingAdapter.instances = []
  FailingAdapter.disconnectCount = 0
})

afterEach(() => {
  setDriverRegistry(new DriverRegistryImpl())
})

describe('db:connect — cleanup on connect() failure', () => {
  it('disconnects the adapter when connect() throws', async () => {
    const { invoke, ctx } = buildHarness()
    const result = await invoke('db:connect', 'p1')

    expect(result.success).toBe(false)
    expect(FailingAdapter.instances.length).toBe(1)
    // The leaked-pool bug: disconnect() was never called.
    expect(FailingAdapter.disconnectCount).toBe(1)
    expect(FailingAdapter.instances[0].disconnected).toBe(true)
    // And nothing should be left registered.
    expect(ctx.activeAdapters.size).toBe(0)
  })

  it('does not leak across repeated failed attempts', async () => {
    const { invoke } = buildHarness()
    await invoke('db:connect', 'p1')
    await invoke('db:connect', 'p1')
    await invoke('db:connect', 'p1')
    expect(FailingAdapter.instances.length).toBe(3)
    expect(FailingAdapter.disconnectCount).toBe(3)
  })
})
