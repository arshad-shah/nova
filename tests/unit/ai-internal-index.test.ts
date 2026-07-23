// tests/unit/ai-internal-index.test.ts
//
// startAIModule() (internal/index.ts) wiring not already covered by
// ai-module-bootstrap.test.ts: the chat/explain/messages/keys/tools/permission
// IPC handlers, and the async "pick the cheapest model on startup" path.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { IPC_CHANNELS } from '@shared/ipc'
import { startAIModule, type AIDeps, type AIModule } from '../../src/main/plugins/bundled/ai/internal'
import { ToolRegistryImpl } from '../../src/main/plugins/sdk/tool-registry'
import { TOOL_PERMISSION } from '../../src/main/plugins/sdk/types'
import type { KeyringAccess, SchemaAccess, ConnectionAccess, PluginIpc, Disposable } from '../../src/main/plugins/sdk/types'
import type { AIProvider } from '../../src/main/plugins/bundled/ai/internal/types'

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

function fixtureProvider(overrides: Partial<AIProvider> = {}): AIProvider {
  return {
    id: 'fixture',
    name: 'Fixture',
    supportsToolCalling: false,
    models: async () => [
      { id: 'expensive', name: 'Expensive', contextWindow: 4096, capabilities: ['chat'], costTier: 2 },
      { id: 'cheap', name: 'Cheap', contextWindow: 4096, capabilities: ['chat'], costTier: 0 }
    ],
    async *chat() {
      yield { type: 'text', content: 'hello ' }
      yield { type: 'text', content: 'world' }
      yield { type: 'done' as const }
    },
    ...overrides
  }
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

afterEach(() => {
  vi.restoreAllMocks()
})

describe('startAIModule — startup cheapest-model auto-pick', () => {
  it('auto-selects the cheapest model for the default active provider when no model is saved', async () => {
    // No saved provider/model, but an anthropic key is present: startAIModule
    // sets anthropic active, then fires an async models() call and picks the
    // cheapest tier from the real result. Mock the /v1/models fetch so the
    // async branch resolves deterministically.
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({
        data: [
          { id: 'claude-opus-4-1', display_name: 'Claude Opus' },
          { id: 'claude-haiku-4-5', display_name: 'Claude Haiku' },
        ],
        has_more: false,
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    )
    const { deps } = buildDeps()
    deps.keyring.storeSync('__ai__', 'anthropic', 'sk-ant-1')
    const mod = startAIModule(deps)

    expect(mod.providerRegistry.getActive()?.id).toBe('anthropic')
    await vi.waitFor(() => {
      expect(mod.providerRegistry.getActiveModel()).toBe('claude-haiku-4-5')
    })
    expect(deps.settingsStore.get('ai.activeModel')).toBe('claude-haiku-4-5')
    mod.dispose.dispose()
  })

  it('leaves the active model unset when the active provider reports no models', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ data: [], has_more: false }), { status: 200 })
    )
    const { deps } = buildDeps()
    deps.keyring.storeSync('__ai__', 'anthropic', 'sk-ant-1')
    const mod = startAIModule(deps)
    await Promise.resolve()
    await Promise.resolve()
    expect(mod.providerRegistry.getActiveModel()).toBeNull()
    mod.dispose.dispose()
  })
})

describe('startAIModule — AI_PROVIDERS_LIST / AI_PROVIDERS_GET_ACTIVE', () => {
  let mod: AIModule
  let call: <T = unknown>(channel: string, ...args: unknown[]) => Promise<T>

  beforeEach(() => {
    const built = buildDeps()
    call = built.call
    mod = startAIModule(built.deps)
  })
  afterEach(() => mod.dispose.dispose())

  it('lists every registered provider by id/name, including the built-ins', async () => {
    const list = await call<{ id: string; name: string }[]>(IPC_CHANNELS.AI_PROVIDERS_LIST)
    expect(list).toEqual(expect.arrayContaining([
      { id: 'openai', name: 'OpenAI' },
      { id: 'anthropic', name: 'Anthropic' },
      { id: 'ollama', name: 'Ollama' },
    ]))
  })

  it('returns null for the active provider when none is set', async () => {
    const active = await call<{ id: string; name: string } | null>(IPC_CHANNELS.AI_PROVIDERS_GET_ACTIVE)
    expect(active).toBeNull()
  })

  it('returns the active provider once one is registered and selected', async () => {
    mod.service.registerProvider(fixtureProvider())
    mod.providerRegistry.setActive('fixture')
    const active = await call<{ id: string; name: string } | null>(IPC_CHANNELS.AI_PROVIDERS_GET_ACTIVE)
    expect(active).toEqual({ id: 'fixture', name: 'Fixture' })
  })
})

describe('startAIModule — AI_MODELS_*', () => {
  let mod: AIModule
  let call: <T = unknown>(channel: string, ...args: unknown[]) => Promise<T>

  beforeEach(() => {
    const built = buildDeps()
    call = built.call
    mod = startAIModule(built.deps)
    mod.service.registerProvider(fixtureProvider())
    mod.providerRegistry.setActive('fixture')
  })
  afterEach(() => mod.dispose.dispose())

  it('returns [] from AI_MODELS_LIST when no provider is active', async () => {
    mod.providerRegistry.unregister('fixture')
    const models = await call(IPC_CHANNELS.AI_MODELS_LIST)
    expect(models).toEqual([])
  })

  it('lists the active provider models', async () => {
    const models = await call<{ id: string }[]>(IPC_CHANNELS.AI_MODELS_LIST)
    expect(models.map(m => m.id)).toEqual(['expensive', 'cheap'])
  })

  it('sets the active model and persists it to settings', async () => {
    const built = buildDeps()
    const mod2 = startAIModule(built.deps)
    await built.call(IPC_CHANNELS.AI_MODELS_SET_ACTIVE, 'some-model-id')
    expect(mod2.providerRegistry.getActiveModel()).toBe('some-model-id')
    expect(built.deps.settingsStore.get('ai.activeModel')).toBe('some-model-id')
    expect(await built.call(IPC_CHANNELS.AI_MODELS_GET_ACTIVE)).toBe('some-model-id')
    mod2.dispose.dispose()
  })
})

describe('startAIModule — AI_MESSAGES_*', () => {
  let mod: AIModule
  let call: <T = unknown>(channel: string, ...args: unknown[]) => Promise<T>

  beforeEach(() => {
    const built = buildDeps()
    call = built.call
    mod = startAIModule(built.deps)
  })
  afterEach(() => mod.dispose.dispose())

  it('lists messages added to the conversation', async () => {
    mod.conversationManager.addUserMessage('hi there')
    const messages = await call<{ content: string }[]>(IPC_CHANNELS.AI_MESSAGES_LIST)
    expect(messages).toHaveLength(1)
    expect(messages[0].content).toBe('hi there')
  })

  it('clears messages', async () => {
    mod.conversationManager.addUserMessage('hi there')
    await call(IPC_CHANNELS.AI_MESSAGES_CLEAR)
    expect(await call<unknown[]>(IPC_CHANNELS.AI_MESSAGES_LIST)).toEqual([])
  })

  it('replaces the whole message list wholesale', async () => {
    mod.conversationManager.addUserMessage('old message')
    const replacement = [{ id: 'x', role: 'user' as const, content: 'new message', timestamp: 0 }]
    await call(IPC_CHANNELS.AI_MESSAGES_SET, replacement)
    const messages = await call<{ content: string }[]>(IPC_CHANNELS.AI_MESSAGES_LIST)
    expect(messages).toEqual(replacement)
  })
})

describe('startAIModule — AI_KEYS_*', () => {
  it('reports has=false before a key is set and true after AI_KEYS_SET', async () => {
    const { deps, call } = buildDeps()
    const mod = startAIModule(deps)
    expect(await call(IPC_CHANNELS.AI_KEYS_HAS, 'openai')).toBe(false)
    await call(IPC_CHANNELS.AI_KEYS_SET, 'openai', 'sk-new-key')
    expect(await call(IPC_CHANNELS.AI_KEYS_HAS, 'openai')).toBe(true)
    expect(deps.keyring.retrieveSync('__ai__', 'openai')).toBe('sk-new-key')
    mod.dispose.dispose()
  })
})

describe('startAIModule — AI_TOOLS_LIST', () => {
  it('includes the perform_app_action tool registered at startup', async () => {
    const { deps, call } = buildDeps()
    const mod = startAIModule(deps)
    const tools = await call<{ id: string; permission: string }[]>(IPC_CHANNELS.AI_TOOLS_LIST)
    expect(tools.some(t => t.id === 'perform_app_action')).toBe(true)
    const paa = tools.find(t => t.id === 'perform_app_action')!
    expect(paa.permission).toBe(TOOL_PERMISSION.READ)
    mod.dispose.dispose()
  })
})

describe('startAIModule — AI_PERMISSION_*', () => {
  it('defaults to ask-write and can be changed + persisted', async () => {
    const { deps, call } = buildDeps()
    const mod = startAIModule(deps)
    expect(await call(IPC_CHANNELS.AI_PERMISSION_GET_PROFILE)).toBe('ask-write')
    await call(IPC_CHANNELS.AI_PERMISSION_SET_PROFILE, 'read-only')
    expect(await call(IPC_CHANNELS.AI_PERMISSION_GET_PROFILE)).toBe('read-only')
    expect(deps.settingsStore.get('ai.permissionProfile')).toBe('read-only')
    mod.dispose.dispose()
  })

  it('restores a previously saved permission profile at startup', async () => {
    const { deps, call } = buildDeps({ settings: { 'ai.permissionProfile': 'auto' } })
    const mod = startAIModule(deps)
    expect(await call(IPC_CHANNELS.AI_PERMISSION_GET_PROFILE)).toBe('auto')
    mod.dispose.dispose()
  })
})

describe('startAIModule — AI_CHAT_START / AI_CHAT_ABORT', () => {
  let mod: AIModule
  let call: <T = unknown>(channel: string, ...args: unknown[]) => Promise<T>
  let broadcast: ReturnType<typeof vi.fn>

  beforeEach(() => {
    const built = buildDeps()
    call = built.call
    broadcast = built.broadcast
    mod = startAIModule(built.deps)
    mod.service.registerProvider(fixtureProvider())
    mod.providerRegistry.setActive('fixture')
    mod.providerRegistry.setActiveModel('cheap')
  })
  afterEach(() => mod.dispose.dispose())

  it('streams chat events over broadcast and records the user message', async () => {
    const { streamId } = await call<{ streamId: string }>(IPC_CHANNELS.AI_CHAT_START, { message: 'hello ai' })
    expect(streamId).toBeTruthy()

    // Let the async IIFE inside the handler drain the fixture's chat() generator.
    await vi.waitFor(() => {
      expect(broadcast).toHaveBeenCalledWith(
        expect.stringContaining('ai:chat'),
        streamId,
        expect.objectContaining({ type: 'done' })
      )
    })

    const messages = mod.conversationManager.getMessages()
    expect(messages.some(m => m.role === 'user' && m.content === 'hello ai')).toBe(true)

    const textEvents = broadcast.mock.calls
      .filter(c => c[1] === streamId && (c[2] as { type: string }).type === 'chunk')
      .map(c => (c[2] as { content: string }).content)
    expect(textEvents.join('')).toBe('hello world')
  })

  it('broadcasts an error event when the provider chat() throws', async () => {
    mod.service.registerProvider(fixtureProvider({
      id: 'broken',
      // eslint-disable-next-line require-yield
      async *chat(): AsyncIterable<never> {
        throw new Error('provider exploded')
      }
    }))
    mod.providerRegistry.setActive('broken')

    const { streamId } = await call<{ streamId: string }>(IPC_CHANNELS.AI_CHAT_START, { message: 'trigger failure' })

    await vi.waitFor(() => {
      expect(broadcast).toHaveBeenCalledWith(
        expect.stringContaining('ai:chat'),
        streamId,
        expect.objectContaining({ type: 'error', error: expect.stringContaining('provider exploded') })
      )
    })
  })

  it('aborts an in-flight stream without throwing, and abort on an unknown id is a no-op', async () => {
    const { streamId } = await call<{ streamId: string }>(IPC_CHANNELS.AI_CHAT_START, { message: 'hi' })
    await expect(call(IPC_CHANNELS.AI_CHAT_ABORT, streamId)).resolves.toBeUndefined()
    await expect(call(IPC_CHANNELS.AI_CHAT_ABORT, 'not-a-real-stream-id')).resolves.toBeUndefined()
  })
})

describe('startAIModule — AI_CHAT_APPROVAL_RESPONSE', () => {
  it('resolves a pending permission-manager approval by requestId', async () => {
    const { deps, call } = buildDeps()
    const mod = startAIModule(deps)
    const requestId = mod.permissionManager.createApprovalRequest('some_tool', {}, 'display text')
    const pending = mod.permissionManager.waitForApproval(requestId)
    await call(IPC_CHANNELS.AI_CHAT_APPROVAL_RESPONSE, requestId, true)
    expect(await pending).toBe(true)
    mod.dispose.dispose()
  })
})

describe('startAIModule — enhancements IPC handlers', () => {
  let mod: AIModule
  let call: <T = unknown>(channel: string, ...args: unknown[]) => Promise<T>

  beforeEach(() => {
    const built = buildDeps()
    call = built.call
    mod = startAIModule(built.deps)
    mod.service.registerProvider(fixtureProvider({
      async *chat() {
        yield { type: 'text', content: 'SELECT 1' }
        yield { type: 'done' as const }
      }
    }))
    mod.providerRegistry.setActive('fixture')
    mod.providerRegistry.setActiveModel('cheap')
  })
  afterEach(() => mod.dispose.dispose())

  it('AI_GENERATE_SQL delegates to enhancements.generateSql and returns { sql }', async () => {
    const result = await call<{ sql: string }>(IPC_CHANNELS.AI_GENERATE_SQL, {
      prompt: 'all users', connectionId: 'conn-1'
    })
    expect(result).toEqual({ sql: 'SELECT 1' })
  })

  it('AI_COMPLETE_SQL delegates to enhancements.completeSql', async () => {
    const result = await call<{ completion: string }>(IPC_CHANNELS.AI_COMPLETE_SQL, {
      sql: 'SELECT * FROM', cursorOffset: 13, connectionId: 'conn-1'
    })
    expect(result).toEqual({ completion: 'SELECT 1' })
  })

  it('AI_EXPLAIN_RESULTS returns explanation/model/durationMs', async () => {
    const result = await call<{ explanation: string; model: string; durationMs: number }>(
      IPC_CHANNELS.AI_EXPLAIN_RESULTS,
      { sql: 'SELECT 1', columns: ['a'], rowCount: 1, sampleRows: [{ a: 1 }] }
    )
    expect(result.explanation).toBe('SELECT 1')
    expect(result.model).toBe('cheap')
    expect(typeof result.durationMs).toBe('number')
  })

  it('AI_CONVERSATION_SUMMARIZE summarizes the given messages', async () => {
    const result = await call<{ summary: string }>(IPC_CHANNELS.AI_CONVERSATION_SUMMARIZE, [
      { id: '1', role: 'user', content: 'hi', timestamp: 0 },
      { id: '2', role: 'assistant', content: 'hello', timestamp: 1 },
    ])
    expect(result).toEqual({ summary: 'SELECT 1' })
  })

  it('AI_EXPLAIN_START streams tokens then a done event, and returns the active model', async () => {
    const built = await (async () => {
      const b = buildDeps()
      const m = startAIModule(b.deps)
      m.service.registerProvider(fixtureProvider({
        async *chat() {
          yield { type: 'text', content: 'It ' }
          yield { type: 'text', content: 'means X.' }
          yield { type: 'done' as const }
        }
      }))
      m.providerRegistry.setActive('fixture')
      m.providerRegistry.setActiveModel('cheap')
      return { ...b, mod: m }
    })()

    const { streamId, model } = await built.call<{ streamId: string; model: string }>(
      IPC_CHANNELS.AI_EXPLAIN_START,
      { sql: 'SELECT 1', columns: ['a'], rowCount: 1, sampleRows: [] }
    )
    expect(model).toBe('cheap')

    await vi.waitFor(() => {
      expect(built.broadcast).toHaveBeenCalledWith(
        expect.stringContaining('ai:explain'),
        expect.objectContaining({ streamId, kind: 'done' })
      )
    })

    const tokens = built.broadcast.mock.calls
      .filter(c => (c[1] as { streamId: string; kind: string }).streamId === streamId && (c[1] as { kind: string }).kind === 'token')
      .map(c => (c[1] as { text: string }).text)
    expect(tokens.join('')).toBe('It means X.')
    built.mod.dispose.dispose()
  })

  it('AI_EXPLAIN_ABORT aborts a running explain stream without throwing', async () => {
    const { streamId } = await call<{ streamId: string }>(
      IPC_CHANNELS.AI_EXPLAIN_START,
      { sql: 'SELECT 1', columns: [], rowCount: 0, sampleRows: [] }
    )
    await expect(call(IPC_CHANNELS.AI_EXPLAIN_ABORT, streamId)).resolves.toBeUndefined()
    await expect(call(IPC_CHANNELS.AI_EXPLAIN_ABORT, 'unknown-id')).resolves.toBeUndefined()
  })
})

describe('startAIModule — dispose', () => {
  it('disposing twice / after use tears down without throwing', () => {
    const { deps } = buildDeps()
    const mod = startAIModule(deps)
    expect(() => mod.dispose.dispose()).not.toThrow()
  })
})
