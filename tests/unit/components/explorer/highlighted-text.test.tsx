import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { HighlightedText } from '../../../../src/renderer/src/components/explorer/HighlightedText'

/**
 * Behavioural tests for `HighlightedText` — wraps fuzzy-matched characters in
 * a `<mark>` and coalesces adjacent hit/miss runs so a contiguous match isn't
 * split into one `<mark>` per character.
 */

describe('HighlightedText', () => {
  it('renders plain text with no marks when there is no query', () => {
    const { container } = render(<HighlightedText text="users" query="" />)
    expect(container.querySelectorAll('mark')).toHaveLength(0)
    expect(container.textContent).toBe('users')
  })

  it('renders plain text with no marks when the query does not fuzzy-match at all', () => {
    const { container } = render(<HighlightedText text="users" query="xyz" />)
    expect(container.querySelectorAll('mark')).toHaveLength(0)
    expect(container.textContent).toBe('users')
  })

  it('wraps a contiguous substring match in exactly one <mark>, not one per character', () => {
    const { container } = render(<HighlightedText text="customers" query="stom" />)
    const marks = container.querySelectorAll('mark')
    expect(marks).toHaveLength(1)
    expect(marks[0].textContent).toBe('stom')
  })

  it('produces separate <mark> runs for a non-contiguous subsequence match', () => {
    // "cs" subsequence-matches "customers" at the 'c' (index 0) and 's' (index 8) —
    // two disjoint hits, so highlighting must emit two separate <mark> runs,
    // not one that spans (and wrongly highlights) the whole word.
    const { container } = render(<HighlightedText text="customers" query="cs" />)
    const marks = container.querySelectorAll('mark')
    expect(marks.length).toBeGreaterThanOrEqual(2)
    expect([...marks].map((m) => m.textContent)).toEqual(['c', 's'])
  })

  it('preserves full text content (hits + misses) so nothing is dropped by the highlighting pass', () => {
    const { container } = render(<HighlightedText text="orders_history" query="ordhist" />)
    expect(container.textContent).toBe('orders_history')
  })
})
