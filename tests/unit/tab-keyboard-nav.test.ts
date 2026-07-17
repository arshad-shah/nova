import { describe, it, expect } from 'vitest'
import { nextFocusIndex, resolveRovingId } from '@/components/shell/tab-bar/useTabKeyboardNav'
import type { Tab } from '@shared/types'

function makeTab(id: string): Tab {
  return { id, type: 'query', title: id } as unknown as Tab
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

  it('returns null when there is no active tab and the focused id is gone', () => {
    expect(resolveRovingId('closed-id', null, tabs)).toBeNull()
  })
})
