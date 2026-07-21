// src/main/plugins/bundled/ai/internal/index.ts
import { errorMessage } from '@shared/errors'
import { IPC_CHANNELS, IPC_EVENTS } from '@shared/ipc'
//
// The AI core. Called from src/main/plugins/bundled/ai/index.ts at plugin
// activation time. Nothing in this module talks to Electron's `ipcMain`
// directly — the plugin's PluginContext provides ipc.handle + broadcast.
import { randomUUID } from 'crypto'
import { z } from 'zod'
import { toJsonSchema } from '../../../sdk/tool-schema'
import { PERFORM_APP_ACTION_TOOL_ID, type AIStreamEvent } from '@shared/ai-types'
import { AIProviderRegistry } from './provider-registry'
import { PermissionManager } from './permission-manager'
import { ConversationManager } from './conversation-manager'
import { OpenAIProvider } from './providers/openai'
import { AnthropicProvider } from './providers/anthropic'
import { OllamaProvider, assertSafeOllamaEndpoint } from './providers/ollama'
import type { SchemaAccess, ConnectionAccess, PluginIpc, BroadcastFn, Disposable, KeyringAccess, ToolRegistry } from '../../../sdk/types'
import { TOOL_PERMISSION, TOOL_SURFACE } from '../../../sdk/types'
import type { AttentionHub } from '../../../../attention/attention-hub'
import { createAIEnhancements } from './enhancements'
import { pickCheapestModel } from './pick-cheapest-model'

const AI_KEYRING_NS = '__ai__'

export interface AIDeps {
  keyring: KeyringAccess
  schemaAccess: SchemaAccess
  connectionAccess: ConnectionAccess
  settingsStore: { get(key: string): unknown; set(key: string, value: unknown): void }
  ipc: PluginIpc
  broadcast: BroadcastFn
  toolRegistry: ToolRegistry
  /** Optional attention seam — announces a pending write-tool approval so the
   *  user can be alerted (e.g. an OS notification) when the window isn't focused. */
  attention?: AttentionHub
}

export interface AIService {
  registerProvider: AIProviderRegistry['register']
  registerContextProvider: ConversationManager['registerContextProvider']
}

export interface AIModule {
  providerRegistry: AIProviderRegistry
  toolRegistry: ToolRegistry
  permissionManager: PermissionManager
  conversationManager: ConversationManager
  enhancements: ReturnType<typeof createAIEnhancements>
  service: AIService
  /** Dispose to tear down providers + IPC handlers + streams. */
  dispose: Disposable
}

export function startAIModule(deps: AIDeps): AIModule {
  const providerRegistry = new AIProviderRegistry()
  const toolRegistry = deps.toolRegistry
  const permissionManager = new PermissionManager()

  const savedProfile = deps.settingsStore.get('ai.permissionProfile') as
    | 'read-only' | 'ask-write' | 'auto'
    | undefined
  if (savedProfile === 'read-only' || savedProfile === 'ask-write' || savedProfile === 'auto') {
    permissionManager.setProfile(savedProfile)
  }

  // One-time migration: move legacy plaintext keys from settings.json into the keyring.
  for (const provider of ['openai', 'anthropic'] as const) {
    const legacy = deps.settingsStore.get(`ai.${provider}Key`) as string | undefined
    if (legacy && !deps.keyring.has(AI_KEYRING_NS, provider)) {
      deps.keyring.storeSync(AI_KEYRING_NS, provider, legacy)
    }
    if (legacy) deps.settingsStore.set(`ai.${provider}Key`, '')
  }

  const openai = new OpenAIProvider(() => deps.keyring.retrieveSync(AI_KEYRING_NS, 'openai'))
  const anthropic = new AnthropicProvider(() => deps.keyring.retrieveSync(AI_KEYRING_NS, 'anthropic'))

  const ollamaEndpoint = (deps.settingsStore.get('ai.ollamaEndpoint') as string) || undefined
  const ollama = new OllamaProvider(ollamaEndpoint)

  providerRegistry.register(openai)
  providerRegistry.register(anthropic)
  providerRegistry.register(ollama)

  const savedProvider = deps.settingsStore.get('ai.activeProvider') as string | undefined
  const savedModel = deps.settingsStore.get('ai.activeModel') as string | undefined
  if (savedProvider && providerRegistry.get(savedProvider)) {
    providerRegistry.setActive(savedProvider)
  } else {
    const anthropicKey = deps.keyring.has(AI_KEYRING_NS, 'anthropic')
    const openaiKey = deps.keyring.has(AI_KEYRING_NS, 'openai')
    if (anthropicKey) {
      providerRegistry.setActive('anthropic')
      deps.settingsStore.set('ai.activeProvider', 'anthropic')
    } else if (openaiKey) {
      providerRegistry.setActive('openai')
      deps.settingsStore.set('ai.activeProvider', 'openai')
    }
  }
  if (savedModel) {
    providerRegistry.setActiveModel(savedModel)
  } else if (providerRegistry.getActive()) {
    providerRegistry.getActive()!.models().then(models => {
      // Default to the cheapest model for the vendor rather than whatever the
      // API happens to list first.
      const chosen = pickCheapestModel(models) ?? models[0]
      if (chosen) {
        providerRegistry.setActiveModel(chosen.id)
        deps.settingsStore.set('ai.activeModel', chosen.id)
      }
    })
  }

  /**
   * Cheap schema context: a comma-separated list of table names only. The
   * model can ask for columns/types/keys via the describe_table tool when
   * it actually needs them. A full schema dump cost 2-5k tokens every turn
   * regardless of whether the user's question touched the schema; this
   * keeps the prompt at ~50 tokens for most workspaces.
   */
  const getSchemaContext = async (connectionId: string): Promise<string> => {
    try {
      const summary = await deps.schemaAccess.getSchemaSummary(connectionId)
      const names = summary.tables.map((t: typeof summary.tables[number]) => t.name)
      if (names.length === 0) return ''
      // Soft cap so very wide schemas don't blow the budget.
      const head = names.slice(0, 200).join(', ')
      const more = names.length > 200 ? ` (+${names.length - 200} more — call list_tables)` : ''
      return `Tables in this database: ${head}${more}. Call describe_table for column details when you need them.`
    } catch {
      return ''
    }
  }

  const conversationManager = new ConversationManager({
    providerRegistry,
    toolRegistry,
    permissionManager,
    getSchemaContext,
    getConnectionId: () => deps.connectionAccess.getActiveConnectionId(),
    attention: deps.attention
  })

  const enhancements = createAIEnhancements({
    providerRegistry,
    getSchemaContext,
    conversationManager
  })

  // Correlated request/response for agentic UI actions: the tool broadcasts a
  // request to the renderer and awaits the renderer's outcome, so the tool
  // result honestly reflects whether the action ran.
  const pendingActions = new Map<string, (r: { success: boolean; error?: string }) => void>()
  const APP_ACTION_TIMEOUT_MS = 10_000

  deps.ipc.handle(IPC_CHANNELS.APP_ACTION_RESULT, async (payload: { requestId: string; success: boolean; error?: string }) => {
    const resolve = pendingActions.get(payload.requestId)
    if (resolve) {
      pendingActions.delete(payload.requestId)
      resolve({ success: payload.success, error: payload.error })
    }
  })

  // Generic agentic UI-action tool. Lets the AI invoke any registered renderer
  // app action (built-in or plugin-contributed) by id — the renderer enforces
  // that only safe navigation actions run agentically. AI surface only, so the
  // headless MCP server (which has no renderer) never sees it.
  const appActionTool = toolRegistry.register({
    id: PERFORM_APP_ACTION_TOOL_ID,
    name: 'Perform App Action',
    description: 'Navigate or open something in the Verql UI by action id (see the action catalog). Use for safe navigation/open actions. For anything that changes data, do NOT use this — instead offer a markdown link with a verql://action/<id> href so the user confirms.',
    inputSchema: toJsonSchema(z.object({
      actionId: z.string(),
      params: z.record(z.string(), z.unknown()).optional()
    })),
    permission: TOOL_PERMISSION.READ,
    surfaces: [TOOL_SURFACE.AI],
    execute: async (params) => {
      const actionId = typeof params.actionId === 'string' ? params.actionId : ''
      if (!actionId) return { success: false, data: null, display: 'No actionId provided' }
      const actionParams = (params.params as Record<string, unknown> | undefined) ?? {}
      const requestId = randomUUID()

      const outcome = await new Promise<{ success: boolean; error?: string }>((resolve) => {
        const timer = setTimeout(() => {
          pendingActions.delete(requestId)
          resolve({ success: false, error: 'No response from the app (timed out)' })
        }, APP_ACTION_TIMEOUT_MS)
        pendingActions.set(requestId, (r) => { clearTimeout(timer); resolve(r) })
        deps.broadcast(IPC_EVENTS.APP_ACTION_PERFORM, { requestId, actionId, params: actionParams })
      })

      if (outcome.success) return { success: true, data: { actionId }, display: actionId }
      return { success: false, data: null, display: outcome.error ?? 'Action failed' }
    }
  })

  // ── IPC handlers via PluginContext.ipc ──────────────────────────────────────
  // ctx.ipc.handle already tracks each registration on ctx.subscriptions, so we
  // don't store the disposables here — the plugin host removes the handlers on
  // deactivation. We only need to abort in-flight streams ourselves.
  const activeStreams = new Map<string, AbortController>()
  const h = <A extends unknown[], R>(
    channel: Parameters<PluginIpc['handle']>[0],
    fn: (...args: A) => R | Promise<R>
  ) => { deps.ipc.handle(channel, fn as never) }

  h(IPC_CHANNELS.AI_CHAT_START, async (request: { message: string; connectionId?: string; connectionMeta?: { type: string; driverName: string }; appActionsCatalog?: string; connectionsSummary?: string; notificationsSummary?: string }) => {
    const streamId = randomUUID()
    const controller = new AbortController()
    activeStreams.set(streamId, controller)

    conversationManager.addUserMessage(request.message)

    ;(async () => {
      try {
        for await (const event of conversationManager.chat({
          ...(request.connectionId ? { connectionId: request.connectionId } : {}),
          ...(request.connectionMeta ? { connectionMeta: request.connectionMeta } : {}),
          ...(request.appActionsCatalog ? { appActionsCatalog: request.appActionsCatalog } : {}),
          ...(request.connectionsSummary ? { connectionsSummary: request.connectionsSummary } : {}),
          ...(request.notificationsSummary ? { notificationsSummary: request.notificationsSummary } : {})
        })) {
          deps.broadcast(IPC_EVENTS.AI_CHAT_EVENT, streamId, event)
        }
      } catch (err) {
        deps.broadcast(IPC_EVENTS.AI_CHAT_EVENT, streamId, {
          type: 'error',
          error: errorMessage(err)
        } satisfies AIStreamEvent)
      } finally {
        activeStreams.delete(streamId)
      }
    })()

    return { streamId }
  })

  h(IPC_CHANNELS.AI_CHAT_ABORT, async (streamId: string) => {
    const controller = activeStreams.get(streamId)
    if (controller) {
      controller.abort()
      activeStreams.delete(streamId)
    }
    conversationManager.abort()
  })

  h(IPC_CHANNELS.AI_CHAT_APPROVAL_RESPONSE, async (requestId: string, approved: boolean) => {
    permissionManager.resolveApproval(requestId, approved)
  })

  h(IPC_CHANNELS.AI_PROVIDERS_LIST, async () => providerRegistry.list().map(p => ({ id: p.id, name: p.name })))

  h(IPC_CHANNELS.AI_PROVIDERS_LIST_CONFIGURED, async () => {
    const configured: { id: string; name: string }[] = []
    if (deps.keyring.has(AI_KEYRING_NS, 'anthropic')) configured.push({ id: 'anthropic', name: 'Anthropic' })
    if (deps.keyring.has(AI_KEYRING_NS, 'openai')) configured.push({ id: 'openai', name: 'OpenAI' })
    const ollamaEndpoint = (deps.settingsStore.get('ai.ollamaEndpoint') as string) || 'http://localhost:11434'
    try {
      // Guard the renderer-writable endpoint before the trusted main process
      // fetches it — the same SSRF protection every other Ollama call uses.
      // Without it a renderer could aim the probe at internal/metadata hosts.
      assertSafeOllamaEndpoint(ollamaEndpoint)
      const resp = await fetch(`${ollamaEndpoint}/api/tags`, { signal: AbortSignal.timeout(2000) })
      if (resp.ok) configured.push({ id: 'ollama', name: 'Ollama' })
    } catch { /* unreachable or unsafe endpoint — omit Ollama */ }
    return configured
  })

  h(IPC_CHANNELS.AI_PROVIDERS_SET_ACTIVE, async (providerId: string) => {
    providerRegistry.setActive(providerId)
    deps.settingsStore.set('ai.activeProvider', providerId)

    // Default to the vendor's cheapest model, unless the user's current model
    // already belongs to this provider (respect an explicit choice).
    const provider = providerRegistry.getActive()
    if (provider) {
      const models = await provider.models()
      const current = providerRegistry.getActiveModel()
      if (models.length > 0 && !models.some(m => m.id === current)) {
        const chosen = pickCheapestModel(models) ?? models[0]
        providerRegistry.setActiveModel(chosen.id)
        deps.settingsStore.set('ai.activeModel', chosen.id)
      }
    }
  })

  h(IPC_CHANNELS.AI_PROVIDERS_GET_ACTIVE, async () => {
    const active = providerRegistry.getActive()
    return active ? { id: active.id, name: active.name } : null
  })

  h(IPC_CHANNELS.AI_MODELS_LIST, async () => {
    const active = providerRegistry.getActive()
    if (!active) return []
    return active.models()
  })

  h(IPC_CHANNELS.AI_MODELS_SET_ACTIVE, async (modelId: string) => {
    providerRegistry.setActiveModel(modelId)
    deps.settingsStore.set('ai.activeModel', modelId)
  })

  h(IPC_CHANNELS.AI_MODELS_GET_ACTIVE, async () => providerRegistry.getActiveModel())
  h(IPC_CHANNELS.AI_MESSAGES_LIST, async () => conversationManager.getMessages())
  h(IPC_CHANNELS.AI_MESSAGES_CLEAR, async () => { conversationManager.clearMessages() })
  h(IPC_CHANNELS.AI_MESSAGES_SET, async (messages: Parameters<ConversationManager['setMessages']>[0]) => {
    conversationManager.setMessages(messages)
  })

  h(IPC_CHANNELS.AI_KEYS_HAS, async (provider: 'openai' | 'anthropic') => deps.keyring.has(AI_KEYRING_NS, provider))
  h(IPC_CHANNELS.AI_KEYS_SET, async (provider: 'openai' | 'anthropic', value: string) => {
    deps.keyring.storeSync(AI_KEYRING_NS, provider, value)
  })

  h(IPC_CHANNELS.AI_TOOLS_LIST, async () => toolRegistry.list().map(t => ({
    id: t.id, name: t.name, description: t.description, permission: t.permission
  })))

  h(IPC_CHANNELS.AI_GENERATE_SQL, async (request: Parameters<typeof enhancements.generateSql>[0]) =>
    enhancements.generateSql(request)
  )
  h(IPC_CHANNELS.AI_COMPLETE_SQL, async (request: Parameters<typeof enhancements.completeSql>[0]) =>
    enhancements.completeSql(request)
  )
  h(IPC_CHANNELS.AI_EXPLAIN_RESULTS, async (request: Parameters<typeof enhancements.explainResults>[0]) =>
    enhancements.explainResults(request)
  )

  const explainAborts = new Map<string, AbortController>()

  h(IPC_CHANNELS.AI_EXPLAIN_START, async (request: Parameters<typeof enhancements.explainResultsStream>[0]) => {
    const streamId = randomUUID()
    const controller = new AbortController()
    explainAborts.set(streamId, controller)
    const model = providerRegistry.getActiveModel() ?? 'unknown'

    ;(async () => {
      try {
        const { durationMs } = await enhancements.explainResultsStream(
          request,
          (text) => { deps.broadcast(IPC_EVENTS.AI_EXPLAIN_EVENT, { streamId, kind: 'token', text }) },
          controller.signal,
        )
        deps.broadcast(IPC_EVENTS.AI_EXPLAIN_EVENT, { streamId, kind: 'done', durationMs })
      } catch (err) {
        deps.broadcast(IPC_EVENTS.AI_EXPLAIN_EVENT, { streamId, kind: 'error', message: errorMessage(err) })
      } finally {
        explainAborts.delete(streamId)
      }
    })()

    return { streamId, model }
  })

  h(IPC_CHANNELS.AI_EXPLAIN_ABORT, async (streamId: string) => {
    const controller = explainAborts.get(streamId)
    if (controller) {
      controller.abort()
      explainAborts.delete(streamId)
    }
  })

  h(IPC_CHANNELS.AI_CONVERSATION_SUMMARIZE, async (messages: Parameters<typeof enhancements.summarizeConversation>[0]) =>
    enhancements.summarizeConversation(messages)
  )

  h(IPC_CHANNELS.AI_PERMISSION_GET_PROFILE, async () => permissionManager.getProfile())
  h(IPC_CHANNELS.AI_PERMISSION_SET_PROFILE, async (profile: 'read-only' | 'ask-write' | 'auto') => {
    permissionManager.setProfile(profile)
    deps.settingsStore.set('ai.permissionProfile', profile)
  })

  const service: AIService = {
    registerProvider: (provider) => providerRegistry.register(provider),
    registerContextProvider: (provider) => conversationManager.registerContextProvider(provider)
  }

  const dispose: Disposable = {
    dispose: () => {
      appActionTool.dispose()
      for (const resolve of pendingActions.values()) resolve({ success: false, error: 'Shutting down' })
      pendingActions.clear()
      for (const ctrl of activeStreams.values()) {
        try { ctrl.abort() } catch { /* ignore */ }
      }
      activeStreams.clear()
      for (const ctrl of explainAborts.values()) {
        try { ctrl.abort() } catch { /* ignore */ }
      }
      explainAborts.clear()
    }
  }

  return {
    providerRegistry, toolRegistry, permissionManager, conversationManager,
    enhancements, service, dispose
  }
}
