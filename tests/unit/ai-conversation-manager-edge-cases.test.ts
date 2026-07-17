// tests/unit/ai-conversation-manager-edge-cases.test.ts
//
// Companion to ai-conversation-manager.test.ts: covers the streaming
// tool-call loop's error/approval/abort paths that file doesn't reach —
// an unknown tool, malformed arguments, a blocked write, the approve/reject
// branches of the approval flow (with the attention seam), a throwing tool,
// usage accumulation across rounds, the MAX_TOOL_ROUNDS ceiling, a mid-stream
// abort, and context-provider error handling.
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { z } from 'zod'
import { toJsonSchema } from '../../src/main/plugins/sdk/tool-schema'
import { ConversationManager } from '../../src/main/plugins/bundled/ai/internal/conversation-manager'
import type { AIProvider } from '../../src/main/plugins/bundled/ai/internal/types'
import { AIProviderRegistry } from '../../src/main/plugins/bundled/ai/internal/provider-registry'
import { ToolRegistryImpl } from '../../src/main/plugins/sdk/tool-registry'
import { PermissionManager } from '../../src/main/plugins/bundled/ai/internal/permission-manager'
import type { AttentionHub } from '../../src/main/attention/attention-hub'
import type { AIStreamEvent } from '@shared/ai-types'

function toolCallThenDoneProvider(toolCall: { id: string; name: string; arguments: string }, finalText = 'done'): AIProvider {
  let turn = 0
  return {
    id: 'mock', name: 'Mock', supportsToolCalling: true,
    models: async () => [{ id: 'mock-1', name: 'Mock', contextWindow: 4096, capabilities: ['chat', 'tool-calling'] as const }],
    async *chat() {
      turn++
      if (turn === 1) {
        yield { type: 'tool-call', toolCall } as never
        yield { type: 'done' } as never
      } else {
        yield { type: 'text', content: finalText } as never
        yield { type: 'done' } as never
      }
    }
  }
}

describe('ConversationManager — tool-call edge cases', () => {
  let providerRegistry: AIProviderRegistry
  let toolRegistry: ToolRegistryImpl
  let permissionManager: PermissionManager
  let attention: AttentionHub

  beforeEach(() => {
    providerRegistry = new AIProviderRegistry()
    toolRegistry = new ToolRegistryImpl()
    permissionManager = new PermissionManager()
    attention = { request: vi.fn(), resolve: vi.fn(), subscribe: vi.fn() } as unknown as AttentionHub
  })

  function makeManager(extra: Partial<ConstructorParameters<typeof ConversationManager>[0]> = {}) {
    return new ConversationManager({
      providerRegistry,
      toolRegistry,
      permissionManager,
      getSchemaContext: async () => '',
      getConnectionId: () => 'conn-1',
      attention,
      ...extra
    })
  }

  async function collect(manager: ConversationManager): Promise<AIStreamEvent[]> {
    const events: AIStreamEvent[] = []
    for await (const event of manager.chat()) events.push(event)
    return events
  }

  it('surfaces an unknown-tool call as a failed tool-result without touching the registry', async () => {
    providerRegistry.register(toolCallThenDoneProvider({ id: 't1', name: 'nonexistent_tool', arguments: '{}' }))
    providerRegistry.setActive('mock')
    providerRegistry.setActiveModel('mock-1')

    const manager = makeManager()
    manager.addUserMessage('do something')
    const events = await collect(manager)

    const toolResult = events.find(e => e.type === 'tool-result')
    expect(toolResult).toMatchObject({ result: { success: false, display: 'Unknown tool: nonexistent_tool' } })
  })

  it('reports a parse failure instead of executing the tool when arguments are malformed JSON', async () => {
    providerRegistry.register(toolCallThenDoneProvider({ id: 't1', name: 'my_tool', arguments: '{not valid json' }))
    providerRegistry.setActive('mock')
    providerRegistry.setActiveModel('mock-1')

    const execute = vi.fn(async () => ({ success: true, data: null }))
    toolRegistry.register({
      id: 'my_tool', name: 'My Tool', description: 'x',
      inputSchema: toJsonSchema(z.object({})), permission: 'read', execute
    })

    const manager = makeManager()
    manager.addUserMessage('do something')
    const events = await collect(manager)

    expect(execute).not.toHaveBeenCalled()
    const toolResult = events.find(e => e.type === 'tool-result')
    expect(toolResult).toMatchObject({ result: { success: false, display: 'Failed to parse tool arguments' } })
  })

  it('blocks a write tool outright under the read-only profile, without prompting for approval', async () => {
    permissionManager.setProfile('read-only')
    providerRegistry.register(toolCallThenDoneProvider({ id: 't1', name: 'delete_rows', arguments: '{}' }))
    providerRegistry.setActive('mock')
    providerRegistry.setActiveModel('mock-1')

    const execute = vi.fn(async () => ({ success: true, data: null }))
    toolRegistry.register({
      id: 'delete_rows', name: 'Delete Rows', description: 'x',
      inputSchema: toJsonSchema(z.object({})), permission: 'write', execute
    })

    const manager = makeManager()
    manager.addUserMessage('delete everything')
    const events = await collect(manager)

    expect(execute).not.toHaveBeenCalled()
    expect(events.some(e => e.type === 'approval-request')).toBe(false)
    const toolResult = events.find(e => e.type === 'tool-result')
    expect(toolResult).toMatchObject({
      result: { success: false, display: 'Blocked: this tool requires write access and the current permission profile is read-only.' }
    })
  })

  it('runs the tool immediately once approved, and announces/resolves attention around the wait', async () => {
    providerRegistry.register(toolCallThenDoneProvider({ id: 't1', name: 'delete_rows', arguments: '{}' }))
    providerRegistry.setActive('mock')
    providerRegistry.setActiveModel('mock-1')

    const execute = vi.fn(async () => ({ success: true, data: 'deleted', display: 'ok' }))
    toolRegistry.register({
      id: 'delete_rows', name: 'Delete Rows', description: 'dangerous',
      inputSchema: toJsonSchema(z.object({})), permission: 'write', execute
    })

    const manager = makeManager()
    manager.addUserMessage('delete everything')

    // Drive the generator manually so we can approve mid-stream, the way the
    // real IPC round-trip (renderer -> AI_CHAT_APPROVAL_RESPONSE) would.
    const events: AIStreamEvent[] = []
    const it_ = manager.chat()[Symbol.asyncIterator]()
    let step = await it_.next()
    while (!step.done) {
      events.push(step.value)
      if (step.value.type === 'approval-request') {
        expect(attention.request).toHaveBeenCalledWith(expect.objectContaining({ id: step.value.request.requestId, kind: 'approval' }))
        // Real approvals arrive over IPC — i.e. strictly after the generator has
        // resumed and reached `waitForApproval()`. Defer via a microtask so this
        // test exercises that ordering rather than the (buggy) synchronous race
        // covered separately below.
        const requestId = step.value.request.requestId
        queueMicrotask(() => permissionManager.resolveApproval(requestId, true))
      }
      step = await it_.next()
    }

    expect(execute).toHaveBeenCalledOnce()
    expect(attention.resolve).toHaveBeenCalled()
    const toolResult = events.find(e => e.type === 'tool-result')
    expect(toolResult).toMatchObject({ result: { success: true, data: 'deleted' } })
  })

  it('BUG: an approval resolved synchronously right after the approval-request event is silently dropped and treated as rejected', async () => {
    // `chat()` yields `approval-request` BEFORE calling `waitForApproval(requestId)`.
    // If a caller resolves the approval in that gap — i.e. before the generator
    // resumes and attaches its real resolve callback — `resolveApproval` deletes
    // the pending entry using the still-default no-op resolver, so when the
    // generator finally calls `waitForApproval(requestId)` it finds nothing
    // pending and resolves to `false`. A legitimately-approved write silently
    // executes as if the user had rejected it. In production this window is
    // vanishingly small (an IPC round-trip separates the two), but the API
    // offers no protection against it — this test simply calls resolveApproval
    // as soon as the event is observed, with no artificial delay.
    providerRegistry.register(toolCallThenDoneProvider({ id: 't1', name: 'delete_rows', arguments: '{}' }))
    providerRegistry.setActive('mock')
    providerRegistry.setActiveModel('mock-1')

    const execute = vi.fn(async () => ({ success: true, data: 'deleted' }))
    toolRegistry.register({
      id: 'delete_rows', name: 'Delete Rows', description: 'dangerous',
      inputSchema: toJsonSchema(z.object({})), permission: 'write', execute
    })

    const manager = makeManager()
    manager.addUserMessage('delete everything')

    const events: AIStreamEvent[] = []
    const it_ = manager.chat()[Symbol.asyncIterator]()
    let step = await it_.next()
    while (!step.done) {
      events.push(step.value)
      if (step.value.type === 'approval-request') {
        // Resolved in the same synchronous turn — before the generator has had
        // a chance to reach `waitForApproval()`.
        permissionManager.resolveApproval(step.value.request.requestId, true)
      }
      step = await it_.next()
    }

    // Documents CURRENT (undesired) behaviour: the approval is lost.
    expect(execute).not.toHaveBeenCalled()
    const toolResult = events.find(e => e.type === 'tool-result')
    expect(toolResult).toMatchObject({ result: { success: false, display: 'User rejected this action' } })
  })

  it('surfaces a user rejection as a failed tool-result and never calls execute', async () => {
    providerRegistry.register(toolCallThenDoneProvider({ id: 't1', name: 'delete_rows', arguments: '{}' }))
    providerRegistry.setActive('mock')
    providerRegistry.setActiveModel('mock-1')

    const execute = vi.fn(async () => ({ success: true, data: null }))
    toolRegistry.register({
      id: 'delete_rows', name: 'Delete Rows', description: 'dangerous',
      inputSchema: toJsonSchema(z.object({})), permission: 'write', execute
    })

    const manager = makeManager()
    manager.addUserMessage('delete everything')

    const events: AIStreamEvent[] = []
    const it_ = manager.chat()[Symbol.asyncIterator]()
    let step = await it_.next()
    while (!step.done) {
      events.push(step.value)
      if (step.value.type === 'approval-request') {
        permissionManager.resolveApproval(step.value.request.requestId, false)
      }
      step = await it_.next()
    }

    expect(execute).not.toHaveBeenCalled()
    const toolResult = events.find(e => e.type === 'tool-result')
    expect(toolResult).toMatchObject({ result: { success: false, display: 'User rejected this action' } })
  })

  it('captures a thrown tool error as a failed tool-result carrying the error message', async () => {
    providerRegistry.register(toolCallThenDoneProvider({ id: 't1', name: 'flaky_tool', arguments: '{}' }))
    providerRegistry.setActive('mock')
    providerRegistry.setActiveModel('mock-1')

    toolRegistry.register({
      id: 'flaky_tool', name: 'Flaky', description: 'x',
      inputSchema: toJsonSchema(z.object({})), permission: 'read',
      execute: async () => { throw new Error('connection lost') }
    })

    const manager = makeManager()
    manager.addUserMessage('go')
    const events = await collect(manager)

    const toolResult = events.find(e => e.type === 'tool-result')
    expect(toolResult).toMatchObject({ result: { success: false, display: 'connection lost' } })
    // The failure is recorded in history as a tool message so future rounds see it.
    const toolMsg = manager.getMessages().find(m => m.role === 'tool')
    expect(toolMsg?.content).toBe(JSON.stringify({ error: 'connection lost' }))
  })

  it('sums usage across multiple tool-call rounds into the final done event', async () => {
    let turn = 0
    const provider: AIProvider = {
      id: 'mock', name: 'Mock', supportsToolCalling: true,
      models: async () => [{ id: 'mock-1', name: 'Mock', contextWindow: 4096, capabilities: ['chat', 'tool-calling'] as const }],
      async *chat() {
        turn++
        if (turn < 3) {
          yield { type: 'tool-call', toolCall: { id: `t${turn}`, name: 'ping', arguments: '{}' } } as never
          yield { type: 'done', usage: { inputTokens: 10, outputTokens: 5 } } as never
        } else {
          yield { type: 'text', content: 'done' } as never
          yield { type: 'done', usage: { inputTokens: 3, outputTokens: 7 } } as never
        }
      }
    }
    providerRegistry.register(provider)
    providerRegistry.setActive('mock')
    providerRegistry.setActiveModel('mock-1')
    toolRegistry.register({
      id: 'ping', name: 'Ping', description: 'x', inputSchema: toJsonSchema(z.object({})),
      permission: 'read', execute: async () => ({ success: true, data: null })
    })

    const manager = makeManager()
    manager.addUserMessage('go')
    const events = await collect(manager)

    expect(events.at(-1)).toEqual({ type: 'done', usage: { inputTokens: 23, outputTokens: 17 } })
  })

  it('stops after MAX_TOOL_ROUNDS (10) rather than looping forever on a provider that always calls a tool', async () => {
    let turn = 0
    const provider: AIProvider = {
      id: 'mock', name: 'Mock', supportsToolCalling: true,
      models: async () => [{ id: 'mock-1', name: 'Mock', contextWindow: 4096, capabilities: ['chat', 'tool-calling'] as const }],
      async *chat() {
        turn++
        yield { type: 'tool-call', toolCall: { id: `t${turn}`, name: 'ping', arguments: '{}' } } as never
        yield { type: 'done' } as never
      }
    }
    providerRegistry.register(provider)
    providerRegistry.setActive('mock')
    providerRegistry.setActiveModel('mock-1')

    const execute = vi.fn(async () => ({ success: true, data: null }))
    toolRegistry.register({
      id: 'ping', name: 'Ping', description: 'x', inputSchema: toJsonSchema(z.object({})),
      permission: 'read', execute
    })

    const manager = makeManager()
    manager.addUserMessage('go forever')
    const events = await collect(manager)

    expect(execute).toHaveBeenCalledTimes(10)
    expect(events.at(-1)).toMatchObject({ type: 'done' })
  })

  it('stops delivering further chunks once abort() is called mid-stream, but still finalizes with done', async () => {
    const provider: AIProvider = {
      id: 'mock', name: 'Mock', supportsToolCalling: false,
      models: async () => [{ id: 'mock-1', name: 'Mock', contextWindow: 4096, capabilities: ['chat'] as const }],
      async *chat() {
        yield { type: 'text', content: 'a' } as never
        yield { type: 'text', content: 'b' } as never
        yield { type: 'text', content: 'c' } as never
        yield { type: 'done' } as never
      }
    }
    providerRegistry.register(provider)
    providerRegistry.setActive('mock')
    providerRegistry.setActiveModel('mock-1')

    const manager = makeManager()
    manager.addUserMessage('go')

    const events: AIStreamEvent[] = []
    const it_ = manager.chat()[Symbol.asyncIterator]()
    let step = await it_.next()
    while (!step.done) {
      events.push(step.value)
      if (step.value.type === 'chunk' && step.value.content === 'a') {
        manager.abort()
      }
      step = await it_.next()
    }

    expect(events).toEqual([{ type: 'chunk', content: 'a' }, { type: 'done' }])
    // The partial assistant turn is still saved to history.
    const assistantMsg = manager.getMessages().find(m => m.role === 'assistant')
    expect(assistantMsg?.content).toBe('a')
  })

  it('yields an error event for a provider error chunk without ending the round early', async () => {
    const provider: AIProvider = {
      id: 'mock', name: 'Mock', supportsToolCalling: false,
      models: async () => [{ id: 'mock-1', name: 'Mock', contextWindow: 4096, capabilities: ['chat'] as const }],
      async *chat() {
        yield { type: 'error', error: 'rate limited' } as never
        yield { type: 'done' } as never
      }
    }
    providerRegistry.register(provider)
    providerRegistry.setActive('mock')
    providerRegistry.setActiveModel('mock-1')

    const manager = makeManager()
    manager.addUserMessage('go')
    const events = await collect(manager)

    expect(events).toEqual([{ type: 'error', error: 'rate limited' }, { type: 'done', usage: undefined }])
  })

  it('defaults an error chunk with no message to "Unknown error"', async () => {
    const provider: AIProvider = {
      id: 'mock', name: 'Mock', supportsToolCalling: false,
      models: async () => [{ id: 'mock-1', name: 'Mock', contextWindow: 4096, capabilities: ['chat'] as const }],
      async *chat() {
        yield { type: 'error' } as never
        yield { type: 'done' } as never
      }
    }
    providerRegistry.register(provider)
    providerRegistry.setActive('mock')
    providerRegistry.setActiveModel('mock-1')

    const manager = makeManager()
    manager.addUserMessage('go')
    const events = await collect(manager)
    expect(events[0]).toEqual({ type: 'error', error: 'Unknown error' })
  })
})

describe('ConversationManager — context providers', () => {
  let providerRegistry: AIProviderRegistry
  let toolRegistry: ToolRegistryImpl
  let permissionManager: PermissionManager

  beforeEach(() => {
    providerRegistry = new AIProviderRegistry()
    toolRegistry = new ToolRegistryImpl()
    permissionManager = new PermissionManager()
  })

  it('joins context from only the providers that apply, skipping ones that return empty', async () => {
    const manager = new ConversationManager({
      providerRegistry, toolRegistry, permissionManager,
      getSchemaContext: async () => '',
      getConnectionId: () => 'conn-1'
    })
    manager.registerContextProvider({ id: 'a', appliesTo: () => true, getContext: async () => 'context A' })
    manager.registerContextProvider({ id: 'b', appliesTo: () => false, getContext: async () => 'context B (should not appear)' })
    manager.registerContextProvider({ id: 'c', appliesTo: () => true, getContext: async () => '' })

    const context = await manager.getContextForConnection('conn-1')
    expect(context).toBe('context A')
  })

  it('swallows a throwing context provider rather than failing the whole system message', async () => {
    const manager = new ConversationManager({
      providerRegistry, toolRegistry, permissionManager,
      getSchemaContext: async () => '',
      getConnectionId: () => 'conn-1'
    })
    manager.registerContextProvider({ id: 'broken', appliesTo: () => true, getContext: async () => { throw new Error('boom') } })
    manager.registerContextProvider({ id: 'ok', appliesTo: () => true, getContext: async () => 'still works' })

    const context = await manager.getContextForConnection('conn-1')
    expect(context).toBe('still works')

    const systemMessage = await manager.assembleSystemMessage(undefined, 'conn-1')
    expect(systemMessage).toContain('still works')
  })

  it('unregisterContextProvider removes it from future context assembly', async () => {
    const manager = new ConversationManager({
      providerRegistry, toolRegistry, permissionManager,
      getSchemaContext: async () => '',
      getConnectionId: () => 'conn-1'
    })
    manager.registerContextProvider({ id: 'temp', appliesTo: () => true, getContext: async () => 'temporary' })
    manager.unregisterContextProvider('temp')

    const context = await manager.getContextForConnection('conn-1')
    expect(context).toBe('')
  })

  it('assembleSystemMessage tolerates a schema lookup that throws', async () => {
    const manager = new ConversationManager({
      providerRegistry, toolRegistry, permissionManager,
      getSchemaContext: async () => { throw new Error('db unreachable') },
      getConnectionId: () => 'conn-1'
    })
    const msg = await manager.assembleSystemMessage(undefined, 'conn-1')
    expect(msg).not.toContain('db unreachable')
  })

  it('skips schema and context-provider lookups entirely when there is no connection id', async () => {
    const getSchemaContext = vi.fn(async () => 'should not be called')
    const manager = new ConversationManager({
      providerRegistry, toolRegistry, permissionManager,
      getSchemaContext,
      getConnectionId: () => null
    })
    manager.registerContextProvider({ id: 'a', appliesTo: () => true, getContext: async () => 'context' })

    const msg = await manager.assembleSystemMessage(undefined, null)
    expect(getSchemaContext).not.toHaveBeenCalled()
    expect(msg).not.toContain('context')
  })
})
