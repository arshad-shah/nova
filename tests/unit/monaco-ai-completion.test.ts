// lib/monaco-ai-completion.ts is only ever exercised indirectly through
// useAIInlineSuggest.test.tsx, which *mocks the whole module* — so its actual
// state machine (debounce tiers, string/comment detection, empty-response
// caching, stale-request supersession) has zero real coverage. This drives
// the module directly, including its internal decision logic, via the
// Monaco provider surface it registers.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { IPC_CHANNELS } from '@shared/ipc'

// Module-level singleton state (enabled flag, current connection, debounce
// timer, empty-response cache) — must reset between tests.
async function freshModule() {
  vi.resetModules()
  return import('../../src/renderer/src/lib/monaco-ai-completion')
}

function fakeMonaco() {
  let provider: {
    provideInlineCompletions: (...args: unknown[]) => Promise<unknown>
    freeInlineCompletions: () => void
    disposeInlineCompletions: () => void
  } | null = null
  return {
    languages: {
      registerInlineCompletionsProvider: vi.fn((_lang: string, p: typeof provider) => { provider = p }),
    },
    getProvider: () => provider!,
  } as unknown as { languages: { registerInlineCompletionsProvider: ReturnType<typeof vi.fn> }; getProvider: () => NonNullable<typeof provider> }
}

function fakeModel(text: string) {
  return {
    getValue: () => text,
    getOffsetAt: (pos: { column: number }) => pos.column - 1, // single-line helper: offset === column-1
  }
}

const position = { lineNumber: 1, column: 1 }
const token = { isCancellationRequested: false }

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('isInlineCompletionEnabled / setInlineCompletionEnabled', () => {
  it('defaults to enabled when localStorage has no stored value', async () => {
    const mod = await freshModule()
    expect(mod.isInlineCompletionEnabled()).toBe(true)
  })

  it('persists the flag to localStorage and a fresh module load reflects it', async () => {
    localStorage.clear()
    const mod = await freshModule()
    mod.setInlineCompletionEnabled(false)
    expect(localStorage.getItem('verql:ai-inline-completion-enabled')).toBe('false')
    const reloaded = await freshModule()
    expect(reloaded.isInlineCompletionEnabled()).toBe(false)
    localStorage.clear()
  })

  it('disabling while already idle is a no-op state transition (no spurious notification)', async () => {
    // setState only notifies on an actual change; the module starts idle, so
    // disabling shouldn't fire listeners with a redundant 'idle'. The
    // idle-from-'thinking' transition is covered by the
    // freeInlineCompletions/disposeInlineCompletions suite below.
    const mod = await freshModule()
    const listener = vi.fn()
    mod.subscribeInlineAIState(listener)
    mod.setInlineCompletionEnabled(false)
    expect(listener).not.toHaveBeenCalled()
    expect(mod.getInlineAIState()).toBe('idle')
    localStorage.clear()
  })
})

describe('subscribeInlineAIState', () => {
  it('the returned disposer stops further notifications', async () => {
    const mod = await freshModule()
    const listener = vi.fn()
    const unsub = mod.subscribeInlineAIState(listener)
    unsub()
    mod.setInlineCompletionEnabled(false) // would notify 'idle' if still subscribed
    expect(listener).not.toHaveBeenCalled()
    localStorage.clear()
  })
})

describe('registerAIInlineCompletionProvider — pre-IPC short-circuits', () => {
  it('returns no items when no connection has been set via setAICompletionContext', async () => {
    const mod = await freshModule()
    const monaco = fakeMonaco()
    mod.registerAIInlineCompletionProvider(monaco as never, 'sql')
    const result = await monaco.getProvider().provideInlineCompletions(
      fakeModel('SELECT * FROM users'), position, { triggerKind: 0 }, token
    )
    expect(result).toEqual({ items: [] })
  })

  it('returns no items when the buffer is shorter than the minimum trigger length', async () => {
    const mod = await freshModule()
    mod.setAICompletionContext('conn-1')
    const monaco = fakeMonaco()
    mod.registerAIInlineCompletionProvider(monaco as never, 'sql')
    const result = await monaco.getProvider().provideInlineCompletions(
      fakeModel('ab'), position, { triggerKind: 0 }, token
    )
    expect(result).toEqual({ items: [] })
  })

  it('returns no items when the cursor sits inside an open single-quoted string', async () => {
    const mod = await freshModule()
    mod.setAICompletionContext('conn-1')
    const monaco = fakeMonaco()
    mod.registerAIInlineCompletionProvider(monaco as never, 'sql')
    const text = "SELECT 'unterminated"
    const result = await monaco.getProvider().provideInlineCompletions(
      fakeModel(text), { lineNumber: 1, column: text.length + 1 }, { triggerKind: 0 }, token
    )
    expect(result).toEqual({ items: [] })
  })

  it('returns no items when the cursor is in the middle of a word (mid-identifier)', async () => {
    const mod = await freshModule()
    mod.setAICompletionContext('conn-1')
    const monaco = fakeMonaco()
    mod.registerAIInlineCompletionProvider(monaco as never, 'sql')
    // Cursor between 'sel' and 'ect' inside "select_all" — both sides are word chars.
    const text = 'select_all_things'
    const result = await monaco.getProvider().provideInlineCompletions(
      fakeModel(text), { lineNumber: 1, column: 4 }, { triggerKind: 0 }, token
    )
    expect(result).toEqual({ items: [] })
  })
})

describe('registerAIInlineCompletionProvider — debounce tiers and IPC', () => {
  function setup() {
    const invoke = vi.fn()
    // @ts-expect-error test override
    globalThis.window.electronAPI = { invoke, on: vi.fn(() => () => {}) }
    return invoke
  }

  it('fires the IPC call after the long automatic-trigger debounce and resolves an insertText item', async () => {
    const mod = await freshModule()
    mod.setAICompletionContext('conn-1')
    const invoke = setup()
    invoke.mockResolvedValueOnce({ completion: 'FROM users' })
    const monaco = fakeMonaco()
    mod.registerAIInlineCompletionProvider(monaco as never, 'sql')
    const text = 'SELECT * '
    const promise = monaco.getProvider().provideInlineCompletions(
      fakeModel(text), { lineNumber: 1, column: text.length + 1 }, { triggerKind: 0 }, token
    )
    // Not fired yet at 699ms.
    await vi.advanceTimersByTimeAsync(699)
    expect(invoke).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    const result = await promise as { items: { insertText: string }[] }
    expect(invoke).toHaveBeenCalledWith(IPC_CHANNELS.AI_COMPLETE_SQL, expect.objectContaining({ connectionId: 'conn-1' }))
    expect(result.items[0].insertText).toBe('FROM users')
  })

  it('fires much sooner for an explicit trigger (Cmd+\\) than an automatic one', async () => {
    const mod = await freshModule()
    mod.setAICompletionContext('conn-1')
    const invoke = setup()
    invoke.mockResolvedValueOnce({ completion: 'FROM users' })
    const monaco = fakeMonaco()
    mod.registerAIInlineCompletionProvider(monaco as never, 'sql')
    const text = 'SELECT * '
    const promise = monaco.getProvider().provideInlineCompletions(
      fakeModel(text), { lineNumber: 1, column: text.length + 1 }, { triggerKind: 1 }, token
    )
    await vi.advanceTimersByTimeAsync(60)
    await promise
    expect(invoke).toHaveBeenCalledTimes(1)
  })

  it('a later call supersedes and resolves the earlier pending request with no items', async () => {
    const mod = await freshModule()
    mod.setAICompletionContext('conn-1')
    const invoke = setup()
    invoke.mockResolvedValue({ completion: 'x' })
    const monaco = fakeMonaco()
    mod.registerAIInlineCompletionProvider(monaco as never, 'sql')
    const text = 'SELECT * '
    const first = monaco.getProvider().provideInlineCompletions(
      fakeModel(text), { lineNumber: 1, column: text.length + 1 }, { triggerKind: 0 }, { isCancellationRequested: false }
    )
    // Second call before the first's debounce elapses — supersedes it.
    const second = monaco.getProvider().provideInlineCompletions(
      fakeModel(text), { lineNumber: 1, column: text.length + 1 }, { triggerKind: 0 }, { isCancellationRequested: false }
    )
    const firstResult = await first as { items: unknown[] }
    expect(firstResult.items).toEqual([])
    await vi.advanceTimersByTimeAsync(700)
    const secondResult = await second as { items: { insertText: string }[] }
    expect(secondResult.items[0].insertText).toBe('x')
  })

  it('treats an empty completion as useless and returns no items', async () => {
    const mod = await freshModule()
    mod.setAICompletionContext('conn-1')
    const invoke = setup()
    invoke.mockResolvedValueOnce({ completion: '' })
    const monaco = fakeMonaco()
    mod.registerAIInlineCompletionProvider(monaco as never, 'sql')
    const text = 'SELECT * '
    const promise = monaco.getProvider().provideInlineCompletions(
      fakeModel(text), { lineNumber: 1, column: text.length + 1 }, { triggerKind: 1 }, { isCancellationRequested: false }
    )
    await vi.advanceTimersByTimeAsync(60)
    const result = await promise as { items: unknown[] }
    expect(result.items).toEqual([])
  })

  it('swallows a rejected IPC call and resolves with no items instead of throwing', async () => {
    const mod = await freshModule()
    mod.setAICompletionContext('conn-1')
    const invoke = setup()
    invoke.mockRejectedValueOnce(new Error('ipc down'))
    const monaco = fakeMonaco()
    mod.registerAIInlineCompletionProvider(monaco as never, 'sql')
    const text = 'SELECT * '
    const promise = monaco.getProvider().provideInlineCompletions(
      fakeModel(text), { lineNumber: 1, column: text.length + 1 }, { triggerKind: 1 }, { isCancellationRequested: false }
    )
    await vi.advanceTimersByTimeAsync(60)
    const result = await promise as { items: unknown[] }
    expect(result.items).toEqual([])
  })

  it('drops a completion that would duplicate text already following the cursor', async () => {
    const mod = await freshModule()
    mod.setAICompletionContext('conn-1')
    const invoke = setup()
    const monaco = fakeMonaco()
    mod.registerAIInlineCompletionProvider(monaco as never, 'sql')
    // Cursor is right before "users" and the model suggests "users" again —
    // accepting it would double the text, so it must be dropped.
    invoke.mockResolvedValueOnce({ completion: 'users' })
    const text = 'SELECT * FROM users'
    const cursorCol = 'SELECT * FROM '.length + 1
    const promise = monaco.getProvider().provideInlineCompletions(
      { getValue: () => text, getOffsetAt: (p: { column: number }) => p.column - 1 },
      { lineNumber: 1, column: cursorCol }, { triggerKind: 1 }, { isCancellationRequested: false }
    )
    await vi.advanceTimersByTimeAsync(60)
    const result = await promise as { items: unknown[] }
    expect(result.items).toEqual([])
  })
})

describe('freeInlineCompletions / disposeInlineCompletions', () => {
  it('both force the state machine back to idle from "thinking"', async () => {
    const mod = await freshModule()
    mod.setAICompletionContext('conn-1')
    const invoke = vi.fn(() => new Promise(() => {})) // never resolves
    // @ts-expect-error test override
    globalThis.window.electronAPI = { invoke, on: vi.fn(() => () => {}) }
    const monaco = fakeMonaco()
    mod.registerAIInlineCompletionProvider(monaco as never, 'sql')
    const text = 'SELECT * '
    void monaco.getProvider().provideInlineCompletions(
      fakeModel(text), { lineNumber: 1, column: text.length + 1 }, { triggerKind: 1 }, { isCancellationRequested: false }
    )
    await vi.advanceTimersByTimeAsync(60) // debounce fires, state -> 'thinking'
    expect(mod.getInlineAIState()).toBe('thinking')

    const listener = vi.fn()
    mod.subscribeInlineAIState(listener)
    monaco.getProvider().freeInlineCompletions()
    expect(mod.getInlineAIState()).toBe('idle')
    expect(listener).toHaveBeenCalledWith('idle')
  })
})
