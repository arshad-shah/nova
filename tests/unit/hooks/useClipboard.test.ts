import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useClipboard } from '@/hooks/useClipboard'
import { useToastStore } from '@/stores/toast'

function mockClipboard(writeText: (text: string) => Promise<void>) {
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: vi.fn(writeText) },
    configurable: true,
  })
}

beforeEach(() => {
  useToastStore.setState({ toasts: [] })
})
afterEach(() => vi.restoreAllMocks())

describe('useClipboard', () => {
  it('writes the given text to the clipboard', () => {
    mockClipboard(async () => {})
    const { result } = renderHook(() => useClipboard())
    act(() => result.current.copy('hello world'))
    expect(navigator.clipboard.writeText).toHaveBeenCalledExactlyOnceWith('hello world')
  })

  it('flips `copied` true immediately, then false after resetDelay', async () => {
    vi.useFakeTimers()
    mockClipboard(async () => {})
    const { result } = renderHook(() => useClipboard())
    act(() => result.current.copy('x', { resetDelay: 500 }))
    expect(result.current.copied).toBe(true)
    act(() => vi.advanceTimersByTime(499))
    expect(result.current.copied).toBe(true)
    act(() => vi.advanceTimersByTime(1))
    expect(result.current.copied).toBe(false)
    vi.useRealTimers()
  })

  it('defaults the reset delay to 1200ms when none is given', () => {
    vi.useFakeTimers()
    mockClipboard(async () => {})
    const { result } = renderHook(() => useClipboard())
    act(() => result.current.copy('x'))
    act(() => vi.advanceTimersByTime(1199))
    expect(result.current.copied).toBe(true)
    act(() => vi.advanceTimersByTime(1))
    expect(result.current.copied).toBe(false)
    vi.useRealTimers()
  })

  it('respects an explicit resetDelay of 0 instead of falling back to the 1200ms default', () => {
    // `options?.resetDelay ?? 1200` must treat 0 as "given"; a `||` fallback
    // would wrongly treat the falsy 0 as "not given" and use 1200ms instead.
    vi.useFakeTimers()
    mockClipboard(async () => {})
    const { result } = renderHook(() => useClipboard())
    act(() => result.current.copy('x', { resetDelay: 0 }))
    act(() => vi.advanceTimersByTime(0))
    expect(result.current.copied).toBe(false)
    vi.useRealTimers()
  })

  it('a second copy before the first reset restarts the timer instead of stacking two resets', () => {
    vi.useFakeTimers()
    mockClipboard(async () => {})
    const { result } = renderHook(() => useClipboard())
    act(() => result.current.copy('a', { resetDelay: 300 }))
    act(() => vi.advanceTimersByTime(200))
    act(() => result.current.copy('b', { resetDelay: 300 })) // resets the 300ms window
    act(() => vi.advanceTimersByTime(200)) // 400ms since 'a', but only 200ms since 'b'
    expect(result.current.copied).toBe(true)
    act(() => vi.advanceTimersByTime(100))
    expect(result.current.copied).toBe(false)
    vi.useRealTimers()
  })

  it('shows a toast with the resolved message when a plain message-key is given', async () => {
    mockClipboard(async () => {})
    const { result } = renderHook(() => useClipboard())
    act(() => result.current.copy('x', { toast: 'aiui.inlineSuggest.accept' }))
    await waitFor(() => expect(useToastStore.getState().toasts).toHaveLength(1))
    expect(useToastStore.getState().toasts[0]).toMatchObject({ type: 'success' })
  })

  it('shows no toast when the toast option is omitted', async () => {
    mockClipboard(async () => {})
    const { result } = renderHook(() => useClipboard())
    act(() => result.current.copy('x'))
    // Let the microtask queue flush; nothing should have been added.
    await Promise.resolve()
    expect(useToastStore.getState().toasts).toHaveLength(0)
  })

  it('fails silently when the clipboard write rejects (e.g. permission denied)', async () => {
    mockClipboard(async () => { throw new Error('denied') })
    const { result } = renderHook(() => useClipboard())
    // Must not throw out of the hook and must not leave a dangling toast.
    expect(() => act(() => result.current.copy('x', { toast: 'aiui.inlineSuggest.accept' }))).not.toThrow()
    await Promise.resolve()
    expect(useToastStore.getState().toasts).toHaveLength(0)
    // `copied` still flips true even though the write failed underneath — the
    // hook doesn't wait on the clipboard promise for that flag.
    expect(result.current.copied).toBe(true)
  })

  it('clears the pending reset timer on unmount', () => {
    vi.useFakeTimers()
    mockClipboard(async () => {})
    const { result, unmount } = renderHook(() => useClipboard())
    act(() => result.current.copy('x', { resetDelay: 100 }))
    unmount()
    // Should not throw when the timer fires after unmount (setCopied on an
    // unmounted hook would otherwise warn/leak).
    expect(() => vi.advanceTimersByTime(200)).not.toThrow()
    vi.useRealTimers()
  })
})
