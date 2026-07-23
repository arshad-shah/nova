import { describe, it, expect, vi, afterEach } from 'vitest'
import { OllamaProvider, assertSafeOllamaEndpoint } from '../../src/main/plugins/bundled/ai/internal/providers/ollama'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('OllamaProvider', () => {
  it('has correct metadata', () => {
    const provider = new OllamaProvider()
    expect(provider.id).toBe('ollama')
    expect(provider.name).toBe('Ollama')
    expect(provider.supportsToolCalling).toBe(true)
  })

  it('uses custom endpoint', () => {
    const provider = new OllamaProvider('http://custom:1234')
    expect(provider.endpoint).toBe('http://custom:1234')
  })

  it('defaults to localhost:11434', () => {
    const provider = new OllamaProvider()
    expect(provider.endpoint).toBe('http://localhost:11434')
  })
})

describe('assertSafeOllamaEndpoint', () => {
  it('accepts a normal http(s) endpoint', () => {
    expect(() => assertSafeOllamaEndpoint('http://localhost:11434')).not.toThrow()
    expect(() => assertSafeOllamaEndpoint('https://ollama.example.com')).not.toThrow()
  })

  it('rejects an unparsable URL', () => {
    expect(() => assertSafeOllamaEndpoint('not a url')).toThrow('Invalid Ollama endpoint URL')
  })

  it('rejects non-http(s) schemes', () => {
    expect(() => assertSafeOllamaEndpoint('file:///etc/passwd')).toThrow('must use http(s)')
  })

  it('rejects embedded credentials', () => {
    expect(() => assertSafeOllamaEndpoint('http://user:pass@localhost:11434')).toThrow('embedded credentials')
  })

  it('rejects the AWS/GCP/Azure metadata IP', () => {
    expect(() => assertSafeOllamaEndpoint('http://169.254.169.254')).toThrow('not allowed')
  })

  it('rejects other 169.254.x.x link-local hosts', () => {
    expect(() => assertSafeOllamaEndpoint('http://169.254.1.1:80')).toThrow('not allowed')
  })

  it('rejects the GCP metadata hostname', () => {
    expect(() => assertSafeOllamaEndpoint('http://metadata.google.internal')).toThrow('not allowed')
  })

  it('rejects 0.0.0.0', () => {
    expect(() => assertSafeOllamaEndpoint('http://0.0.0.0:11434')).toThrow('not allowed')
  })
})

describe('OllamaProvider.models', () => {
  it('returns models with context length resolved via /api/show, falling back to 8192 when missing', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({
        models: [{ name: 'llama3' }, { name: 'custom-model' }]
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        model_info: { 'llama.context_length': 8000 }
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ model_info: {} }), { status: 200 }))

    const provider = new OllamaProvider()
    const models = await provider.models()

    expect(models).toEqual([
      { id: 'llama3', name: 'llama3', contextWindow: 8000, capabilities: ['chat', 'tool-calling'], costTier: 0 },
      { id: 'custom-model', name: 'custom-model', contextWindow: 8192, capabilities: ['chat', 'tool-calling'], costTier: 0 },
    ])
    expect(fetchMock).toHaveBeenCalledWith('http://localhost:11434/api/tags', undefined)
  })

  it('returns empty list when /api/tags responds non-200', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('nope', { status: 500 }))
    const provider = new OllamaProvider()
    expect(await provider.models()).toEqual([])
  })

  it('returns empty list when fetch throws', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('ECONNREFUSED'))
    const provider = new OllamaProvider()
    expect(await provider.models()).toEqual([])
  })

  it('throws instead of calling models() when the endpoint is unsafe', async () => {
    const provider = new OllamaProvider('http://169.254.169.254')
    // models() swallows internal errors via its own try/catch, so an unsafe
    // endpoint should surface as an empty list rather than a request.
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    expect(await provider.models()).toEqual([])
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})

describe('OllamaProvider.chat', () => {
  it('shapes the request body: model, messages, tools, options.temperature, stop', async () => {
    let capturedUrl: string | undefined
    let capturedInit: RequestInit | undefined
    vi.spyOn(globalThis, 'fetch').mockImplementationOnce(async (url, init) => {
      capturedUrl = String(url)
      capturedInit = init as RequestInit
      return new Response('{"done":true}\n', { status: 200 })
    })

    const provider = new OllamaProvider()
    for await (const _ of provider.chat({
      model: 'llama3',
      messages: [
        { id: '1', role: 'user', content: 'hi', timestamp: 0 },
        { id: '2', role: 'assistant', content: '', toolCalls: [{ id: 'c1', name: 'do_it', arguments: '{"a":1}' }], timestamp: 1 },
        { id: '3', role: 'tool', content: 'result', toolCallId: 'c1', timestamp: 2 },
      ],
      tools: [{ name: 'do_it', description: 'does it', parameters: { type: 'object' } }],
      temperature: 0.2,
      stopSequences: ['END'],
    })) { /* drain */ }

    expect(capturedUrl).toBe('http://localhost:11434/api/chat')
    const body = JSON.parse(capturedInit!.body as string)
    expect(body.model).toBe('llama3')
    expect(body.stream).toBe(true)
    expect(body.options).toEqual({ temperature: 0.2 })
    expect(body.stop).toEqual(['END'])
    expect(body.tools).toEqual([{ type: 'function', function: { name: 'do_it', description: 'does it', parameters: { type: 'object' } } }])
    expect(body.messages[1].tool_calls).toEqual([{ function: { name: 'do_it', arguments: { a: 1 } } }])
    expect(body.messages[2].tool_call_id).toBe('c1')
  })

  it('parses newline-delimited JSON chunks into text and tool-call events, then done', async () => {
    const ndjson = [
      JSON.stringify({ message: { content: 'Hel' } }),
      JSON.stringify({ message: { content: 'lo' } }),
      JSON.stringify({ message: { tool_calls: [{ function: { name: 'search', arguments: { q: 'x' } } }] } }),
      JSON.stringify({ done: true }),
      '',
    ].join('\n')

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(ndjson, { status: 200 }))

    const provider = new OllamaProvider()
    const events: unknown[] = []
    for await (const chunk of provider.chat({
      model: 'llama3',
      messages: [{ id: '1', role: 'user', content: 'hi', timestamp: 0 }],
    })) {
      events.push(chunk)
    }

    expect(events[0]).toEqual({ type: 'text', content: 'Hel' })
    expect(events[1]).toEqual({ type: 'text', content: 'lo' })
    expect(events[2]).toMatchObject({ type: 'tool-call', toolCall: { name: 'search', arguments: '{"q":"x"}' } })
    expect(events[3]).toEqual({ type: 'done' })
    expect(events).toHaveLength(4)
  })

  it('yields an error event (not a throw) when the endpoint responds non-200', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('server error', { status: 500 }))
    const provider = new OllamaProvider()
    const events: unknown[] = []
    for await (const chunk of provider.chat({
      model: 'llama3',
      messages: [{ id: '1', role: 'user', content: 'hi', timestamp: 0 }],
    })) {
      events.push(chunk)
    }
    expect(events).toEqual([{ type: 'error', error: 'Ollama error 500: server error' }])
  })

  it('yields an error event when fetch itself rejects', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('ECONNREFUSED'))
    const provider = new OllamaProvider()
    const events: unknown[] = []
    for await (const chunk of provider.chat({
      model: 'llama3',
      messages: [{ id: '1', role: 'user', content: 'hi', timestamp: 0 }],
    })) {
      events.push(chunk)
    }
    expect(events).toEqual([{ type: 'error', error: 'Error: ECONNREFUSED' }])
  })

  it('yields an error event when the response has no body', async () => {
    const provider = new OllamaProvider()
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(null, { status: 200 }))
    const events: unknown[] = []
    for await (const chunk of provider.chat({
      model: 'llama3',
      messages: [{ id: '1', role: 'user', content: 'hi', timestamp: 0 }],
    })) {
      events.push(chunk)
    }
    expect(events).toEqual([{ type: 'error', error: 'No response body from Ollama' }])
  })
})
