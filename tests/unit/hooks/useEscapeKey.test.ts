import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useEscapeKey } from '@/hooks/useEscapeKey'

function pressKey(key: string) {
  document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
}

describe('useEscapeKey', () => {
  it('fires onEscape when Escape is pressed', () => {
    const onEscape = vi.fn()
    renderHook(() => useEscapeKey(onEscape))
    pressKey('Escape')
    expect(onEscape).toHaveBeenCalledTimes(1)
  })

  it('ignores every other key', () => {
    const onEscape = vi.fn()
    renderHook(() => useEscapeKey(onEscape))
    pressKey('Enter')
    pressKey('e')
    pressKey('Tab')
    expect(onEscape).not.toHaveBeenCalled()
  })

  it('does not attach a listener when enabled is false', () => {
    const onEscape = vi.fn()
    renderHook(() => useEscapeKey(onEscape, false))
    pressKey('Escape')
    expect(onEscape).not.toHaveBeenCalled()
  })

  it('detaches the listener on unmount', () => {
    const onEscape = vi.fn()
    const { unmount } = renderHook(() => useEscapeKey(onEscape))
    unmount()
    pressKey('Escape')
    expect(onEscape).not.toHaveBeenCalled()
  })

  it('re-attaches with the latest onEscape when the callback identity changes', () => {
    const first = vi.fn()
    const second = vi.fn()
    const { rerender } = renderHook(({ cb }) => useEscapeKey(cb), { initialProps: { cb: first } })
    rerender({ cb: second })
    pressKey('Escape')
    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledTimes(1)
  })

  it('toggling enabled false->true starts responding to Escape again', () => {
    const onEscape = vi.fn()
    const { rerender } = renderHook(({ enabled }) => useEscapeKey(onEscape, enabled), {
      initialProps: { enabled: false },
    })
    pressKey('Escape')
    expect(onEscape).not.toHaveBeenCalled()
    rerender({ enabled: true })
    pressKey('Escape')
    expect(onEscape).toHaveBeenCalledTimes(1)
  })
})
