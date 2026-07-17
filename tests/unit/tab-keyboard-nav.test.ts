import { describe, it, expect } from 'vitest'
import { nextFocusIndex } from '@/components/shell/tab-bar/useTabKeyboardNav'

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
