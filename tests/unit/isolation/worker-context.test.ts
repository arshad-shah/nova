// buildWorkerContext constructs the gated PluginContext proxy handed to an
// UNTRUSTED, process-isolated plugin's activate(). It is the security
// boundary described in docs/plugin-security.md: only commands, themes, and
// a fixed set of async capability calls may cross into the host; everything
// else must throw rather than silently hand back a live registry.
//
// We drive it with a real RpcEndpoint over the in-memory transport pair (the
// same harness rpc.test.ts uses) so `endpoint` is a genuine RpcEndpoint, not a
// hand-rolled stand-in — and we control the "host" side to observe exactly
// what crosses the wire.
import { describe, it, expect } from 'vitest'
import { buildWorkerContext } from '../../../src/main/plugins/isolation/worker-context'
import { RpcEndpoint } from '../../../src/main/plugins/isolation/rpc'
import { createMemoryTransportPair } from '../../../src/main/plugins/isolation/memory-transport'
import { W2H, W2H_EVENT } from '../../../src/main/plugins/isolation/protocol'

interface CapabilityCall {
  surface: string
  method: string
  args: unknown[]
}

/** Wire up a worker-side endpoint (feeding buildWorkerContext) plus a host
 *  endpoint that records every W2H.CAPABILITY call and answers it. */
function harness(respond: (call: CapabilityCall) => unknown = () => undefined) {
  const { host, worker } = createMemoryTransportPair()
  const hostEndpoint = new RpcEndpoint(host)
  const workerEndpoint = new RpcEndpoint(worker)
  const calls: CapabilityCall[] = []
  hostEndpoint.handle(W2H.CAPABILITY, (params) => {
    const call = params as CapabilityCall
    calls.push(call)
    return respond(call)
  })
  const events: Array<{ method: string; params: unknown }> = []
  hostEndpoint.on(W2H_EVENT.NOTIFY, (params) => events.push({ method: W2H_EVENT.NOTIFY, params }))
  hostEndpoint.on(W2H_EVENT.BROADCAST, (params) => events.push({ method: W2H_EVENT.BROADCAST, params }))
  const built = buildWorkerContext(workerEndpoint)
  return { ...built, calls, events, hostEndpoint, workerEndpoint }
}

// Every context surface the file marks unsupported(), enumerated from source.
const unsupportedProxySurfaces = [
  'drivers',
  'tools',
  'panels',
  'ui',
  'completions',
  'exporters',
  'importers',
  'formatters',
  'typeMappers',
  'dragDrop',
  'ai',
  'services',
  'ipc',
  'rootSettings',
] as const

// Sync accessors stubbed directly on an otherwise-forwarding surface.
const unsupportedSyncMethods: Array<{ path: string; call: (ctx: any) => void; nameFragment: string }> = [
  {
    path: 'connections.getActiveConnectionId',
    call: (ctx) => ctx.connections.getActiveConnectionId(),
    nameFragment: 'connections.getActiveConnectionId (sync)',
  },
  {
    path: 'connections.getProfile',
    call: (ctx) => ctx.connections.getProfile(),
    nameFragment: 'connections.getProfile (sync)',
  },
  {
    path: 'connections.onActiveConnectionChanged',
    call: (ctx) => ctx.connections.onActiveConnectionChanged(),
    nameFragment: 'connections.onActiveConnectionChanged',
  },
  {
    path: 'keyring.retrieveSync',
    call: (ctx) => ctx.keyring.retrieveSync(),
    nameFragment: 'keyring.retrieveSync (sync)',
  },
  {
    path: 'keyring.storeSync',
    call: (ctx) => ctx.keyring.storeSync(),
    nameFragment: 'keyring.storeSync (sync)',
  },
  {
    path: 'keyring.has',
    call: (ctx) => ctx.keyring.has(),
    nameFragment: 'keyring.has (sync)',
  },
  {
    path: 'keyring.listKeys',
    call: (ctx) => ctx.keyring.listKeys(),
    nameFragment: 'keyring.listKeys (sync)',
  },
  {
    path: 'settings.get',
    call: (ctx) => ctx.settings.get(),
    nameFragment: 'settings.get (sync); read via your own activate-time logic',
  },
  {
    path: 'settings.onChanged',
    call: (ctx) => ctx.settings.onChanged(),
    nameFragment: 'settings.onChanged',
  },
]

describe('buildWorkerContext — unsupported surfaces throw', () => {
  for (const surface of unsupportedProxySurfaces) {
    it(`ctx.${surface} throws on any property access, naming the surface`, () => {
      const { context } = harness()
      const ctx = context as Record<string, any>
      // Access an arbitrary method name — the proxy must throw regardless of
      // which property was touched, and the error must name the surface.
      expect(() => ctx[surface].someArbitraryMethod()).toThrow(
        new RegExp(`ctx\\.${surface} is not available`),
      )
      expect(() => ctx[surface].anotherMethod('x')).toThrow(
        new RegExp(`ctx\\.${surface} is not available`),
      )
    })
  }

  for (const { path, call, nameFragment } of unsupportedSyncMethods) {
    it(`${path} throws NOT_SUPPORTED naming exactly "${nameFragment}"`, () => {
      const { context } = harness()
      expect(() => call(context)).toThrow(
        `ctx.${nameFragment} is not available to a process-isolated plugin.`,
      )
    })
  }

  it('a mismatched surface name would be a real bug: each sync stub names only its own path', () => {
    const { context } = harness()
    const ctx = context as any
    try {
      ctx.connections.getProfile()
      throw new Error('should have thrown')
    } catch (err) {
      const message = (err as Error).message
      expect(message).toContain('ctx.connections.getProfile (sync) is not available')
      // It must not claim to be a different surface's stub.
      expect(message).not.toContain('ctx.keyring.retrieveSync')
      expect(message).not.toContain('ctx.connections.getActiveConnectionId')
    }
  })
})

describe('buildWorkerContext — forwarding surfaces dispatch over RPC', () => {
  it('connections.query forwards surface/method/args and returns the host result', async () => {
    const { context, calls } = harness((call) => {
      expect(call.surface).toBe('connections')
      expect(call.method).toBe('query')
      expect(call.args).toEqual(['select 1', { limit: 10 }])
      return { rows: [{ n: 1 }] }
    })
    const ctx = context as any
    const result = await ctx.connections.query('select 1', { limit: 10 })
    expect(result).toEqual({ rows: [{ n: 1 }] })
    expect(calls).toHaveLength(1)
  })

  it('connections.cancelQuery forwards to the right method', async () => {
    const { context, calls } = harness(() => true)
    const ctx = context as any
    await ctx.connections.cancelQuery('query-id-1')
    expect(calls[0]).toEqual({ surface: 'connections', method: 'cancelQuery', args: ['query-id-1'] })
  })

  it('keyring.store/retrieve/delete each forward to their own method name', async () => {
    const { context, calls } = harness((call) => `${call.method}-result`)
    const ctx = context as any
    expect(await ctx.keyring.store('k', 'v')).toBe('store-result')
    expect(await ctx.keyring.retrieve('k')).toBe('retrieve-result')
    expect(await ctx.keyring.delete('k')).toBe('delete-result')
    expect(calls.map((c) => [c.surface, c.method])).toEqual([
      ['keyring', 'store'],
      ['keyring', 'retrieve'],
      ['keyring', 'delete'],
    ])
  })

  it('schema.* surfaces each forward under the schema surface with the right method', async () => {
    const { context, calls } = harness((call) => ({ echoed: call.method }))
    const ctx = context as any
    await ctx.schema.getTables('conn1')
    await ctx.schema.getColumns('conn1', 'table1')
    await ctx.schema.getIndexes('conn1', 'table1')
    await ctx.schema.getSchemas('conn1')
    await ctx.schema.getDatabases('conn1')
    await ctx.schema.getSchemaSummary('conn1')
    expect(calls.map((c) => c.method)).toEqual([
      'getTables',
      'getColumns',
      'getIndexes',
      'getSchemas',
      'getDatabases',
      'getSchemaSummary',
    ])
    expect(calls.every((c) => c.surface === 'schema')).toBe(true)
  })

  it('a driver-like surface never gets a "drivers" capability call — it must be a local proxy, not forwarded', () => {
    const { context, calls } = harness()
    const ctx = context as any
    expect(() => ctx.drivers.register()).toThrow()
    // The regression this test guards: if `drivers` were ever wired through
    // forward('drivers', ...) instead of unsupported('drivers'), this call
    // would show up here as a live RPC capability call.
    expect(calls).toHaveLength(0)
  })

  it('settings.set forwards surface/method/args but does not return a promise to the caller', async () => {
    const { context, calls, hostEndpoint } = harness()
    const ctx = context as any
    const returnValue = ctx.settings.set('theme', 'dark')
    expect(returnValue).toBeUndefined()
    // The request is fire-and-forget from the caller's perspective, but it is
    // still sent — wait a tick for the in-memory transport's microtask.
    await new Promise((r) => setTimeout(r, 5))
    expect(calls).toEqual([{ surface: 'settings', method: 'set', args: ['theme', 'dark'] }])
    void hostEndpoint // referenced to avoid unused warnings in strict lint configs
  })

  it('notifications.show emits W2H_EVENT.NOTIFY with the notification payload verbatim', async () => {
    const { context, events } = harness()
    const ctx = context as any
    const payload = { title: 'Hi', level: 'info' }
    ctx.notifications.show(payload)
    await new Promise((r) => setTimeout(r, 5))
    expect(events).toEqual([{ method: W2H_EVENT.NOTIFY, params: payload }])
  })

  it('broadcast emits W2H_EVENT.BROADCAST with {channel, args}', async () => {
    const { context, events } = harness()
    const ctx = context as any
    ctx.broadcast('my-channel', 1, 'two', { three: 3 })
    await new Promise((r) => setTimeout(r, 5))
    expect(events).toEqual([
      { method: W2H_EVENT.BROADCAST, params: { channel: 'my-channel', args: [1, 'two', { three: 3 }] } },
    ])
  })
})

describe('buildWorkerContext — contribution descriptors', () => {
  it('commands.register produces a well-formed command ContributionDescriptor and stores the live handle', () => {
    const { context, contributions, handles } = harness()
    const ctx = context as any
    const handler = (x: number) => x * 2
    const disposable = ctx.commands.register('my.command', handler)

    expect(contributions).toHaveLength(1)
    const descriptor = contributions[0]
    expect(descriptor.kind).toBe('command')
    expect(descriptor.id).toBe('my.command')
    expect(typeof descriptor.handleId).toBe('string')
    expect(descriptor.handleId).toMatch(/^command:my\.command:\d+$/)
    expect(descriptor.data).toBeUndefined()

    // The handle map is how the host actually invokes the command later
    // (H2W.INVOKE) — the registered function must be reachable by that id.
    expect(handles.get(descriptor.handleId as string)).toBe(handler)

    // register() must return a disposable per the PluginContext contract.
    expect(typeof disposable.dispose).toBe('function')
    expect(() => disposable.dispose()).not.toThrow()
  })

  it('commands.register gives each registration a distinct handleId', () => {
    const { context, contributions } = harness()
    const ctx = context as any
    ctx.commands.register('cmd.a', () => {})
    ctx.commands.register('cmd.a', () => {}) // same id, registered twice
    const ids = contributions.map((c) => c.handleId)
    expect(new Set(ids).size).toBe(2)
  })

  it('themes.register uses the theme\'s own id and ships the theme verbatim as data', () => {
    const { context, contributions } = harness()
    const ctx = context as any
    const theme = { id: 'midnight-plus', colors: { bg: '#000' } }
    ctx.themes.register(theme)

    expect(contributions).toHaveLength(1)
    const descriptor = contributions[0]
    expect(descriptor.kind).toBe('theme')
    expect(descriptor.id).toBe('midnight-plus')
    expect(descriptor.data).toBe(theme)
    expect(descriptor.handleId).toBeUndefined()
  })

  it('themes.register falls back to a generated id when the theme has none', () => {
    const { context, contributions } = harness()
    const ctx = context as any
    ctx.themes.register({ colors: {} })
    expect(contributions[0].id).toMatch(/^theme-\d+$/)
  })
})

describe('buildWorkerContext — error propagation across the RPC boundary', () => {
  it('propagates a host rejection (e.g. permission denied) back through the forwarded call', async () => {
    const { context } = harness(() => {
      const err = new Error('keyring access denied') as Error & { permission?: string }
      err.name = 'PermissionDeniedError'
      err.permission = 'keyring'
      throw err
    })
    const ctx = context as any
    await expect(ctx.keyring.retrieve('secret')).rejects.toMatchObject({
      name: 'PermissionDeniedError',
      message: 'keyring access denied',
      permission: 'keyring',
    })
  })

  it('propagates an RPC timeout/close as a rejection rather than swallowing it', async () => {
    const { host, worker } = createMemoryTransportPair()
    const hostEndpoint = new RpcEndpoint(host)
    hostEndpoint.handle(W2H.CAPABILITY, () => new Promise(() => {})) // never resolves
    const workerEndpoint = new RpcEndpoint(worker)
    const { context } = buildWorkerContext(workerEndpoint)
    const ctx = context as any
    const pending = ctx.connections.query('select 1')
    workerEndpoint.close()
    await expect(pending).rejects.toThrow(/closed/)
  })

  it('a non-object/malformed result from the host still resolves the forwarded call as-is', async () => {
    const { context } = harness(() => undefined)
    const ctx = context as any
    await expect(ctx.schema.getTables('c1')).resolves.toBeUndefined()
  })
})
