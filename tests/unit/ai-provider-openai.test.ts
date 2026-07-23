import { describe, it, expect, vi, afterEach } from 'vitest'
import { OpenAIProvider } from '../../src/main/plugins/bundled/ai/internal/providers/openai'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('OpenAIProvider', () => {
  it('has correct metadata', () => {
    const provider = new OpenAIProvider(() => 'test-key')
    expect(provider.id).toBe('openai')
    expect(provider.name).toBe('OpenAI')
    expect(provider.supportsToolCalling).toBe(true)
  })

  it('returns models list', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({
        data: [
          { id: 'gpt-4o' },
          { id: 'gpt-4o-mini' },
          { id: 'whisper-1' } // non-chat, should be filtered out
        ]
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    )
    const provider = new OpenAIProvider(() => 'test-key')
    const models = await provider.models()
    expect(models.length).toBeGreaterThan(0)
    expect(models.some(m => m.id === 'gpt-4o')).toBe(true)
  })

  it('returns empty list when API key is missing', async () => {
    const provider = new OpenAIProvider(() => null)
    const models = await provider.models()
    expect(models).toEqual([])
  })

  it('throws when no API key', async () => {
    const provider = new OpenAIProvider(() => null)
    await expect(async () => {
      for await (const _ of provider.chat({
        model: 'gpt-4o',
        messages: [{ id: '1', role: 'user', content: 'hi', timestamp: 0 }]
      })) { /* consume */ }
    }).rejects.toThrow('OpenAI API key not configured')
  })

  it('sorts models alphabetically and assigns friendly names/cost tiers/context windows', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({
        data: [
          { id: 'o3-mini' },
          { id: 'gpt-4o-mini' },
          { id: 'gpt-4.1-2025-01-01' },
        ]
      }), { status: 200 })
    )
    const provider = new OpenAIProvider(() => 'test-key')
    const models = await provider.models()
    expect(models.map(m => m.id)).toEqual(['gpt-4.1-2025-01-01', 'gpt-4o-mini', 'o3-mini'])

    const gpt41 = models.find(m => m.id === 'gpt-4.1-2025-01-01')!
    expect(gpt41.name).toBe('GPT-4.1 (2025-01-01)')
    expect(gpt41.contextWindow).toBe(1_047_576)
    expect(gpt41.costTier).toBe(2)

    const mini = models.find(m => m.id === 'gpt-4o-mini')!
    expect(mini.name).toBe('GPT-4o mini')
    expect(mini.contextWindow).toBe(128_000)
    expect(mini.costTier).toBe(1)

    const o3mini = models.find(m => m.id === 'o3-mini')!
    expect(o3mini.name).toBe('o3 mini')
    expect(o3mini.contextWindow).toBe(200_000)
    expect(o3mini.costTier).toBe(1)

    for (const m of models) expect(m.capabilities).toEqual(['chat', 'tool-calling'])
  })

  it('returns empty list when the models endpoint responds non-200', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('unauthorized', { status: 401 })
    )
    const provider = new OpenAIProvider(() => 'bad-key')
    expect(await provider.models()).toEqual([])
  })

  it('returns empty list when fetch throws (network error)', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('network down'))
    const provider = new OpenAIProvider(() => 'test-key')
    expect(await provider.models()).toEqual([])
  })

  it('throws with status + body text when the chat endpoint responds non-200', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('rate limited', { status: 429 })
    )
    const provider = new OpenAIProvider(() => 'test-key')
    await expect(async () => {
      for await (const _ of provider.chat({
        model: 'gpt-4o',
        messages: [{ id: '1', role: 'user', content: 'hi', timestamp: 0 }]
      })) { /* consume */ }
    }).rejects.toThrow('OpenAI API error 429: rate limited')
  })

  it('shapes the chat request body: url, headers, model, messages, tools, temperature, maxTokens, stop', async () => {
    let capturedUrl: string | undefined
    let capturedInit: RequestInit | undefined
    vi.spyOn(globalThis, 'fetch').mockImplementationOnce(async (url, init) => {
      capturedUrl = String(url)
      capturedInit = init as RequestInit
      return new Response('data: [DONE]\n\n', { status: 200, headers: { 'Content-Type': 'text/event-stream' } })
    })

    const provider = new OpenAIProvider(() => 'test-key')
    for await (const _ of provider.chat({
      model: 'gpt-4o',
      messages: [
        { id: '1', role: 'user', content: 'hi', timestamp: 0 },
        { id: '2', role: 'assistant', content: '', toolCalls: [{ id: 'call_1', name: 'do_thing', arguments: '{}' }], timestamp: 1 },
        { id: '3', role: 'tool', content: '{"ok":true}', toolCallId: 'call_1', timestamp: 2 },
      ],
      tools: [{ name: 'do_thing', description: 'does a thing', parameters: { type: 'object' } }],
      temperature: 0.5,
      maxTokens: 123,
      stopSequences: ['STOP'],
    })) { /* drain */ }

    expect(capturedUrl).toBe('https://api.openai.com/v1/chat/completions')
    expect((capturedInit!.headers as Record<string, string>).Authorization).toBe('Bearer test-key')
    const body = JSON.parse(capturedInit!.body as string)
    expect(body.model).toBe('gpt-4o')
    expect(body.stream).toBe(true)
    expect(body.temperature).toBe(0.5)
    expect(body.max_tokens).toBe(123)
    expect(body.stop).toEqual(['STOP'])
    expect(body.tools).toEqual([{ type: 'function', function: { name: 'do_thing', description: 'does a thing', parameters: { type: 'object' } } }])
    expect(body.messages[0]).toEqual({ role: 'user', content: 'hi' })
    expect(body.messages[1]).toEqual({
      role: 'assistant', content: null,
      tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'do_thing', arguments: '{}' } }]
    })
    expect(body.messages[2]).toEqual({ role: 'tool', tool_call_id: 'call_1', content: '{"ok":true}' })
  })

  it('parses SSE text deltas, accumulates streamed tool-call argument fragments, and yields usage on [DONE]', async () => {
    const sse = [
      `data: ${JSON.stringify({ choices: [{ delta: { content: 'Hel' } }] })}`,
      `data: ${JSON.stringify({ choices: [{ delta: { content: 'lo' } }] })}`,
      `data: ${JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, id: 'call_9', function: { name: 'search', arguments: '{"q":' } }] } }] })}`,
      `data: ${JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '"x"}' } }] } }] })}`,
      `data: ${JSON.stringify({ choices: [], usage: { prompt_tokens: 10, completion_tokens: 5 } })}`,
      'data: [DONE]',
      '',
    ].join('\n')

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(sse, { status: 200, headers: { 'Content-Type': 'text/event-stream' } })
    )

    const provider = new OpenAIProvider(() => 'test-key')
    const events: unknown[] = []
    for await (const chunk of provider.chat({
      model: 'gpt-4o',
      messages: [{ id: '1', role: 'user', content: 'hi', timestamp: 0 }],
    })) {
      events.push(chunk)
    }

    expect(events).toEqual([
      { type: 'text', content: 'Hel' },
      { type: 'text', content: 'lo' },
      { type: 'tool-call', toolCall: { id: 'call_9', name: 'search', arguments: '{"q":"x"}' } },
      { type: 'done', usage: { inputTokens: 10, outputTokens: 5 } },
    ])
  })

  it('throws when the chat response has no body', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(null, { status: 200 })
    )
    const provider = new OpenAIProvider(() => 'test-key')
    await expect(async () => {
      for await (const _ of provider.chat({
        model: 'gpt-4o',
        messages: [{ id: '1', role: 'user', content: 'hi', timestamp: 0 }],
      })) { /* consume */ }
    }).rejects.toThrow('No response body from OpenAI API')
  })
})
