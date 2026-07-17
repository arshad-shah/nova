import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { editor } from 'monaco-editor'
import { useAIInlineSuggest } from '@/hooks/useAIInlineSuggest'
import { useAIStore } from '@/stores/ai'
import * as monacoAI from '@/lib/monaco-ai-completion'

// The hook's job is to turn the inline-AI state machine into two Monaco
// overlay widgets; the state machine itself (debouncing, IPC, caching) is a
// separate module with its own concerns. Mocking it here lets us drive
// idle/thinking/ready transitions directly instead of faking a whole Monaco
// completions round-trip.
vi.mock('@/lib/monaco-ai-completion', async (importOriginal) => {
  const actual = await importOriginal<typeof monacoAI>()
  return {
    ...actual,
    getInlineAIState: vi.fn(() => 'idle'),
    subscribeInlineAIState: vi.fn(() => vi.fn()),
  }
})

/** A minimal fake of Monaco's IStandaloneCodeEditor — just the surface the
 *  hook actually calls. */
function makeEditor() {
  const cursorHandlers: (() => void)[] = []
  return {
    addOverlayWidget: vi.fn(),
    addContentWidget: vi.fn(),
    removeOverlayWidget: vi.fn(),
    removeContentWidget: vi.fn(),
    layoutContentWidget: vi.fn(),
    getPosition: vi.fn(() => ({ lineNumber: 1, column: 1 })),
    onDidChangeCursorPosition: vi.fn((cb: () => void) => {
      cursorHandlers.push(cb)
      return { dispose: vi.fn() }
    }),
    trigger: vi.fn(),
    // test helper, not part of the real Monaco surface
    __fireCursorChange: () => cursorHandlers.forEach((h) => h()),
  } as unknown as editor.IStandaloneCodeEditor & { __fireCursorChange: () => void }
}

beforeEach(() => {
  useAIStore.setState({ activeModel: 'gpt-test', models: [{ id: 'gpt-test', name: 'GPT Test' }] as never })
  // vi.restoreAllMocks() alone doesn't reliably clear call counts on mocks
  // created inside a vi.mock() factory, so each test would otherwise see the
  // previous test's subscribeInlineAIState/getInlineAIState calls tallied in.
  vi.mocked(monacoAI.getInlineAIState).mockClear().mockReturnValue('idle')
  vi.mocked(monacoAI.subscribeInlineAIState).mockClear().mockReturnValue(vi.fn())
})
afterEach(() => vi.restoreAllMocks())

describe('useAIInlineSuggest', () => {
  it('does nothing when editor is null: no widgets registered', () => {
    renderHook(() => useAIInlineSuggest(null))
    expect(monacoAI.subscribeInlineAIState).not.toHaveBeenCalled()
  })

  it('mounts an overlay pill widget and a content toolbar widget for a live editor', () => {
    const ed = makeEditor()
    renderHook(() => useAIInlineSuggest(ed))
    expect(ed.addOverlayWidget).toHaveBeenCalledTimes(1)
    expect(ed.addContentWidget).toHaveBeenCalledTimes(1)
    const overlayWidget = (ed.addOverlayWidget as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(overlayWidget.getId()).toBe('verql.inline-ai.pill')
  })

  it('subscribes to inline-AI state on mount and unsubscribes on unmount', () => {
    const unsub = vi.fn()
    vi.mocked(monacoAI.subscribeInlineAIState).mockReturnValueOnce(unsub)
    const ed = makeEditor()
    const { unmount } = renderHook(() => useAIInlineSuggest(ed))
    expect(monacoAI.subscribeInlineAIState).toHaveBeenCalledTimes(1)
    unmount()
    expect(unsub).toHaveBeenCalledTimes(1)
  })

  it('removes both widgets and disposes the cursor subscription on unmount', () => {
    const ed = makeEditor()
    const { unmount } = renderHook(() => useAIInlineSuggest(ed))
    const disposeSpy = (ed.onDidChangeCursorPosition as ReturnType<typeof vi.fn>).mock.results[0].value.dispose
    unmount()
    expect(ed.removeOverlayWidget).toHaveBeenCalledTimes(1)
    expect(ed.removeContentWidget).toHaveBeenCalledTimes(1)
    expect(disposeSpy).toHaveBeenCalledTimes(1)
  })

  it('re-mounts widgets on the new editor and tears down the old one when the editor instance changes', () => {
    const first = makeEditor()
    const second = makeEditor()
    const { rerender } = renderHook(({ ed }) => useAIInlineSuggest(ed), { initialProps: { ed: first } })
    rerender({ ed: second })
    expect(first.removeOverlayWidget).toHaveBeenCalledTimes(1)
    expect(second.addOverlayWidget).toHaveBeenCalledTimes(1)
  })

  it('relayouts the content widget whenever the cursor moves', () => {
    const ed = makeEditor()
    renderHook(() => useAIInlineSuggest(ed))
    const callsBefore = (ed.layoutContentWidget as ReturnType<typeof vi.fn>).mock.calls.length
    act(() => ed.__fireCursorChange())
    expect((ed.layoutContentWidget as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(callsBefore)
  })

  it('re-renders the toolbar/pill when the subscribed state callback fires (thinking -> ready)', () => {
    let capturedRender: ((s: monacoAI.InlineAIState) => void) | undefined
    vi.mocked(monacoAI.subscribeInlineAIState).mockImplementationOnce((cb) => {
      capturedRender = cb
      return vi.fn()
    })
    const ed = makeEditor()
    renderHook(() => useAIInlineSuggest(ed))
    expect(capturedRender).toBeTypeOf('function')
    // Must not throw when the state machine reports a transition — this is
    // the one path that mounts/unmounts the Toolbar's React root content.
    expect(() => act(() => capturedRender!('ready'))).not.toThrow()
    expect(() => act(() => capturedRender!('idle'))).not.toThrow()
  })

  it('only mounts the accept/reject toolbar content into the DOM when state is "ready"', () => {
    // Regression guard for the actual gating logic (`state === 'ready'`), not
    // just "the callback doesn't throw" — a flipped condition (or one that
    // shows the toolbar for every non-ready state) previously slipped past
    // this suite undetected.
    let capturedRender: ((s: monacoAI.InlineAIState) => void) | undefined
    vi.mocked(monacoAI.subscribeInlineAIState).mockImplementationOnce((cb) => {
      capturedRender = cb
      return vi.fn()
    })
    const ed = makeEditor()
    renderHook(() => useAIInlineSuggest(ed))
    const toolbarNode = (ed.addContentWidget as ReturnType<typeof vi.fn>).mock.calls[0][0].getDomNode() as HTMLElement

    act(() => capturedRender!('thinking'))
    expect(toolbarNode.childElementCount).toBe(0)

    act(() => capturedRender!('ready'))
    expect(toolbarNode.querySelectorAll('button').length).toBe(2) // accept + reject

    act(() => capturedRender!('idle'))
    expect(toolbarNode.childElementCount).toBe(0)
  })

  it('labels the pill with the active model\'s display name, resolved from the AI store', () => {
    useAIStore.setState({ activeModel: 'gpt-test', models: [{ id: 'gpt-test', name: 'GPT Test' }] as never })
    let capturedRender: ((s: monacoAI.InlineAIState) => void) | undefined
    vi.mocked(monacoAI.subscribeInlineAIState).mockImplementationOnce((cb) => {
      capturedRender = cb
      return vi.fn()
    })
    const ed = makeEditor()
    renderHook(() => useAIInlineSuggest(ed))
    const pillNode = (ed.addOverlayWidget as ReturnType<typeof vi.fn>).mock.calls[0][0].getDomNode() as HTMLElement

    act(() => capturedRender!('thinking'))
    expect(pillNode.textContent).toContain('GPT Test')
  })

  it("falls back to the raw model id when it has no matching entry in the store's models list", () => {
    useAIStore.setState({ activeModel: 'mystery-model', models: [] as never })
    let capturedRender: ((s: monacoAI.InlineAIState) => void) | undefined
    vi.mocked(monacoAI.subscribeInlineAIState).mockImplementationOnce((cb) => {
      capturedRender = cb
      return vi.fn()
    })
    const ed = makeEditor()
    renderHook(() => useAIInlineSuggest(ed))
    const pillNode = (ed.addOverlayWidget as ReturnType<typeof vi.fn>).mock.calls[0][0].getDomNode() as HTMLElement

    act(() => capturedRender!('ready'))
    expect(pillNode.textContent).toContain('mystery-model')
  })
})
