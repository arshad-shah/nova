import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useDebouncedCallback } from '@/hooks/useDebouncedCallback'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('useDebouncedCallback', () => {
  it('delays invocation until `delay` ms after the last call', () => {
    const cb = vi.fn()
    const { result } = renderHook(() => useDebouncedCallback(cb, 200))

    result.current('a')
    expect(cb).not.toHaveBeenCalled()
    vi.advanceTimersByTime(199)
    expect(cb).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(cb).toHaveBeenCalledExactlyOnceWith('a')
  })

  it('resets the timer on each call, so only the last call in a burst fires', () => {
    const cb = vi.fn()
    const { result } = renderHook(() => useDebouncedCallback(cb, 100))

    result.current('a')
    vi.advanceTimersByTime(60)
    result.current('b')
    vi.advanceTimersByTime(60) // 120ms since 'a', but only 60ms since 'b'
    expect(cb).not.toHaveBeenCalled()
    vi.advanceTimersByTime(40)
    expect(cb).toHaveBeenCalledExactlyOnceWith('b')
  })

  it('always invokes the latest callback identity, not the one captured at first render', () => {
    // A caller that doesn't memoize its callback (the point of this hook) must
    // still get the up-to-date closure, or stale state gets captured on fire.
    const first = vi.fn()
    const second = vi.fn()
    const { result, rerender } = renderHook(
      ({ cb }) => useDebouncedCallback(cb, 50),
      { initialProps: { cb: first } },
    )
    result.current('x')
    rerender({ cb: second })
    vi.advanceTimersByTime(50)
    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledExactlyOnceWith('x')
  })

  it('clears the pending timer on unmount so a stale call never fires', () => {
    const cb = vi.fn()
    const { result, unmount } = renderHook(() => useDebouncedCallback(cb, 100))
    result.current('a')
    unmount()
    vi.advanceTimersByTime(200)
    expect(cb).not.toHaveBeenCalled()
  })

  it('passes through multiple arguments', () => {
    const cb = vi.fn()
    const { result } = renderHook(() => useDebouncedCallback(cb, 10))
    result.current(1, 'two', { three: 3 })
    vi.advanceTimersByTime(10)
    expect(cb).toHaveBeenCalledExactlyOnceWith(1, 'two', { three: 3 })
  })
})
