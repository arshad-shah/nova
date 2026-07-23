// tests/unit/ai-store.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { AIChatMessage } from '@shared/ai-types'

// Mock electronAPI before importing store
const mockInvoke = vi.fn()
const mockOn = vi.fn(() => vi.fn())
vi.stubGlobal('window', {
  electronAPI: {
    invoke: mockInvoke,
    on: mockOn
  }
})

import { useAIStore } from '../../src/renderer/src/stores/ai'

describe('AI Store', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useAIStore.setState({
      messages: [],
      isStreaming: false,
      activeProvider: null,
      activeModel: null,
      panelOpen: false,
      streamingContent: '',
      providers: [],
      models: [],
      pendingApproval: null,
      currentStreamId: null
    })
  })

  it('starts with empty state', () => {
    const state = useAIStore.getState()
    expect(state.messages).toEqual([])
    expect(state.isStreaming).toBe(false)
    expect(state.panelOpen).toBe(false)
  })

  it('toggles panel', () => {
    useAIStore.getState().togglePanel()
    expect(useAIStore.getState().panelOpen).toBe(true)
    useAIStore.getState().togglePanel()
    expect(useAIStore.getState().panelOpen).toBe(false)
  })

  it('sends a message', async () => {
    mockInvoke.mockResolvedValue({ streamId: 'stream-1' })
    await useAIStore.getState().sendMessage('Hello')
    expect(mockInvoke).toHaveBeenCalledWith('ai:chat:start', { message: 'Hello' })
    expect(useAIStore.getState().messages).toHaveLength(1)
    expect(useAIStore.getState().messages[0].role).toBe('user')
    expect(useAIStore.getState().isStreaming).toBe(true)
  })

  it('clears messages', async () => {
    mockInvoke.mockResolvedValue(undefined)
    useAIStore.setState({ messages: [{ id: '1', role: 'user', content: 'hi', timestamp: 0 }] })
    await useAIStore.getState().clearMessages()
    expect(mockInvoke).toHaveBeenCalledWith('ai:messages:clear')
    expect(useAIStore.getState().messages).toEqual([])
  })

  it('loads providers', async () => {
    mockInvoke.mockResolvedValueOnce([{ id: 'openai', name: 'OpenAI' }])
      .mockResolvedValueOnce({ id: 'openai', name: 'OpenAI' })
    await useAIStore.getState().loadProviders()
    expect(useAIStore.getState().providers).toEqual([{ id: 'openai', name: 'OpenAI' }])
  })

  it('loadConfiguredProviders tolerates an undefined IPC resolve', async () => {
    mockInvoke.mockResolvedValueOnce(undefined)
    useAIStore.setState({ providers: [], activeProvider: null })
    await expect(useAIStore.getState().loadConfiguredProviders()).resolves.toBeUndefined()
    expect(useAIStore.getState().providers).toEqual([])
  })

  it('loadProviders tolerates an undefined IPC resolve', async () => {
    mockInvoke.mockResolvedValueOnce(undefined)
    useAIStore.setState({ providers: [] })
    await useAIStore.getState().loadProviders()
    expect(useAIStore.getState().providers).toEqual([])
  })

  it('handles stream chunk event', () => {
    useAIStore.setState({ isStreaming: true, currentStreamId: 'stream-1' })
    useAIStore.getState().handleStreamEvent({ type: 'chunk', content: 'Hello' })
    expect(useAIStore.getState().streamingContent).toBe('Hello')
    useAIStore.getState().handleStreamEvent({ type: 'chunk', content: ' world' })
    expect(useAIStore.getState().streamingContent).toBe('Hello world')
  })

  it('handles stream done event', () => {
    useAIStore.setState({ isStreaming: true, streamingContent: 'Hello', currentStreamId: 'stream-1' })
    useAIStore.getState().handleStreamEvent({ type: 'done' })
    expect(useAIStore.getState().isStreaming).toBe(false)
    expect(useAIStore.getState().streamingContent).toBe('')
    // Assistant message should be added
    const msgs = useAIStore.getState().messages
    expect(msgs).toHaveLength(1)
    expect(msgs[0].role).toBe('assistant')
    expect(msgs[0].content).toBe('Hello')
  })
})

describe('AI Store conversations', () => {
  const EMPTY = { totalInputTokens: 0, totalOutputTokens: 0, toolCallCount: 0 }

  beforeEach(() => {
    vi.clearAllMocks()
    try { localStorage.clear() } catch { /* ignore */ }
    useAIStore.setState({
      conversations: [{ id: 'c1', title: 'New chat', messages: [], stats: { ...EMPTY }, createdAt: 1, updatedAt: 1 }],
      activeConversationId: 'c1',
      messages: [],
      sessionStats: { ...EMPTY },
      isStreaming: false,
      streamingContent: '',
      currentStreamId: null,
      pendingApproval: null
    })
  })

  it('creates a new conversation and clears the active history', () => {
    mockInvoke.mockResolvedValue(undefined)
    useAIStore.setState({ messages: [{ id: 'm1', role: 'user', content: 'hi', timestamp: 0 }] })
    useAIStore.getState().newConversation()
    const s = useAIStore.getState()
    expect(s.conversations.length).toBe(2)
    expect(s.activeConversationId).not.toBe('c1')
    expect(s.messages).toEqual([])
    expect(mockInvoke).toHaveBeenCalledWith('ai:messages:clear')
  })

  it('auto-titles the active conversation from the first user message', () => {
    useAIStore.setState({ messages: [{ id: 'm1', role: 'user', content: 'Show me the slowest queries', timestamp: 0 }] })
    const active = useAIStore.getState().conversations.find((c) => c.id === 'c1')
    expect(active?.title).toBe('Show me the slowest queries')
  })

  it('switches conversations and loads the history into main', async () => {
    const prev: AIChatMessage[] = [{ id: 'x', role: 'user', content: 'prev', timestamp: 0 }]
    useAIStore.setState({
      conversations: [
        useAIStore.getState().conversations[0],
        { id: 'c2', title: 'Other', messages: prev, stats: { ...EMPTY }, createdAt: 0, updatedAt: 0 }
      ]
    })
    mockInvoke.mockResolvedValue(undefined)
    await useAIStore.getState().switchConversation('c2')
    const s = useAIStore.getState()
    expect(s.activeConversationId).toBe('c2')
    expect(s.messages).toEqual(prev)
    expect(mockInvoke).toHaveBeenCalledWith('ai:messages:set', prev)
  })

  it('branches a new conversation from a message', async () => {
    const msgs: AIChatMessage[] = [
      { id: 'm1', role: 'user', content: 'q', timestamp: 0 },
      { id: 'm2', role: 'assistant', content: 'a', timestamp: 0 },
      { id: 'm3', role: 'user', content: 'q2', timestamp: 0 }
    ]
    useAIStore.setState({ messages: msgs })
    mockInvoke.mockResolvedValue(undefined)
    await useAIStore.getState().branchConversation('m2')
    const s = useAIStore.getState()
    expect(s.conversations.length).toBe(2)
    expect(s.activeConversationId).not.toBe('c1')
    expect(s.messages.map((m) => m.id)).toEqual(['m1', 'm2'])
    expect(mockInvoke).toHaveBeenCalledWith('ai:messages:set', [
      expect.objectContaining({ id: 'm1' }),
      expect.objectContaining({ id: 'm2' })
    ])
  })

  it('deletes a conversation and always keeps at least one', async () => {
    mockInvoke.mockResolvedValue(undefined)
    await useAIStore.getState().deleteConversation('c1')
    const s = useAIStore.getState()
    expect(s.conversations.length).toBe(1)
    expect(s.conversations[0].id).not.toBe('c1')
  })

  it('renames a conversation', () => {
    useAIStore.getState().renameConversation('c1', 'My analysis')
    expect(useAIStore.getState().conversations.find((c) => c.id === 'c1')?.title).toBe('My analysis')
  })
})
