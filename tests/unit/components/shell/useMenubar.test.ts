import { renderHook, act } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { useMenubar } from '@/components/shell/useMenubar'

describe('useMenubar', () => {
  it('opens a closed menu on toggle and closes it again on a second toggle', () => {
    const { result } = renderHook(() => useMenubar(3))
    expect(result.current.openIndex).toBeNull()
    expect(result.current.anyOpen).toBe(false)

    act(() => result.current.toggle(1))
    expect(result.current.openIndex).toBe(1)
    expect(result.current.isOpen(1)).toBe(true)
    expect(result.current.anyOpen).toBe(true)

    act(() => result.current.toggle(1))
    expect(result.current.openIndex).toBeNull()
    expect(result.current.anyOpen).toBe(false)
  })

  it('toggle switches directly to a different menu without needing a close first', () => {
    const { result } = renderHook(() => useMenubar(3))
    act(() => result.current.toggle(0))
    act(() => result.current.toggle(2))
    expect(result.current.openIndex).toBe(2)
    expect(result.current.isOpen(0)).toBe(false)
  })

  it('hover is a no-op while the bar is at rest (nothing open)', () => {
    const { result } = renderHook(() => useMenubar(3))
    act(() => result.current.hover(1))
    // BUG-sensitive: hovering an unopened bar must never open a menu — a stray
    // mouseenter while nothing is open would otherwise pop a menu unprompted.
    expect(result.current.openIndex).toBeNull()
  })

  it('hover switches the open menu once any menu is already open', () => {
    const { result } = renderHook(() => useMenubar(3))
    act(() => result.current.toggle(0))
    act(() => result.current.hover(2))
    expect(result.current.openIndex).toBe(2)
  })

  it('close clears openIndex and, when refocus is given, focuses that trigger', () => {
    const { result } = renderHook(() => useMenubar(3))
    const btn0 = document.createElement('button')
    const btn1 = document.createElement('button')
    document.body.append(btn0, btn1)
    act(() => {
      result.current.registerTrigger(0)(btn0)
      result.current.registerTrigger(1)(btn1)
    })

    act(() => result.current.toggle(1))
    act(() => result.current.close({ refocus: 0 }))

    expect(result.current.openIndex).toBeNull()
    expect(document.activeElement).toBe(btn0)
    btn0.remove()
    btn1.remove()
  })

  it('close without refocus leaves focus untouched', () => {
    const { result } = renderHook(() => useMenubar(2))
    const btn = document.createElement('button')
    document.body.appendChild(btn)
    btn.focus()
    act(() => result.current.toggle(0))
    act(() => result.current.close())
    expect(document.activeElement).toBe(btn)
    btn.remove()
  })

  it('moveSibling wraps forward past the last index back to 0', () => {
    const { result } = renderHook(() => useMenubar(3))
    act(() => result.current.moveSibling(2, 1))
    expect(result.current.openIndex).toBe(0)
  })

  it('moveSibling wraps backward past the first index to the last', () => {
    const { result } = renderHook(() => useMenubar(3))
    act(() => result.current.moveSibling(0, -1))
    expect(result.current.openIndex).toBe(2)
  })

  it('moveSibling is a no-op when there are zero menus (avoids a divide-by-zero)', () => {
    const { result } = renderHook(() => useMenubar(0))
    act(() => result.current.moveSibling(0, 1))
    // BUG-sensitive: count=0 would make `% count` a NaN-producing modulo by
    // zero if the early-return guard were removed.
    expect(result.current.openIndex).toBeNull()
  })

  it('moveSibling focuses the trigger it lands on', () => {
    const { result } = renderHook(() => useMenubar(2))
    const btn0 = document.createElement('button')
    const btn1 = document.createElement('button')
    document.body.append(btn0, btn1)
    act(() => {
      result.current.registerTrigger(0)(btn0)
      result.current.registerTrigger(1)(btn1)
    })
    act(() => result.current.moveSibling(0, 1))
    expect(document.activeElement).toBe(btn1)
    btn0.remove()
    btn1.remove()
  })
})
