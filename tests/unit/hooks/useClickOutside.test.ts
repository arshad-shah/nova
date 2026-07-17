import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useClickOutside } from '@/hooks/useClickOutside'
import { createRef } from 'react'

function mousedownOn(target: Element) {
  target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
}

describe('useClickOutside', () => {
  let container: HTMLDivElement
  let outside: HTMLDivElement

  beforeEach(() => {
    container = document.createElement('div')
    outside = document.createElement('div')
    document.body.appendChild(container)
    document.body.appendChild(outside)
  })
  afterEach(() => {
    container.remove()
    outside.remove()
  })

  it('fires onOutside when the mousedown target is outside the ref element', () => {
    const ref = createRef<HTMLElement>()
    // @ts-expect-error assigning a plain DOM node to the ref for the test
    ref.current = container
    const onOutside = vi.fn()
    renderHook(() => useClickOutside(ref, onOutside))
    mousedownOn(outside)
    expect(onOutside).toHaveBeenCalledTimes(1)
  })

  it('does not fire when the mousedown target is inside the ref element', () => {
    const ref = createRef<HTMLElement>()
    // @ts-expect-error assigning a plain DOM node to the ref for the test
    ref.current = container
    const onOutside = vi.fn()
    renderHook(() => useClickOutside(ref, onOutside))
    mousedownOn(container)
    expect(onOutside).not.toHaveBeenCalled()
  })

  // BUG: the hook's own doc comment says "A null ref (unmounted element)
  // treats every click as outside" (i.e. onOutside should fire), but the
  // handler is `if (ref.current && !ref.current.contains(...)) onOutside()` —
  // when ref.current is null the `&&` short-circuits to false, so onOutside
  // NEVER fires. This test documents the actual (buggy) behavior: a caller
  // that mounts a ref-holding popover lazily and never assigns the ref in
  // time gets a dismiss-on-outside-click that silently never dismisses.
  it('BUG: never fires when ref.current is null, contradicting its own doc comment', () => {
    const ref = createRef<HTMLElement>()
    const onOutside = vi.fn()
    renderHook(() => useClickOutside(ref, onOutside))
    mousedownOn(outside)
    expect(onOutside).not.toHaveBeenCalled()
  })

  it('does not attach a listener when enabled is false', () => {
    const ref = createRef<HTMLElement>()
    // @ts-expect-error assigning a plain DOM node to the ref for the test
    ref.current = container
    const onOutside = vi.fn()
    renderHook(() => useClickOutside(ref, onOutside, { enabled: false }))
    mousedownOn(outside)
    expect(onOutside).not.toHaveBeenCalled()
  })

  it('removes the listener on unmount', () => {
    const ref = createRef<HTMLElement>()
    // @ts-expect-error assigning a plain DOM node to the ref for the test
    ref.current = container
    const onOutside = vi.fn()
    const { unmount } = renderHook(() => useClickOutside(ref, onOutside))
    unmount()
    mousedownOn(outside)
    expect(onOutside).not.toHaveBeenCalled()
  })

  it('with deferAttach, ignores a mousedown that happens synchronously (before the deferred attach)', () => {
    vi.useFakeTimers()
    const ref = createRef<HTMLElement>()
    // @ts-expect-error assigning a plain DOM node to the ref for the test
    ref.current = container
    const onOutside = vi.fn()
    renderHook(() => useClickOutside(ref, onOutside, { deferAttach: true }))
    // The opening click that mounted the popover fires before setTimeout(0) runs.
    mousedownOn(outside)
    expect(onOutside).not.toHaveBeenCalled()
    vi.advanceTimersByTime(0)
    mousedownOn(outside)
    expect(onOutside).toHaveBeenCalledTimes(1)
    vi.useRealTimers()
  })

  it('with deferAttach, clearing the pending timer on unmount prevents a late attach', () => {
    vi.useFakeTimers()
    const ref = createRef<HTMLElement>()
    // @ts-expect-error assigning a plain DOM node to the ref for the test
    ref.current = container
    const onOutside = vi.fn()
    const { unmount } = renderHook(() => useClickOutside(ref, onOutside, { deferAttach: true }))
    unmount()
    vi.advanceTimersByTime(0)
    mousedownOn(outside)
    expect(onOutside).not.toHaveBeenCalled()
    vi.useRealTimers()
  })
})
