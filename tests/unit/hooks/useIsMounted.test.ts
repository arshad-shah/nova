import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useIsMounted } from '@/hooks/useIsMounted'

describe('useIsMounted', () => {
  it('reports true while mounted', () => {
    const { result } = renderHook(() => useIsMounted())
    expect(result.current()).toBe(true)
  })

  it('reports false after unmount so a late callback can bail', () => {
    const { result, unmount } = renderHook(() => useIsMounted())
    const isMounted = result.current
    expect(isMounted()).toBe(true)
    unmount()
    expect(isMounted()).toBe(false)
  })

  it('returns a stable probe identity across re-renders', () => {
    const { result, rerender } = renderHook(() => useIsMounted())
    const first = result.current
    rerender()
    expect(result.current).toBe(first)
  })
})
