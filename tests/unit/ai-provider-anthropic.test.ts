import { describe, it, expect, vi, afterEach } from 'vitest'
import { AnthropicProvider } from '../../src/main/plugins/bundled/ai/internal/providers/anthropic'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('AnthropicProvider', () => {
  it('has correct metadata', () => {
    const provider = new AnthropicProvider(() => 'test-key')
    expect(provider.id).toBe('anthropic')
    expect(provider.name).toBe('Anthropic')
    expect(provider.supportsToolCalling).toBe(true)
  })

  it('returns models list', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({
        data: [
          { id: 'claude-sonnet-4-6', display_name: 'Claude Sonnet 4.6' },
          { id: 'claude-opus-4-7', display_name: 'Claude Opus 4.7' }
        ],
        has_more: false,
        last_id: null
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    )
    const provider = new AnthropicProvider(() => 'test-key')
    const models = await provider.models()
    expect(models.length).toBeGreaterThan(0)
    expect(models.some(m => m.id.includes('claude'))).toBe(true)
  })

  it('returns empty list when API key is missing', async () => {
    const provider = new AnthropicProvider(() => null)
    const models = await provider.models()
    expect(models).toEqual([])
  })

  it('attaches cache_control to system prompt and last tool', async () => {
    let captured: { system?: unknown; tools?: unknown[] } = {}
    vi.spyOn(globalThis, 'fetch').mockImplementationOnce(async (_url, init) => {
      captured = JSON.parse((init as RequestInit).body as string)
      // Minimal SSE stream that ends immediately.
      const body = 'data: {"type":"message_stop"}\n\n'
      return new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } })
    })
    const provider = new AnthropicProvider(() => 'test-key')
    for await (const _ of provider.chat({
      model: 'claude-sonnet-4-6',
      messages: [
        { id: 's', role: 'system', content: 'You are helpful.', timestamp: 0 },
        { id: 'u', role: 'user', content: 'hi', timestamp: 0 },
      ],
      tools: [
        { name: 'a', description: 'A', parameters: { type: 'object' } },
        { name: 'b', description: 'B', parameters: { type: 'object' } },
      ],
    })) { /* drain */ }

    expect(captured.system).toEqual([
      { type: 'text', text: 'You are helpful.', cache_control: { type: 'ephemeral' } },
    ])
    const tools = captured.tools as Array<Record<string, unknown>>
    expect(tools).toHaveLength(2)
    expect(tools[0].cache_control).toBeUndefined()
    expect(tools[1].cache_control).toEqual({ type: 'ephemeral' })
  })

  it('throws when no API key', async () => {
    const provider = new AnthropicProvider(() => null)
    await expect(async () => {
      for await (const _ of provider.chat({
        model: 'claude-sonnet-4-6',
        messages: [{ id: '1', role: 'user', content: 'hi', timestamp: 0 }]
      })) { /* consume */ }
    }).rejects.toThrow('Anthropic API key not configured')
  })

  it('paginates through has_more/last_id and assigns cost tiers + context windows per model family', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: [{ id: 'claude-haiku-4-5', display_name: 'Haiku' }],
        has_more: true,
        last_id: 'claude-haiku-4-5',
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: [
          { id: 'claude-sonnet-4-6', display_name: 'Sonnet' },
          { id: 'claude-opus-4-1', display_name: 'Opus' },
        ],
        has_more: false,
      }), { status: 200 }))

    const provider = new AnthropicProvider(() => 'test-key')
    const models = await provider.models()

    expect(models.map(m => m.id)).toEqual(['claude-haiku-4-5', 'claude-sonnet-4-6', 'claude-opus-4-1'])
    expect(models.find(m => m.id === 'claude-haiku-4-5')).toMatchObject({ costTier: 0, contextWindow: 200_000 })
    // Sonnet 4.6 is in the wide-context tier (1M).
    expect(models.find(m => m.id === 'claude-sonnet-4-6')).toMatchObject({ costTier: 1, contextWindow: 1_000_000 })
    expect(models.find(m => m.id === 'claude-opus-4-1')).toMatchObject({ costTier: 2, contextWindow: 200_000 })

    // Second request carries after_id from the first page's last_id.
    const secondCallUrl = String((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[1][0])
    expect(secondCallUrl).toContain('after_id=claude-haiku-4-5')
  })

  it('sends x-api-key and anthropic-version headers when listing models', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ data: [], has_more: false }), { status: 200 })
    )
    const provider = new AnthropicProvider(() => 'my-key')
    await provider.models()
    const init = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1] as RequestInit
    expect((init.headers as Record<string, string>)['x-api-key']).toBe('my-key')
    expect((init.headers as Record<string, string>)['anthropic-version']).toBe('2023-06-01')
  })

  it('returns empty list when the models endpoint responds non-200', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('unauthorized', { status: 401 }))
    const provider = new AnthropicProvider(() => 'bad-key')
    expect(await provider.models()).toEqual([])
  })

  it('returns empty list when fetch throws', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('network down'))
    const provider = new AnthropicProvider(() => 'test-key')
    expect(await provider.models()).toEqual([])
  })

  it('drops temperature for Claude 4.x models but keeps it for Claude 3.x', async () => {
    let capturedNew: Record<string, unknown> = {}
    let capturedOld: Record<string, unknown> = {}
    vi.spyOn(globalThis, 'fetch')
      .mockImplementationOnce(async (_url, init) => {
        capturedNew = JSON.parse((init as RequestInit).body as string)
        return new Response('data: {"type":"message_stop"}\n\n', { status: 200 })
      })
      .mockImplementationOnce(async (_url, init) => {
        capturedOld = JSON.parse((init as RequestInit).body as string)
        return new Response('data: {"type":"message_stop"}\n\n', { status: 200 })
      })

    const provider = new AnthropicProvider(() => 'test-key')
    for await (const _ of provider.chat({
      model: 'claude-opus-4-1', temperature: 0.7,
      messages: [{ id: '1', role: 'user', content: 'hi', timestamp: 0 }],
    })) { /* drain */ }
    for await (const _ of provider.chat({
      model: 'claude-3-opus-20240229', temperature: 0.7,
      messages: [{ id: '1', role: 'user', content: 'hi', timestamp: 0 }],
    })) { /* drain */ }

    expect(capturedNew.temperature).toBeUndefined()
    expect(capturedOld.temperature).toBe(0.7)
  })

  it('shapes the request: URL, headers, max_tokens default, stop_sequences, and message role mapping', async () => {
    let capturedUrl: string | undefined
    let captured: Record<string, unknown> = {}
    vi.spyOn(globalThis, 'fetch').mockImplementationOnce(async (url, init) => {
      capturedUrl = String(url)
      captured = JSON.parse((init as RequestInit).body as string)
      return new Response('data: {"type":"message_stop"}\n\n', { status: 200 })
    })

    const provider = new AnthropicProvider(() => 'test-key')
    for await (const _ of provider.chat({
      model: 'claude-sonnet-4-6',
      messages: [
        { id: '1', role: 'system', content: 'system prompt', timestamp: 0 },
        { id: '2', role: 'user', content: 'hi', timestamp: 1 },
        {
          id: '3', role: 'assistant', content: 'let me check',
          toolCalls: [{ id: 'tc1', name: 'lookup', arguments: '{"x":1}' }], timestamp: 2
        },
        { id: '4', role: 'tool', content: '{"result":true}', toolCallId: 'tc1', timestamp: 3 },
      ],
      stopSequences: ['STOP'],
    })) { /* drain */ }

    expect(capturedUrl).toBe('https://api.anthropic.com/v1/messages')
    expect(captured.max_tokens).toBe(4096)
    expect(captured.stop_sequences).toEqual(['STOP'])
    const messages = captured.messages as Array<Record<string, unknown>>
    expect(messages).toHaveLength(3) // system message excluded from `messages`, folded into tool_use block correctly
    expect(messages[0]).toEqual({ role: 'user', content: 'hi' })
    expect(messages[1]).toEqual({
      role: 'assistant',
      content: [
        { type: 'text', text: 'let me check' },
        { type: 'tool_use', id: 'tc1', name: 'lookup', input: { x: 1 } },
      ],
    })
    expect(messages[2]).toEqual({
      role: 'user',
      content: [{ type: 'tool_result', tool_use_id: 'tc1', content: '{"result":true}' }],
    })
  })

  it('merges consecutive tool-result messages into a single user message', async () => {
    let captured: Record<string, unknown> = {}
    vi.spyOn(globalThis, 'fetch').mockImplementationOnce(async (_url, init) => {
      captured = JSON.parse((init as RequestInit).body as string)
      return new Response('data: {"type":"message_stop"}\n\n', { status: 200 })
    })
    const provider = new AnthropicProvider(() => 'test-key')
    for await (const _ of provider.chat({
      model: 'claude-sonnet-4-6',
      messages: [
        { id: '1', role: 'tool', content: 'r1', toolCallId: 'a', timestamp: 0 },
        { id: '2', role: 'tool', content: 'r2', toolCallId: 'b', timestamp: 1 },
      ],
    })) { /* drain */ }

    const messages = captured.messages as Array<{ role: string; content: unknown[] }>
    expect(messages).toHaveLength(1)
    expect(messages[0].content).toEqual([
      { type: 'tool_result', tool_use_id: 'a', content: 'r1' },
      { type: 'tool_result', tool_use_id: 'b', content: 'r2' },
    ])
  })

  it('throws with status + body text when the messages endpoint responds non-200', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('overloaded', { status: 529 }))
    const provider = new AnthropicProvider(() => 'test-key')
    await expect(async () => {
      for await (const _ of provider.chat({
        model: 'claude-sonnet-4-6',
        messages: [{ id: '1', role: 'user', content: 'hi', timestamp: 0 }],
      })) { /* consume */ }
    }).rejects.toThrow('Anthropic API error 529: overloaded')
  })

  it('throws when the response has no body', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(null, { status: 200 }))
    const provider = new AnthropicProvider(() => 'test-key')
    await expect(async () => {
      for await (const _ of provider.chat({
        model: 'claude-sonnet-4-6',
        messages: [{ id: '1', role: 'user', content: 'hi', timestamp: 0 }],
      })) { /* consume */ }
    }).rejects.toThrow('No response body from Anthropic API')
  })

  it('parses a full SSE turn: text deltas, a tool_use block, usage accumulation, and an in-band error event', async () => {
    const sse = [
      'event: message_start',
      `data: ${JSON.stringify({ type: 'message_start', message: { usage: { input_tokens: 20, output_tokens: 0 } } })}`,
      '',
      `data: ${JSON.stringify({ type: 'content_block_start', content_block: { type: 'text' } })}`,
      `data: ${JSON.stringify({ type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hel' } })}`,
      `data: ${JSON.stringify({ type: 'content_block_delta', delta: { type: 'text_delta', text: 'lo' } })}`,
      `data: ${JSON.stringify({ type: 'content_block_stop' })}`,
      `data: ${JSON.stringify({ type: 'content_block_start', content_block: { type: 'tool_use', id: 'tc_1', name: 'search' } })}`,
      `data: ${JSON.stringify({ type: 'content_block_delta', delta: { type: 'input_json_delta', partial_json: '{"q":' } })}`,
      `data: ${JSON.stringify({ type: 'content_block_delta', delta: { type: 'input_json_delta', partial_json: '"x"}' } })}`,
      `data: ${JSON.stringify({ type: 'content_block_stop' })}`,
      `data: ${JSON.stringify({ type: 'message_delta', usage: { output_tokens: 8 } })}`,
      `data: ${JSON.stringify({ type: 'error', error: { message: 'overloaded_error' } })}`,
      `data: ${JSON.stringify({ type: 'message_stop' })}`,
      '',
    ].join('\n')

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(sse, { status: 200, headers: { 'Content-Type': 'text/event-stream' } })
    )

    const provider = new AnthropicProvider(() => 'test-key')
    const events: unknown[] = []
    for await (const chunk of provider.chat({
      model: 'claude-sonnet-4-6',
      messages: [{ id: '1', role: 'user', content: 'hi', timestamp: 0 }],
    })) {
      events.push(chunk)
    }

    expect(events).toEqual([
      { type: 'text', content: 'Hel' },
      { type: 'text', content: 'lo' },
      { type: 'tool-call', toolCall: { id: 'tc_1', name: 'search', arguments: '{"q":"x"}' } },
      { type: 'error', error: 'overloaded_error' },
      { type: 'done', usage: { inputTokens: 20, outputTokens: 8 } },
    ])
  })
})
