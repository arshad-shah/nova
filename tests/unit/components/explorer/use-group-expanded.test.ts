import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useGroupExpanded } from '../../../../src/renderer/src/components/explorer/schema-group/useGroupExpanded'

/**
 * Behavioural tests for `useGroupExpanded` — persists a schema sub-category's
 * collapsed/expanded state to localStorage, keyed per storageKey (so two
 * different schemas' "Functions" groups don't share state), and degrades
 * gracefully when storage is unavailable/full instead of throwing.
 */

describe('useGroupExpanded', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('defaults to the given defaultExpanded when nothing is stored yet', () => {
    const { result } = renderHook(() => useGroupExpanded('conn-1:public:tables', true))
    expect(result.current[0]).toBe(true)
  })

  it('reads a previously-persisted value instead of the default', () => {
    localStorage.setItem('schema-group:conn-1:public:tables', '1')
    const { result } = renderHook(() => useGroupExpanded('conn-1:public:tables', false))
    expect(result.current[0]).toBe(true)
  })

  it('persists toggles under a namespaced key so it survives a remount', () => {
    const { result, unmount } = renderHook(() => useGroupExpanded('conn-1:public:functions', false))
    act(() => result.current[1](true))
    expect(localStorage.getItem('schema-group:conn-1:public:functions')).toBe('1')
    unmount()

    const { result: result2 } = renderHook(() => useGroupExpanded('conn-1:public:functions', false))
    expect(result2.current[0]).toBe(true)
  })

  it('keeps two different storage keys independent', () => {
    const { result: tables } = renderHook(() => useGroupExpanded('conn-1:public:tables', false))
    const { result: views } = renderHook(() => useGroupExpanded('conn-1:public:views', false))
    act(() => tables.current[1](true))
    expect(views.current[0]).toBe(false)
  })

  it('falls back to defaultExpanded instead of throwing when localStorage.getItem throws', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked') })
    const { result } = renderHook(() => useGroupExpanded('conn-1:public:indexes', true))
    expect(result.current[0]).toBe(true)
    spy.mockRestore()
  })

  it('does not throw when localStorage.setItem fails (quota exceeded) — the in-memory state still flips', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota') })
    const { result } = renderHook(() => useGroupExpanded('conn-1:public:sequences', false))
    expect(() => act(() => result.current[1](true))).not.toThrow()
    expect(result.current[0]).toBe(true)
    spy.mockRestore()
  })
})
