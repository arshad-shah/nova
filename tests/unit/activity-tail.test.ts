import { describe, it, expect } from 'vitest'
import {
  tailReducer, countPrepended, isAtBottom, INITIAL_TAIL, type TailState,
} from '../../src/renderer/src/lib/activity/tail'

describe('tailReducer', () => {
  it('starts pinned with nothing unseen', () => {
    expect(INITIAL_TAIL).toEqual({ pinned: true, unseen: 0 })
  })

  it('detaches when scrolled away from the bottom', () => {
    expect(tailReducer(INITIAL_TAIL, { type: 'scrolled', atBottom: false })).toEqual({ pinned: false, unseen: 0 })
  })

  it('counts arrivals only while detached', () => {
    const detached: TailState = { pinned: false, unseen: 0 }
    expect(tailReducer(detached, { type: 'appended', count: 3 })).toEqual({ pinned: false, unseen: 3 })
    // Pinned: arrivals auto-scroll into view, nothing to count.
    expect(tailReducer(INITIAL_TAIL, { type: 'appended', count: 3 })).toEqual({ pinned: true, unseen: 0 })
  })

  it('accumulates unseen across multiple appends while detached', () => {
    let s: TailState = { pinned: false, unseen: 0 }
    s = tailReducer(s, { type: 'appended', count: 2 })
    s = tailReducer(s, { type: 'appended', count: 5 })
    expect(s).toEqual({ pinned: false, unseen: 7 })
  })

  it('re-pins and clears the count on reaching the bottom, repin, or reset', () => {
    const detached: TailState = { pinned: false, unseen: 9 }
    expect(tailReducer(detached, { type: 'scrolled', atBottom: true })).toEqual({ pinned: true, unseen: 0 })
    expect(tailReducer(detached, { type: 'repin' })).toEqual({ pinned: true, unseen: 0 })
    expect(tailReducer(detached, { type: 'reset' })).toEqual({ pinned: true, unseen: 0 })
  })

  it('ignores non-positive appends', () => {
    const detached: TailState = { pinned: false, unseen: 4 }
    expect(tailReducer(detached, { type: 'appended', count: 0 })).toBe(detached)
  })

  it('is referentially stable when nothing changes (avoids render churn)', () => {
    expect(tailReducer(INITIAL_TAIL, { type: 'scrolled', atBottom: true })).toBe(INITIAL_TAIL)
    expect(tailReducer(INITIAL_TAIL, { type: 'appended', count: 5 })).toBe(INITIAL_TAIL)
  })
})

describe('countPrepended', () => {
  const list = [{ id: 'c' }, { id: 'b' }, { id: 'a' }] // newest-first

  it('counts the entries prepended ahead of the previous newest', () => {
    expect(countPrepended('a', [{ id: 'c' }, { id: 'b' }, { id: 'a' }])).toBe(2)
    expect(countPrepended('c', list)).toBe(0)
  })

  it('treats an empty previous state as all-new', () => {
    expect(countPrepended(null, list)).toBe(3)
  })

  it('returns -1 when the previous newest is gone (filter switch / clear)', () => {
    expect(countPrepended('z', list)).toBe(-1)
  })
})

describe('isAtBottom', () => {
  it('is true within the tolerance and false beyond it', () => {
    expect(isAtBottom(920, 1000, 80)).toBe(true)     // 0 gap
    expect(isAtBottom(915, 1000, 80)).toBe(true)     // 5px gap, within 8
    expect(isAtBottom(800, 1000, 80)).toBe(false)    // 120px gap
  })
})
