// tests/unit/ai-module-bootstrap.test.ts
//
// startAIModule() (internal/index.ts) wires together provider bootstrap
// (legacy key migration, default provider/model selection), the
// perform_app_action tool, and every AI IPC handler. None of it had direct
// coverage before this file — ai-conversation-manager.test.ts etc. exercise
// the pieces it wires up, but not the wiring itself.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { IPC_CHANNELS, IPC_EVENTS } from '@shared/ipc'
import { startAIModule, type AIDeps, type AIModule } from '../../src/main/plugins/bundled/ai/internal'
import { ToolRegistryImpl } from '../../src/main/plugins/sdk/tool-registry'
import type { KeyringAccess, SchemaAccess, ConnectionAccess, PluginIpc, Disposable } from '../../src/main/plugins/sdk/types'

/** In-memory keyring good enough for the migration + presence checks startAIModule performs. */
function fakeKeyring(): KeyringAccess {
  const store = new Map<string, string>()
  const k = (ns: string, key: string) => `${ns}:${key}`
  return {
    store: async (ns, key, value) => { store.set(k(ns, key), value) },
    retrieve: async (ns, key) => store.get(k(ns, key)) ?? null,
    delete: async (ns, key) => { store.delete(k(ns, key)) },
    retrieveSync: (ns, key) => store.get(k(ns, key)) ?? null,
    storeSync: (ns, key, value) => { store.set(k(ns, key), value) },
    has: (ns, key) => store.has(k(ns, key)),
    listKeys: () => []
  }
}

function fakeSettingsStore(initial: Record<string, unknown> = {}) {
  const values = new Map<string, unknown>(Object.entries(initial))
  return {
    get: (key: string) => values.get(key),
    set: (key: string, value: unknown) => { values.set(key, value) }
  }
}

/** Captures every ipc.handle registration by channel so tests can invoke it directly. */
function fakeIpc(): { ipc: PluginIpc; call: <T = unknown>(channel: string, ...args: unknown[]) => Promise<T> } {
  const handlers = new Map<string, (...args: unknown[]) => unknown>()
  const ipc: PluginIpc = {
    handle: (channel, handler) => {
      handlers.set(channel as string, handler as (...args: unknown[]) => unknown)
      return { dispose: () => handlers.delete(channel as string) } satisfies Disposable
    }
  }
  const call = async <T,>(channel: string, ...args: unknown[]): Promise<T> => {
    const handler = handlers.get(channel)
    if (!handler) throw new Error(`No handler registered for ${channel}`)
    return handler(...args) as Promise<T>
  }
  return { ipc, call }
}

function fakeSchemaAccess(): SchemaAccess {
  return {
    getTables: async () => [],
    getColumns: async () => [],
    getIndexes: async () => [],
    getSchemas: async () => [],
    getDatabases: async () => [],
    getSchemaSummary: async () => ({ tables: [] })
  } as unknown as SchemaAccess
}

function fakeConnectionAccess(activeId: string | null = null): ConnectionAccess {
  return {
    getActiveConnectionId: () => activeId,
    getProfile: () => null,
    query: async () => ({ rows: [], rowCount: 0, fields: [] }) as never,
    cancelQuery: () => {},
    onActiveConnectionChanged: () => ({ dispose: () => {} })
  } as unknown as ConnectionAccess
}

function buildDeps(overrides: Partial<AIDeps> & { settings?: Record<string, unknown> } = {}) {
  const { settings, ...rest } = overrides
  const { ipc, call } = fakeIpc()
  const broadcast = vi.fn()
  const deps: AIDeps = {
    keyring: fakeKeyring(),
    schemaAccess: fakeSchemaAccess(),
    connectionAccess: fakeConnectionAccess(),
    settingsStore: fakeSettingsStore(settings),
    ipc,
    broadcast,
    toolRegistry: new ToolRegistryImpl(),
    ...rest
  }
  return { deps, call, broadcast }
}

describe('startAIModule — provider bootstrap', () => {
  it('migrates a legacy plaintext key from settings into the keyring and blanks the setting', () => {
    const { deps } = buildDeps({ settings: { 'ai.openaiKey': 'sk-legacy-123' } })
    startAIModule(deps)
    expect(deps.keyring.has('__ai__', 'openai')).toBe(true)
    expect(deps.keyring.retrieveSync('__ai__', 'openai')).toBe('sk-legacy-123')
    expect(deps.settingsStore.get('ai.openaiKey')).toBe('')
  })

  it('does not overwrite a key already migrated into the keyring', () => {
    const { deps } = buildDeps({ settings: { 'ai.openaiKey': 'sk-legacy-should-not-apply' } })
    deps.keyring.storeSync('__ai__', 'openai', 'sk-already-there')
    startAIModule(deps)
    expect(deps.keyring.retrieveSync('__ai__', 'openai')).toBe('sk-already-there')
  })

  it('defaults the active provider to anthropic when only an anthropic key is configured', () => {
    const { deps } = buildDeps()
    deps.keyring.storeSync('__ai__', 'anthropic', 'sk-ant-1')
    const mod = startAIModule(deps)
    expect(mod.providerRegistry.getActive()?.id).toBe('anthropic')
    expect(deps.settingsStore.get('ai.activeProvider')).toBe('anthropic')
    mod.dispose.dispose()
  })

  it('prefers anthropic over openai when both keys are present and no provider is saved', () => {
    const { deps } = buildDeps()
    deps.keyring.storeSync('__ai__', 'anthropic', 'sk-ant-1')
    deps.keyring.storeSync('__ai__', 'openai', 'sk-oai-1')
    const mod = startAIModule(deps)
    expect(mod.providerRegistry.getActive()?.id).toBe('anthropic')
    mod.dispose.dispose()
  })

  it('falls back to openai when only an openai key is configured', () => {
    const { deps } = buildDeps()
    deps.keyring.storeSync('__ai__', 'openai', 'sk-oai-1')
    const mod = startAIModule(deps)
    expect(mod.providerRegistry.getActive()?.id).toBe('openai')
    mod.dispose.dispose()
  })

  it('leaves no active provider when no key is configured and none was saved', () => {
    const { deps } = buildDeps()
    const mod = startAIModule(deps)
    expect(mod.providerRegistry.getActive()).toBeNull()
    mod.dispose.dispose()
  })

  it('restores a previously saved active provider even without a key present in this session', () => {
    const { deps } = buildDeps({ settings: { 'ai.activeProvider': 'ollama' } })
    const mod = startAIModule(deps)
    expect(mod.providerRegistry.getActive()?.id).toBe('ollama')
    mod.dispose.dispose()
  })
})

describe('startAIModule — AI_PROVIDERS_SET_ACTIVE', () => {
  let mod: AIModule
  let call: <T = unknown>(channel: string, ...args: unknown[]) => Promise<T>

  beforeEach(() => {
    const built = buildDeps()
    call = built.call
    mod = startAIModule(built.deps)
  })

  afterEach(() => { mod.dispose.dispose() })

  it('switches provider and defaults to that provider\'s cheapest model', async () => {
    // The real anthropic/openai/ollama providers report no models without a
    // configured key/endpoint, which would make "picks the cheapest model"
    // untestable through them — register a fixture provider with known models
    // and switch to it instead.
    mod.service.registerProvider({
      id: 'fixture', name: 'Fixture', supportsToolCalling: false,
      models: async () => [
        { id: 'expensive', name: 'Expensive', contextWindow: 4096, capabilities: ['chat'], costTier: 2 },
        { id: 'cheap', name: 'Cheap', contextWindow: 4096, capabilities: ['chat'], costTier: 0 }
      ],
      async *chat() { yield { type: 'done' as const } }
    })

    await call(IPC_CHANNELS.AI_PROVIDERS_SET_ACTIVE, 'fixture')
    expect(mod.providerRegistry.getActive()?.id).toBe('fixture')
    expect(mod.providerRegistry.getActiveModel()).toBe('cheap')
  })

  it('keeps the current model when it already belongs to the newly-active provider', async () => {
    // `keep-me` is deliberately NOT the cheapest model here (costTier 1 vs.
    // `cheaper`'s costTier 0) — if the "already belongs to this provider"
    // check were ever dropped, the handler would silently recompute the
    // cheapest model and switch away from `keep-me`, and a fixture where
    // keep-me happened to already be cheapest would never catch that.
    mod.service.registerProvider({
      id: 'fixture', name: 'Fixture', supportsToolCalling: false,
      models: async () => [
        { id: 'cheaper', name: 'Cheaper', contextWindow: 4096, capabilities: ['chat'], costTier: 0 },
        { id: 'keep-me', name: 'Keep Me', contextWindow: 4096, capabilities: ['chat'], costTier: 1 }
      ],
      async *chat() { yield { type: 'done' as const } }
    })
    mod.providerRegistry.setActiveModel('keep-me')

    await call(IPC_CHANNELS.AI_PROVIDERS_SET_ACTIVE, 'fixture')
    expect(mod.providerRegistry.getActiveModel()).toBe('keep-me')
  })

  it('throws for an unknown provider id rather than silently no-op-ing', async () => {
    await expect(call(IPC_CHANNELS.AI_PROVIDERS_SET_ACTIVE, 'not-a-real-provider')).rejects.toThrow('Unknown AI provider')
  })
})

describe('startAIModule — perform_app_action tool', () => {
  let mod: AIModule
  let call: <T = unknown>(channel: string, ...args: unknown[]) => Promise<T>
  let broadcast: ReturnType<typeof vi.fn>

  beforeEach(() => {
    const built = buildDeps()
    call = built.call
    broadcast = built.broadcast
    mod = startAIModule(built.deps)
  })

  afterEach(() => { mod.dispose.dispose() })

  it('rejects a call with no actionId without broadcasting anything', async () => {
    const tool = mod.toolRegistry.get('perform_app_action')!
    const result = await tool.execute({}, { connectionId: null })
    expect(result).toMatchObject({ success: false, display: 'No actionId provided' })
    expect(broadcast).not.toHaveBeenCalled()
  })

  it('broadcasts a correlated request and resolves success once the renderer reports back over IPC', async () => {
    const tool = mod.toolRegistry.get('perform_app_action')!
    const resultPromise = tool.execute({ actionId: 'new-connection', params: { foo: 'bar' } }, { connectionId: null })

    expect(broadcast).toHaveBeenCalledWith(
      IPC_EVENTS.APP_ACTION_PERFORM,
      expect.objectContaining({ actionId: 'new-connection', params: { foo: 'bar' } })
    )
    const requestId = (broadcast.mock.calls[0][1] as { requestId: string }).requestId

    // Simulate the renderer's response arriving over the APP_ACTION_RESULT channel.
    await call(IPC_CHANNELS.APP_ACTION_RESULT, { requestId, success: true })

    const result = await resultPromise
    expect(result).toEqual({ success: true, data: { actionId: 'new-connection' }, display: 'new-connection' })
  })

  it('resolves with failure when the renderer reports the action failed', async () => {
    const tool = mod.toolRegistry.get('perform_app_action')!
    const resultPromise = tool.execute({ actionId: 'open-thing' }, { connectionId: null })
    const requestId = (broadcast.mock.calls[0][1] as { requestId: string }).requestId

    await call(IPC_CHANNELS.APP_ACTION_RESULT, { requestId, success: false, error: 'no such action' })

    const result = await resultPromise
    expect(result).toEqual({ success: false, data: null, display: 'no such action' })
  })

  it('ignores an APP_ACTION_RESULT for an id nobody is waiting on', async () => {
    // A stale/duplicate response after the original request already timed out
    // or resolved must not throw. Nothing to assert but the lack of a throw.
    await expect(call(IPC_CHANNELS.APP_ACTION_RESULT, { requestId: 'no-such-id', success: true })).resolves.toBeUndefined()
  })

  it('times out after 10s with no renderer response', async () => {
    vi.useFakeTimers()
    try {
      const tool = mod.toolRegistry.get('perform_app_action')!
      const resultPromise = tool.execute({ actionId: 'slow-action' }, { connectionId: null })
      await vi.advanceTimersByTimeAsync(10_000)
      const result = await resultPromise
      expect(result).toMatchObject({ success: false, display: 'No response from the app (timed out)' })
    } finally {
      vi.useRealTimers()
    }
  })

  it('dispose() rejects any still-pending app action rather than leaving it hanging forever', async () => {
    const tool = mod.toolRegistry.get('perform_app_action')!
    const resultPromise = tool.execute({ actionId: 'never-resolves' }, { connectionId: null })
    mod.dispose.dispose()
    const result = await resultPromise
    expect(result).toMatchObject({ success: false, display: 'Shutting down' })
  })
})

describe('startAIModule — AI_PROVIDERS_LIST_CONFIGURED', () => {
  it('reports only providers with a stored key, independent of which is active', async () => {
    const { deps, call } = buildDeps()
    deps.keyring.storeSync('__ai__', 'anthropic', 'sk-ant')
    const mod = startAIModule(deps)
    const configured = await call<{ id: string; name: string }[]>(IPC_CHANNELS.AI_PROVIDERS_LIST_CONFIGURED)
    expect(configured).toEqual([{ id: 'anthropic', name: 'Anthropic' }])
    mod.dispose.dispose()
  })
})
