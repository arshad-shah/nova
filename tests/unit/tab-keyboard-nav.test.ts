import { describe, it, expect } from 'vitest'
import { nextFocusIndex, resolveRovingId, resolvePendingClose } from '@/components/shell/tab-bar/useTabKeyboardNav'
import type { QueryTab } from '@shared/types'

function makeTab(id: string): QueryTab {
  return {
    id,
    type: 'query',
    title: id,
    connectionId: null,
    database: null,
    schema: null,
    sql: '',
    results: null,
    isExecuting: false,
    error: null,
    isDirty: false,
    aiExplanation: null,
  }
}

describe('nextFocusIndex', () => {
  it('moves right and left', () => {
    expect(nextFocusIndex(0, 'ArrowRight', 3)).toBe(1)
    expect(nextFocusIndex(2, 'ArrowLeft', 3)).toBe(1)
  })

  it('does not wrap at either end', () => {
    expect(nextFocusIndex(2, 'ArrowRight', 3)).toBe(2)
    expect(nextFocusIndex(0, 'ArrowLeft', 3)).toBe(0)
  })

  it('jumps to the ends', () => {
    expect(nextFocusIndex(1, 'Home', 3)).toBe(0)
    expect(nextFocusIndex(1, 'End', 3)).toBe(2)
  })

  it('returns null for keys it does not handle', () => {
    expect(nextFocusIndex(1, 'Enter', 3)).toBeNull()
    expect(nextFocusIndex(1, 'a', 3)).toBeNull()
  })

  it('handles an empty strip without throwing', () => {
    expect(nextFocusIndex(0, 'ArrowRight', 0)).toBeNull()
    expect(nextFocusIndex(0, 'End', 0)).toBeNull()
  })
})

describe('resolveRovingId', () => {
  const tabs = [makeTab('a'), makeTab('b'), makeTab('c')]

  it('keeps the focused id when it still exists in tabs', () => {
    expect(resolveRovingId('b', 'a', tabs)).toBe('b')
  })

  it('falls back to the active tab when focusedId is null', () => {
    expect(resolveRovingId(null, 'a', tabs)).toBe('a')
  })

  it('falls back to the active tab when the focused tab has been closed', () => {
    // Regression: a stale focusedId pointing at a closed tab must not strand
    // the strip with zero tab stops (tabIndexFor would return -1 for every
    // tab). It must fall back to the active tab instead.
    expect(resolveRovingId('closed-id', 'a', tabs)).toBe('a')
  })

  it('falls back to the first tab when there is no active tab and the focused id is gone', () => {
    // The one-tab-stop invariant must hold on its own, not contingent on
    // "tabs exist implies one is active" being true elsewhere. With tabs
    // non-empty, this must never return null.
    expect(resolveRovingId('closed-id', null, tabs)).toBe('a')
  })

  it('falls back to the first tab when the active tab id itself is stale', () => {
    expect(resolveRovingId(null, 'closed-id', tabs)).toBe('a')
  })

  it('returns null when there are no tabs at all', () => {
    expect(resolveRovingId(null, null, [])).toBeNull()
  })
})

describe('resolvePendingClose', () => {
  const tabs = [makeTab('a'), makeTab('b'), makeTab('c')]

  it('returns null when nothing is pending', () => {
    expect(resolvePendingClose(null, tabs, [], [])).toBeNull()
  })

  it('resolves to "closed" once the closing tab is gone from tabs', () => {
    const remaining = [makeTab('a'), makeTab('c')]
    expect(resolvePendingClose({ closingId: 'b', neighborId: 'c' }, remaining, [], [])).toBe('closed')
  })

  it('resolves to "pending" while the tab is still open and awaiting a dirty-confirm answer', () => {
    expect(resolvePendingClose({ closingId: 'b', neighborId: 'c' }, tabs, ['b'], [])).toBe('pending')
  })

  it('resolves to "pending" while the tab is still open and awaiting a transaction-confirm answer', () => {
    expect(resolvePendingClose({ closingId: 'b', neighborId: 'c' }, tabs, [], ['b'])).toBe('pending')
  })

  it('resolves to "cancelled" when the tab is still open but no longer awaiting confirmation', () => {
    // Regression: this is the case a lifetime-unbound ref gets wrong — the
    // user cancelled the confirm dialog, the tab never closed, and the
    // pending close must not fire later for an unrelated close of the same
    // tab (mouse X, context menu, Cmd+W).
    expect(resolvePendingClose({ closingId: 'b', neighborId: 'c' }, tabs, [], [])).toBe('cancelled')
  })
})
