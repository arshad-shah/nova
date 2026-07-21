// tests/unit/ai-enhancements.test.ts
//
// createAIEnhancements (generateQuery/completeQuery/explainResults/summarize)
// had zero coverage before this file. It's also where the inline-completion
// sanitizer lives — a fairly elaborate heuristic that strips fences, refusals
// and prose from model output before it's shown as ghost text in the editor.
import { describe, it, expect, vi } from 'vitest'
import { createAIEnhancements } from '../../src/main/plugins/bundled/ai/internal/enhancements'
import type { AIProviderRegistry } from '../../src/main/plugins/bundled/ai/internal/provider-registry'
import type { ConversationManager } from '../../src/main/plugins/bundled/ai/internal/conversation-manager'
import type { AIProviderChunk, AIChatMessage } from '@shared/ai-types'

/** A fake provider registry exposing only what enhancements.ts consumes. */
function fakeRegistry(opts: {
  active?: boolean
  modelId?: string | null
  chunks?: AIProviderChunk[]
  chatSpy?: (req: unknown) => void
} = {}): { registry: AIProviderRegistry; chatMock: ReturnType<typeof vi.fn> } {
  const chunks = opts.chunks ?? [{ type: 'done' }]
  const chatMock = vi.fn((req: unknown) => {
    opts.chatSpy?.(req)
    return (async function* () {
      for (const c of chunks) yield c
    })()
  })
  const provider = opts.active === false ? null : {
    id: 'mock', name: 'Mock', supportsToolCalling: false,
    models: async () => [],
    chat: chatMock
  }
  const registry = {
    getActive: () => provider,
    getActiveModel: () => (opts.modelId === undefined ? 'mock-1' : opts.modelId)
  } as unknown as AIProviderRegistry
  return { registry, chatMock }
}

function fakeConversationManager(getContext: (id: string) => Promise<string> = async () => ''): ConversationManager {
  return { getContextForConnection: getContext } as unknown as ConversationManager
}

describe('createAIEnhancements', () => {
  describe('generateQuery', () => {
    it('throws when no active provider is configured', async () => {
      const { registry } = fakeRegistry({ active: false })
      const enh = createAIEnhancements({
        providerRegistry: registry,
        getSchemaContext: async () => '',
        conversationManager: fakeConversationManager()
      })
      await expect(enh.generateQuery({ prompt: 'x', connectionId: 'c1' })).rejects.toThrow('No active AI provider configured')
    })

    it('throws when no active model is configured', async () => {
      const { registry } = fakeRegistry({ modelId: null })
      const enh = createAIEnhancements({
        providerRegistry: registry,
        getSchemaContext: async () => '',
        conversationManager: fakeConversationManager()
      })
      await expect(enh.generateQuery({ prompt: 'x', connectionId: 'c1' })).rejects.toThrow('No active AI model configured')
    })

    it('trims the assembled query and swallows a failing schema/context lookup', async () => {
      const { registry } = fakeRegistry({ chunks: [{ type: 'text', content: '  SELECT 1  ' }, { type: 'done' }] })
      const enh = createAIEnhancements({
        providerRegistry: registry,
        getSchemaContext: async () => { throw new Error('schema unavailable') },
        conversationManager: fakeConversationManager(async () => { throw new Error('ctx unavailable') })
      })
      const result = await enh.generateQuery({ prompt: 'top 10 users', connectionId: 'c1' })
      expect(result).toEqual({ query: 'SELECT 1' })
    })

    it('generateSql (deprecated) returns { sql } instead of { query }', async () => {
      const { registry } = fakeRegistry({ chunks: [{ type: 'text', content: 'SELECT 2' }, { type: 'done' }] })
      const enh = createAIEnhancements({
        providerRegistry: registry,
        getSchemaContext: async () => '',
        conversationManager: fakeConversationManager()
      })
      const result = await enh.generateSql({ prompt: 'x', connectionId: 'c1' })
      expect(result).toEqual({ sql: 'SELECT 2' })
    })

    it('stops accumulating text once the provider reports an error chunk, without throwing', async () => {
      // callProvider (unlike callProviderStreaming) treats an error chunk as a
      // stop signal, not a throw — the caller gets back whatever text arrived
      // before the error rather than an exception.
      const { registry } = fakeRegistry({
        chunks: [{ type: 'text', content: 'SELECT ' }, { type: 'error', error: 'boom' }, { type: 'text', content: 'ignored' }]
      })
      const enh = createAIEnhancements({
        providerRegistry: registry,
        getSchemaContext: async () => '',
        conversationManager: fakeConversationManager()
      })
      const result = await enh.generateQuery({ prompt: 'x', connectionId: 'c1' })
      expect(result).toEqual({ query: 'SELECT' })
    })
  })

  describe('completeQuery / sanitizeCompletion', () => {
    async function complete(content: string) {
      const { registry } = fakeRegistry({ chunks: [{ type: 'text', content }, { type: 'done' }] })
      const enh = createAIEnhancements({
        providerRegistry: registry,
        getSchemaContext: async () => '',
        conversationManager: fakeConversationManager()
      })
      return enh.completeQuery({ sql: 'SELECT * FROM users', cursorOffset: 9, connectionId: 'c1' })
    }

    it('passes plain SQL through untouched', async () => {
      expect(await complete('WHERE id = 1')).toEqual({ completion: 'WHERE id = 1' })
    })

    it('extracts the first fenced code block and discards surrounding prose', async () => {
      const raw = 'Sure, here you go:\n```sql\nWHERE id = 1\n```\nHope that helps!'
      expect(await complete(raw)).toEqual({ completion: 'WHERE id = 1' })
    })

    it('strips stray leading/trailing backticks with no fence', async () => {
      expect(await complete('`WHERE id = 1`')).toEqual({ completion: 'WHERE id = 1' })
    })

    it('drops a trailing explanatory comment', async () => {
      expect(await complete('WHERE id = 1\n-- filters to a single user')).toEqual({ completion: 'WHERE id = 1' })
    })

    it('returns empty for a blank response', async () => {
      expect(await complete('   ')).toEqual({ completion: '' })
    })

    it('returns empty when there is no alphanumeric content', async () => {
      expect(await complete('...')).toEqual({ completion: '' })
    })

    it('returns empty for a leading comment (refusal echo)', async () => {
      expect(await complete('-- this query already looks complete')).toEqual({ completion: '' })
    })

    it('returns empty when the whole response is comment lines', async () => {
      expect(await complete('-- line one\n-- line two')).toEqual({ completion: '' })
    })

    it('returns empty for a refusal sentence containing a prose marker', async () => {
      expect(await complete('I cannot complete this query safely.')).toEqual({ completion: '' })
    })

    it('returns empty for the sentence-shape heuristic (". " followed by a capital)', async () => {
      expect(await complete('LIMIT 10. Here is the rest of the answer')).toEqual({ completion: '' })
    })

    it('returns empty when a non-trivial line reads as prose with no SQL keywords', async () => {
      const raw = 'WHERE id = 1\nNicely done, hope you enjoy your day friend'
      expect(await complete(raw)).toEqual({ completion: '' })
    })

    it('keeps multi-line SQL where every line is short or SQL-shaped', async () => {
      const raw = 'WHERE id = 1\nAND status = \'active\''
      expect(await complete(raw)).toEqual({ completion: raw })
    })

    it('builds the completion prompt from text before/after the cursor, joined by "|"', async () => {
      const { registry, chatMock } = fakeRegistry({ chunks: [{ type: 'text', content: 'x' }, { type: 'done' }] })
      const enh = createAIEnhancements({
        providerRegistry: registry,
        getSchemaContext: async () => '',
        conversationManager: fakeConversationManager()
      })
      await enh.completeQuery({ sql: 'SELECT * FROM users WHERE', cursorOffset: 20, connectionId: 'c1' })
      const req = chatMock.mock.calls[0][0] as { messages: AIChatMessage[] }
      expect(req.messages[1].content).toBe('SELECT * FROM users |WHERE')
    })

    it('completeSql (deprecated) delegates to completeQuery', async () => {
      const { registry } = fakeRegistry({ chunks: [{ type: 'text', content: 'WHERE 1=1' }, { type: 'done' }] })
      const enh = createAIEnhancements({
        providerRegistry: registry,
        getSchemaContext: async () => '',
        conversationManager: fakeConversationManager()
      })
      const result = await enh.completeSql({ sql: 'SELECT * FROM t', cursorOffset: 5, connectionId: 'c1' })
      expect(result).toEqual({ completion: 'WHERE 1=1' })
    })
  })

  describe('explainResults', () => {
    it('caps the sample data sent to the model at 5 rows and reports elapsed time', async () => {
      const { registry, chatMock } = fakeRegistry({ chunks: [{ type: 'text', content: 'Looks fine.' }, { type: 'done' }] })
      const enh = createAIEnhancements({
        providerRegistry: registry,
        getSchemaContext: async () => '',
        conversationManager: fakeConversationManager()
      })
      const sampleRows = Array.from({ length: 20 }, (_, i) => ({ id: i }))
      const result = await enh.explainResults({ sql: 'SELECT * FROM t', columns: ['id'], rowCount: 20, sampleRows })

      expect(result.explanation).toBe('Looks fine.')
      expect(result.model).toBe('mock-1')
      expect(result.durationMs).toBeGreaterThanOrEqual(0)

      const req = chatMock.mock.calls[0][0] as { messages: AIChatMessage[] }
      const userPrompt = req.messages[1].content
      const parsedSample = JSON.parse(userPrompt.split('Sample data (first 5 rows):\n')[1])
      expect(parsedSample).toHaveLength(5)
    })

    it('propagates the no-active-model error rather than returning a partial explanation', async () => {
      const { registry } = fakeRegistry({ modelId: null, chunks: [{ type: 'done' }] })
      const enh = createAIEnhancements({
        providerRegistry: registry,
        getSchemaContext: async () => '',
        conversationManager: fakeConversationManager()
      })
      await expect(enh.explainResults({ sql: 's', columns: [], rowCount: 0, sampleRows: [] }))
        .rejects.toThrow('No active AI model configured')
    })
  })

  describe('explainResultsStream', () => {
    it('invokes onToken for each text chunk and resolves with the model + duration', async () => {
      const { registry } = fakeRegistry({
        chunks: [{ type: 'text', content: 'a' }, { type: 'text', content: 'b' }, { type: 'done' }]
      })
      const enh = createAIEnhancements({
        providerRegistry: registry,
        getSchemaContext: async () => '',
        conversationManager: fakeConversationManager()
      })
      const tokens: string[] = []
      const controller = new AbortController()
      const result = await enh.explainResultsStream(
        { sql: 's', columns: [], rowCount: 0, sampleRows: [] },
        (t) => tokens.push(t),
        controller.signal
      )
      expect(tokens).toEqual(['a', 'b'])
      expect(result.model).toBe('mock-1')
    })

    it('stops delivering tokens once the signal is aborted', async () => {
      const { registry } = fakeRegistry({
        chunks: [{ type: 'text', content: 'a' }, { type: 'text', content: 'b' }, { type: 'text', content: 'c' }, { type: 'done' }]
      })
      const enh = createAIEnhancements({
        providerRegistry: registry,
        getSchemaContext: async () => '',
        conversationManager: fakeConversationManager()
      })
      const controller = new AbortController()
      const tokens: string[] = []
      // Abort as soon as the first token arrives.
      await enh.explainResultsStream(
        { sql: 's', columns: [], rowCount: 0, sampleRows: [] },
        (t) => { tokens.push(t); controller.abort() },
        controller.signal
      )
      expect(tokens).toEqual(['a'])
    })

    it('throws when the provider yields an error chunk', async () => {
      const { registry } = fakeRegistry({ chunks: [{ type: 'error', error: 'provider exploded' }] })
      const enh = createAIEnhancements({
        providerRegistry: registry,
        getSchemaContext: async () => '',
        conversationManager: fakeConversationManager()
      })
      const controller = new AbortController()
      await expect(enh.explainResultsStream(
        { sql: 's', columns: [], rowCount: 0, sampleRows: [] },
        () => {},
        controller.signal
      )).rejects.toThrow('provider exploded')
    })
  })

  describe('summarizeConversation', () => {
    it('includes only user/assistant turns, formatted as ROLE: content', async () => {
      const { registry, chatMock } = fakeRegistry({ chunks: [{ type: 'text', content: 'Summary text' }, { type: 'done' }] })
      const enh = createAIEnhancements({
        providerRegistry: registry,
        getSchemaContext: async () => '',
        conversationManager: fakeConversationManager()
      })
      const messages: AIChatMessage[] = [
        { id: '1', role: 'user', content: 'hello', timestamp: 0 },
        { id: '2', role: 'assistant', content: 'hi there', timestamp: 1 },
        { id: '3', role: 'tool', content: '{"ok":true}', timestamp: 2, toolCallId: 't1' },
        { id: '4', role: 'system', content: 'ignored system content', timestamp: 3 }
      ]
      const result = await enh.summarizeConversation(messages)
      expect(result).toEqual({ summary: 'Summary text' })

      const req = chatMock.mock.calls[0][0] as { messages: AIChatMessage[] }
      const userPrompt = req.messages[1].content
      expect(userPrompt).toBe('USER: hello\n\nASSISTANT: hi there')
      expect(userPrompt).not.toContain('ignored system content')
      expect(userPrompt).not.toContain('"ok":true')
    })
  })
})
