import { create } from 'zustand'
import type {
  AIChatMessage,
  AIProviderInfo,
  AIModelInfo,
  AIApprovalRequest,
  AIStreamEvent
} from '@shared/ai-types'
import type { MCPApprovalRequest } from '@shared/mcp'
import { IPC_CHANNELS, IPC_EVENTS } from '@shared/ipc'
import { parseAppError } from '@/lib/db-error'
import { notifyError } from '@/lib/notify-error'
import { useUiStore, PLUGIN_PANEL_PREFIX } from './ui'
import { useConnectionsStore, getActiveProfile } from './connections'
import { useNotificationsStore } from './notifications'
import { appActions } from '@/lib/app-actions/registry'

// The AI plugin's secondary-sidebar panel id. `SecondaryPanelId` (stores/ui.ts)
// stays open (`string & {}`) precisely so plugin-namespaced ids like this one
// can be used — centralised here (not stores/ui.ts) since the AI plugin owns it.
export const AI_CHAT_PANEL_ID = `${PLUGIN_PANEL_PREFIX}ai-chat` as const

interface SessionStats {
  totalInputTokens: number
  totalOutputTokens: number
  toolCallCount: number
}

export interface Conversation {
  id: string
  title: string
  messages: AIChatMessage[]
  stats: SessionStats
  createdAt: number
  updatedAt: number
}

interface AIState {
  messages: AIChatMessage[]
  isStreaming: boolean
  isAwaitingResponse: boolean
  streamingContent: string
  activeProvider: AIProviderInfo | null
  activeModel: string | null
  providers: AIProviderInfo[]
  models: AIModelInfo[]
  panelOpen: boolean
  pendingApproval: AIApprovalRequest | null
  currentStreamId: string | null
  mcpPendingApproval: MCPApprovalRequest | null
  sessionStats: SessionStats
  conversations: Conversation[]
  activeConversationId: string | null
  /** One-shot composer seed: the next mount/render of ChatInput should overwrite its input with this string and call `clearComposerSeed`. */
  composerSeed: string | null
  permissionProfile: 'read-only' | 'ask-write' | 'auto'

  // Actions
  hydrate: () => Promise<void>
  togglePanel: () => void
  openPanel: () => void
  sendMessage: (message: string, connectionId?: string, connectionMeta?: { type: string; driverName: string }) => Promise<void>
  clearMessages: () => Promise<void>
  newConversation: () => void
  switchConversation: (id: string) => Promise<void>
  deleteConversation: (id: string) => Promise<void>
  renameConversation: (id: string, title: string) => void
  branchConversation: (fromMessageId: string) => Promise<void>
  compactConversation: (keepLast?: number) => Promise<void>
  isCompacting: boolean
  lastPreCompactMessages: AIChatMessage[] | null
  autoCompactSuppressed: Record<string, boolean>
  undoLastCompact: () => Promise<void>
  suppressAutoCompactForActive: () => void
  retryLast: () => void
  abort: () => Promise<void>
  seedComposer: (text: string) => void
  clearComposerSeed: () => void
  loadPermissionProfile: () => Promise<void>
  setPermissionProfile: (p: 'read-only' | 'ask-write' | 'auto') => Promise<void>
  loadProviders: () => Promise<void>
  loadConfiguredProviders: () => Promise<void>
  loadModels: () => Promise<void>
  setActiveProvider: (provider: AIProviderInfo | null) => Promise<void>
  setActiveModel: (model: string | null) => Promise<void>
  respondToApproval: (requestId: string, approved: boolean) => Promise<void>
  respondToMCPApproval: (requestId: string, approved: boolean) => Promise<void>
  handleStreamEvent: (event: AIStreamEvent) => void
}

const EMPTY_STATS: SessionStats = { totalInputTokens: 0, totalOutputTokens: 0, toolCallCount: 0 }

// Legacy localStorage key, read once on hydrate and migrated into the SQLite
// app-data store (see docs/proposals/internal-app-data-store.md). Conversations
// now persist in the main process; nothing writes this key anymore.
const LEGACY_CONV_KEY = 'verql:ai-conversations'
const DEFAULT_TITLE = 'New chat'

function createConversation(): Conversation {
  const now = Date.now()
  return { id: crypto.randomUUID(), title: DEFAULT_TITLE, messages: [], stats: { ...EMPTY_STATS }, createdAt: now, updatedAt: now }
}

/** Title a conversation from its first user message (single line, capped). */
function deriveTitle(content: string): string {
  const firstLine = content.trim().split('\n')[0].trim()
  if (!firstLine) return DEFAULT_TITLE
  return firstLine.length > 48 ? `${firstLine.slice(0, 47)}…` : firstLine
}

const hasIpc = (): boolean => typeof window !== 'undefined' && !!window.electronAPI

/** Replace one conversation (and its messages) in the app-data store. */
function persistConversation(c: Conversation): void {
  if (!hasIpc()) return
  void window.electronAPI.invoke(IPC_CHANNELS.APPDATA_CONVERSATIONS_UPSERT, c)
}

/** Remember the active conversation across restarts. */
function persistActiveId(id: string | null): void {
  if (!hasIpc()) return
  void window.electronAPI.invoke(IPC_CHANNELS.APPDATA_CONVERSATIONS_SET_ACTIVE, id)
}

function deleteConversationRemote(id: string): void {
  if (!hasIpc()) return
  void window.electronAPI.invoke(IPC_CHANNELS.APPDATA_CONVERSATIONS_DELETE, id)
}

/** Read the pre-SQLite localStorage payload for one-time migration. */
function readLegacyConversations(): { conversations: Conversation[]; activeConversationId: string | null } | null {
  try {
    if (typeof localStorage === 'undefined') return null
    const raw = localStorage.getItem(LEGACY_CONV_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { conversations?: Conversation[]; activeConversationId?: string | null }
    return {
      conversations: Array.isArray(parsed.conversations) ? parsed.conversations : [],
      activeConversationId: parsed.activeConversationId ?? null,
    }
  } catch {
    return null
  }
}

// Synchronous placeholder so the store is valid before `hydrate()` resolves.
// The real conversation set loads from the main process on app boot.
const initialConversations = (() => {
  const c = createConversation()
  return {
    conversations: [c],
    activeConversationId: c.id,
    messages: [] as AIChatMessage[],
    sessionStats: { ...EMPTY_STATS },
  }
})()

export const useAIStore = create<AIState>((set, get) => ({
  messages: initialConversations.messages,
  isStreaming: false,
  isAwaitingResponse: false,
  streamingContent: '',
  activeProvider: null,
  activeModel: null,
  providers: [],
  models: [],
  panelOpen: false,
  pendingApproval: null,
  currentStreamId: null,
  mcpPendingApproval: null,
  sessionStats: initialConversations.sessionStats,
  conversations: initialConversations.conversations,
  activeConversationId: initialConversations.activeConversationId,
  composerSeed: null,
  permissionProfile: 'ask-write',
  lastPreCompactMessages: null,
  autoCompactSuppressed: {},

  hydrate: async () => {
    if (!hasIpc()) return
    const snapshot = await window.electronAPI.invoke(IPC_CHANNELS.APPDATA_CONVERSATIONS_LIST)
    let conversations = snapshot.conversations as Conversation[]
    let activeId = snapshot.activeConversationId

    // One-time migration: if the store is empty but a legacy localStorage blob
    // exists, import it into SQLite, then drop the legacy key. Only delete the
    // source after the import IPC resolves so a failure retries next launch.
    if (conversations.length === 0) {
      const legacy = readLegacyConversations()
      if (legacy && legacy.conversations.length > 0) {
        await window.electronAPI.invoke(
          IPC_CHANNELS.APPDATA_CONVERSATIONS_IMPORT,
          legacy.conversations,
          legacy.activeConversationId,
        )
        try { localStorage.removeItem(LEGACY_CONV_KEY) } catch { /* ignore */ }
        conversations = legacy.conversations
        activeId = legacy.activeConversationId
      }
    }

    // Nothing stored yet — seed a fresh conversation and persist it.
    if (conversations.length === 0) {
      const c = createConversation()
      conversations = [c]
      activeId = c.id
      persistConversation(c)
      persistActiveId(c.id)
    }

    if (!activeId || !conversations.some((c) => c.id === activeId)) {
      activeId = conversations[0].id
    }
    const active = conversations.find((c) => c.id === activeId)!
    set({
      conversations,
      activeConversationId: activeId,
      messages: active.messages,
      sessionStats: { ...active.stats },
    })

    // The main process starts each launch with no chat history. Seed it with the
    // restored active conversation so continuing it after a restart keeps full
    // context (otherwise only the next message would be sent).
    if (active.messages.length > 0) {
      await window.electronAPI.invoke(IPC_CHANNELS.AI_MESSAGES_SET, active.messages)
    }
  },

  togglePanel: () => {
    const ui = useUiStore.getState()
    const target = AI_CHAT_PANEL_ID
    const isActive = ui.secondaryActivePanel === target && ui.secondarySidebarVisible
    if (isActive) {
      ui.toggleSecondarySidebar()
    } else {
      ui.setSecondaryActivePanel(target)
    }
    set({ panelOpen: !isActive })
  },

  openPanel: () => {
    useUiStore.getState().setSecondaryActivePanel(AI_CHAT_PANEL_ID)
    set({ panelOpen: true })
  },

  sendMessage: async (message, connectionId, connectionMeta) => {
    const userMsg: AIChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: message,
      timestamp: Date.now()
    }
    set((s) => ({ messages: [...s.messages, userMsg], isAwaitingResponse: true }))

    const appActionsCatalog = appActions.describeForPrompt()
    const { connections, connectedIds, activeConnectionId } = useConnectionsStore.getState()
    // Send only the connections that aren't the active one — the active one
    // is already named in connectionMeta. When there's only one connection
    // we send nothing. Keeps the prompt small in the common single-connection
    // workspace.
    const others = connections.filter((c) => c.id !== activeConnectionId)
    const connectionsSummary = others.length > 0
      ? others
          .map((c) => {
            const state = connectedIds.has(c.id) ? 'connected' : 'not connected'
            return `- ${c.name} (${c.type}) — ${state} [id: ${c.id}]`
          })
          .join('\n')
      : ''
    // Cap notifications at 3 (was 6) and drop the message body — title alone
    // is usually enough for the AI to mention the latest error.
    const notificationsSummary = useNotificationsStore
      .getState()
      .notifications.filter((n) => n.type === 'error' || n.type === 'warning')
      .slice(0, 3)
      .map((n) => `- [${n.type}] ${n.title}`)
      .join('\n')
    const result = await window.electronAPI.invoke(IPC_CHANNELS.AI_CHAT_START, {
      message,
      ...(connectionId ? { connectionId } : {}),
      ...(connectionMeta ? { connectionMeta } : {}),
      ...(appActionsCatalog ? { appActionsCatalog } : {}),
      ...(connectionsSummary ? { connectionsSummary } : {}),
      ...(notificationsSummary ? { notificationsSummary } : {}),
    }) as { streamId: string }

    set({ isStreaming: true, currentStreamId: result.streamId, streamingContent: '' })
  },

  clearMessages: async () => {
    await window.electronAPI.invoke(IPC_CHANNELS.AI_MESSAGES_CLEAR)
    set({ messages: [], sessionStats: { ...EMPTY_STATS } })
  },

  newConversation: () => {
    const { isStreaming, abort } = get()
    if (isStreaming) void abort()
    const c = createConversation()
    set((s) => ({
      conversations: [c, ...s.conversations],
      activeConversationId: c.id,
      messages: [],
      sessionStats: { ...EMPTY_STATS },
      streamingContent: '',
      pendingApproval: null
    }))
    void window.electronAPI.invoke(IPC_CHANNELS.AI_MESSAGES_CLEAR)
    persistConversation(c)
    persistActiveId(c.id)
  },

  switchConversation: async (id) => {
    const { activeConversationId, conversations, isStreaming, abort } = get()
    if (id === activeConversationId) return
    const target = conversations.find((c) => c.id === id)
    if (!target) return
    if (isStreaming) await abort()
    set({
      activeConversationId: id,
      messages: target.messages,
      sessionStats: { ...target.stats },
      streamingContent: '',
      pendingApproval: null,
      lastPreCompactMessages: null,
    })
    await window.electronAPI.invoke(IPC_CHANNELS.AI_MESSAGES_SET, target.messages)
    persistActiveId(id)
  },

  deleteConversation: async (id) => {
    const filtered = get().conversations.filter((c) => c.id !== id)
    // Deleting the last conversation leaves a fresh empty one in its place.
    const replacement = filtered.length === 0 ? createConversation() : null
    const next = replacement ? [replacement] : filtered
    set({ conversations: next })
    deleteConversationRemote(id)
    if (replacement) persistConversation(replacement)
    if (get().activeConversationId === id) {
      if (get().isStreaming) await get().abort()
      const fallback = next[0]
      set({
        activeConversationId: fallback.id,
        messages: fallback.messages,
        sessionStats: { ...fallback.stats },
        streamingContent: '',
        pendingApproval: null
      })
      await window.electronAPI.invoke(IPC_CHANNELS.AI_MESSAGES_SET, fallback.messages)
    }
    persistActiveId(get().activeConversationId)
  },

  renameConversation: (id, title) => {
    const trimmed = title.trim()
    const next = get().conversations.map((c) =>
      c.id === id ? { ...c, title: trimmed || c.title, updatedAt: Date.now() } : c
    )
    set({ conversations: next })
    const renamed = next.find((c) => c.id === id)
    if (renamed) persistConversation(renamed)
  },

  isCompacting: false,

  /**
   * Summarize all messages except the last `keepLast` (default 2) into a single
   * system message, replacing the older history. Keeps the conversation usable
   * but trims tokens. No-op when the conversation is too short to be worth
   * compacting (< 6 messages).
   */
  compactConversation: async (keepLast = 2) => {
    const { messages, conversations, activeConversationId, isStreaming, abort, isCompacting } = get()
    if (isCompacting) return
    if (isStreaming) await abort()
    if (messages.length < 6) return
    if (keepLast < 0) keepLast = 0

    const snapshot = messages
    const toSummarize = messages.slice(0, messages.length - keepLast)
    const tail = messages.slice(messages.length - keepLast)
    set({ isCompacting: true })
    try {
      const { summary } = await window.electronAPI.invoke(
        IPC_CHANNELS.AI_CONVERSATION_SUMMARIZE,
        toSummarize,
      ) as { summary: string }

      const summaryMsg: AIChatMessage = {
        id: crypto.randomUUID(),
        role: 'system',
        content: `Summary of earlier conversation:\n\n${summary}`,
        timestamp: Date.now(),
      }
      const newMessages: AIChatMessage[] = [summaryMsg, ...tail]

      const nextConversations = conversations.map((c) =>
        c.id === activeConversationId ? { ...c, messages: newMessages, updatedAt: Date.now() } : c
      )
      set({
        messages: newMessages,
        conversations: nextConversations,
        sessionStats: { ...EMPTY_STATS },
        streamingContent: '',
        lastPreCompactMessages: snapshot,
      })
      await window.electronAPI.invoke(IPC_CHANNELS.AI_MESSAGES_SET, newMessages)
      const compacted = nextConversations.find((c) => c.id === activeConversationId)
      if (compacted) persistConversation(compacted)
    } finally {
      set({ isCompacting: false })
    }
  },

  undoLastCompact: async () => {
    const { lastPreCompactMessages, conversations, activeConversationId } = get()
    if (!lastPreCompactMessages) return
    const nextConversations = conversations.map((c) =>
      c.id === activeConversationId ? { ...c, messages: lastPreCompactMessages, updatedAt: Date.now() } : c
    )
    set({
      messages: lastPreCompactMessages,
      conversations: nextConversations,
      lastPreCompactMessages: null,
    })
    await window.electronAPI.invoke(IPC_CHANNELS.AI_MESSAGES_SET, lastPreCompactMessages)
    const restored = nextConversations.find((c) => c.id === activeConversationId)
    if (restored) persistConversation(restored)
  },

  suppressAutoCompactForActive: () => {
    const id = get().activeConversationId
    if (!id) return
    set((s) => ({ autoCompactSuppressed: { ...s.autoCompactSuppressed, [id]: true } }))
  },

  branchConversation: async (fromMessageId) => {
    const { messages, conversations, activeConversationId, isStreaming, abort } = get()
    const idx = messages.findIndex((m) => m.id === fromMessageId)
    if (idx < 0) return
    if (isStreaming) await abort()
    // History up to and including the branch point; the user continues from here
    // in a separate conversation, leaving the original untouched.
    const prefix = messages.slice(0, idx + 1).map((m) => ({ ...m }))
    const active = conversations.find((c) => c.id === activeConversationId)
    const base = active && active.title !== DEFAULT_TITLE
      ? active.title
      : deriveTitle(messages.find((m) => m.role === 'user')?.content ?? DEFAULT_TITLE)
    const now = Date.now()
    const branched: Conversation = {
      id: crypto.randomUUID(),
      title: `${base} (branch)`,
      messages: prefix,
      stats: { ...EMPTY_STATS },
      createdAt: now,
      updatedAt: now
    }
    set((s) => ({
      conversations: [branched, ...s.conversations],
      activeConversationId: branched.id,
      messages: prefix,
      sessionStats: { ...EMPTY_STATS },
      streamingContent: '',
      pendingApproval: null
    }))
    await window.electronAPI.invoke(IPC_CHANNELS.AI_MESSAGES_SET, prefix)
    persistConversation(branched)
    persistActiveId(branched.id)
  },

  retryLast: () => {
    const { messages, isStreaming, sendMessage } = get()
    if (isStreaming) return
    const lastUser = [...messages].reverse().find((m) => m.role === 'user')
    if (!lastUser) return
    const { activeConnectionId } = useConnectionsStore.getState()
    const conn = getActiveProfile()
    const meta = conn ? { type: conn.type, driverName: conn.type } : undefined
    sendMessage(lastUser.content, activeConnectionId ?? undefined, meta)
  },

  abort: async () => {
    const { currentStreamId, messages, pendingApproval } = get()
    if (currentStreamId) {
      await window.electronAPI.invoke(IPC_CHANNELS.AI_CHAT_ABORT, currentStreamId)
    }

    // Reconcile any tool calls that were mid-flight. Without this, ToolCallCard
    // shows a spinner forever (it watches for a `tool` message keyed by the
    // call id and never finds one when the stream was killed before the
    // tool-result event landed).
    const settledIds = new Set(messages.filter((m) => m.role === 'tool' && m.toolCallId).map((m) => m.toolCallId!))
    const cancelMsgs: AIChatMessage[] = []
    for (const m of messages) {
      if (!m.toolCalls?.length) continue
      for (const call of m.toolCalls) {
        if (!settledIds.has(call.id)) {
          cancelMsgs.push({
            id: crypto.randomUUID(),
            role: 'tool',
            content: 'Cancelled',
            toolCallId: call.id,
            timestamp: Date.now(),
          })
        }
      }
    }
    // Resolve any open approval prompt with "rejected" so it doesn't hang the
    // chat-loop in the plugin (waitForApproval would otherwise sit forever).
    if (pendingApproval) {
      await window.electronAPI.invoke(IPC_CHANNELS.AI_CHAT_APPROVAL_RESPONSE, pendingApproval.requestId, false)
    }

    set((s) => ({
      isStreaming: false,
      isAwaitingResponse: false,
      streamingContent: '',
      currentStreamId: null,
      pendingApproval: null,
      messages: cancelMsgs.length > 0 ? [...s.messages, ...cancelMsgs] : s.messages,
    }))
  },

  loadProviders: async () => {
    const res = await window.electronAPI.invoke(IPC_CHANNELS.AI_PROVIDERS_LIST)
    set({ providers: Array.isArray(res) ? (res as AIProviderInfo[]) : [] })
  },

  loadConfiguredProviders: async () => {
    const res = await window.electronAPI.invoke(IPC_CHANNELS.AI_PROVIDERS_LIST_CONFIGURED)
    const providers = Array.isArray(res) ? (res as AIProviderInfo[]) : []
    set({ providers })

    // Auto-select if only one configured
    const { activeProvider } = get()
    if (providers.length === 1 && activeProvider?.id !== providers[0].id) {
      await get().setActiveProvider(providers[0])
    } else if (providers.length > 0 && !activeProvider) {
      // Restore active from the list
      const active = await window.electronAPI.invoke(IPC_CHANNELS.AI_PROVIDERS_GET_ACTIVE) as AIProviderInfo | null
      if (active && providers.some(p => p.id === active.id)) {
        set({ activeProvider: active })
      } else {
        await get().setActiveProvider(providers[0])
      }
    }
  },

  loadModels: async () => {
    const res = await window.electronAPI.invoke(IPC_CHANNELS.AI_MODELS_LIST)
    set({ models: Array.isArray(res) ? (res as AIModelInfo[]) : [] })
  },

  setActiveProvider: async (provider) => {
    if (provider) {
      await window.electronAPI.invoke(IPC_CHANNELS.AI_PROVIDERS_SET_ACTIVE, provider.id)
    }
    set({ activeProvider: provider })
    // Reload models for the new provider, then mirror the active model main
    // chose (it defaults to the vendor's cheapest when switching providers).
    const models = await window.electronAPI.invoke(IPC_CHANNELS.AI_MODELS_LIST) as AIModelInfo[]
    set({ models })
    const activeModel = await window.electronAPI.invoke(IPC_CHANNELS.AI_MODELS_GET_ACTIVE) as string | null
    set({ activeModel })
  },

  setActiveModel: async (model) => {
    if (model) {
      await window.electronAPI.invoke(IPC_CHANNELS.AI_MODELS_SET_ACTIVE, model)
    }
    set({ activeModel: model })
  },

  respondToApproval: async (requestId, approved) => {
    await window.electronAPI.invoke(IPC_CHANNELS.AI_CHAT_APPROVAL_RESPONSE, requestId, approved)
    set({ pendingApproval: null })
  },

  respondToMCPApproval: async (requestId, approved) => {
    await window.electronAPI.invoke(IPC_CHANNELS.MCP_APPROVAL_RESPONSE, requestId, approved)
    set({ mcpPendingApproval: null })
  },

  seedComposer: (text) => set({ composerSeed: text }),
  clearComposerSeed: () => set({ composerSeed: null }),

  loadPermissionProfile: async () => {
    const profile = await window.electronAPI.invoke(IPC_CHANNELS.AI_PERMISSION_GET_PROFILE) as 'read-only' | 'ask-write' | 'auto'
    set({ permissionProfile: profile })
  },
  setPermissionProfile: async (p) => {
    await window.electronAPI.invoke(IPC_CHANNELS.AI_PERMISSION_SET_PROFILE, p)
    set({ permissionProfile: p })
  },

  handleStreamEvent: (event) => {
    switch (event.type) {
      case 'chunk':
        set((s) => ({ streamingContent: s.streamingContent + event.content, isAwaitingResponse: false }))
        break

      case 'tool-call': {
        // Flush any accumulated text before the tool call
        const { streamingContent: pending } = get()
        const newMessages: AIChatMessage[] = []
        if (pending) {
          newMessages.push({
            id: crypto.randomUUID(),
            role: 'assistant',
            content: pending,
            timestamp: Date.now()
          })
        }
        const toolMsg: AIChatMessage = {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: `Tool call: ${event.toolCall.name}`,
          toolCalls: [event.toolCall],
          timestamp: Date.now()
        }
        newMessages.push(toolMsg)
        set((s) => ({
          messages: [...s.messages, ...newMessages],
          streamingContent: '',
          sessionStats: {
            ...s.sessionStats,
            toolCallCount: s.sessionStats.toolCallCount + 1
          }
        }))
        break
      }

      case 'tool-result': {
        const resultMsg: AIChatMessage = {
          id: crypto.randomUUID(),
          role: 'tool',
          content: event.result.display ?? String(event.result.data),
          toolCallId: event.result.toolCallId,
          timestamp: Date.now()
        }
        set((s) => ({ messages: [...s.messages, resultMsg] }))
        break
      }

      case 'approval-request':
        set({ pendingApproval: event.request })
        break

      case 'done': {
        const { streamingContent, sessionStats } = get()
        const updatedStats = { ...sessionStats }
        if (event.usage) {
          updatedStats.totalInputTokens += event.usage.inputTokens
          updatedStats.totalOutputTokens += event.usage.outputTokens
        }

        if (streamingContent) {
          const assistantMsg: AIChatMessage = {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: streamingContent,
            timestamp: Date.now()
          }
          set((s) => ({
            messages: [...s.messages, assistantMsg],
            isStreaming: false,
            isAwaitingResponse: false,
            streamingContent: '',
            currentStreamId: null,
            sessionStats: updatedStats
          }))
        } else {
          set({ isStreaming: false, isAwaitingResponse: false, streamingContent: '', currentStreamId: null, sessionStats: updatedStats })
        }
        break
      }

      case 'error': {
        const friendly = parseAppError(event.error).message
        const errorMsg: AIChatMessage = {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: friendly,
          isError: true,
          timestamp: Date.now()
        }
        set((s) => ({
          messages: [...s.messages, errorMsg],
          isStreaming: false,
          isAwaitingResponse: false,
          streamingContent: '',
          currentStreamId: null
        }))
        // Toast + persistent notification routed through the shared classifier
        // so the title matches the error code ("Couldn't unlock saved credentials"
        // / "AI rate limit hit" / …) instead of the generic "AI chat error".
        notifyError(event.error, { titlePrefix: 'AI chat' })
        break
      }
    }
  }
}))

// Keep the active conversation in sync with the live message/stat state and
// persist. Reacts only to message/stat changes (not streaming chunks), and only
// writes `conversations`, so it never re-triggers itself.
useAIStore.subscribe((state, prev) => {
  if (state.messages === prev.messages && state.sessionStats === prev.sessionStats) return
  const { conversations, activeConversationId, messages, sessionStats } = state
  if (!activeConversationId) return
  const idx = conversations.findIndex((c) => c.id === activeConversationId)
  if (idx < 0) return
  const existing = conversations[idx]
  let title = existing.title
  if (title === DEFAULT_TITLE) {
    const firstUser = messages.find((m) => m.role === 'user')
    if (firstUser) title = deriveTitle(firstUser.content)
  }
  const next = [...conversations]
  const updated = { ...existing, title, messages, stats: sessionStats, updatedAt: Date.now() }
  next[idx] = updated
  useAIStore.setState({ conversations: next })
  // Write only the active conversation — not the whole list. This is the hot
  // path (one write per settled message); SQLite handles it transactionally.
  persistConversation(updated)
})

// Set up IPC listeners
if (typeof window !== 'undefined' && window.electronAPI) {
  window.electronAPI.on(IPC_EVENTS.AI_CHAT_EVENT, (streamId: unknown, event: unknown) => {
    const state = useAIStore.getState()
    if (streamId === state.currentStreamId) {
      state.handleStreamEvent(event as AIStreamEvent)
    }
  })

  // MCP approval requests
  window.electronAPI.on(IPC_EVENTS.MCP_APPROVAL_REQUEST, (request: unknown) => {
    useAIStore.setState({ mcpPendingApproval: request as MCPApprovalRequest })
  })
}
