import { describe, it, expect } from 'vitest'
import { formatCompactNumber } from '../../src/renderer/src/lib/format'

describe('formatCompactNumber', () => {
  it('renders numbers under 1,000 as-is', () => {
    expect(formatCompactNumber(0)).toBe('0')
    expect(formatCompactNumber(999)).toBe('999')
  })

  it('renders thousands with one decimal and a "k" suffix', () => {
    expect(formatCompactNumber(1_234)).toBe('1.2k')
    expect(formatCompactNumber(1_000)).toBe('1.0k')
  })

  it('renders millions with one decimal and an "M" suffix', () => {
    expect(formatCompactNumber(2_000_000)).toBe('2.0M')
    expect(formatCompactNumber(1_234_567)).toBe('1.2M')
  })

  it('is exact at the 1,000 and 1,000,000 boundaries', () => {
    expect(formatCompactNumber(999_999)).toBe('1000.0k')
    expect(formatCompactNumber(1_000_000)).toBe('1.0M')
  })

  it('handles negative numbers by falling through to the plain-number branch', () => {
    // Negative counts aren't a real use case (row counts can't be negative),
    // but the function shouldn't throw or produce nonsense for them.
    expect(formatCompactNumber(-5)).toBe('-5')
  })
})
