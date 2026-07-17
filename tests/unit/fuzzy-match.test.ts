import { describe, it, expect } from 'vitest'
import { fuzzyMatch, includesFold, matchesFilter } from '../../src/renderer/src/lib/fuzzy-match'

describe('fuzzyMatch', () => {
  it('matches an empty query against anything with zero score and no positions', () => {
    expect(fuzzyMatch('', 'users')).toEqual({ score: 0, positions: [] })
  })

  it('returns null when the target is empty but the query is not', () => {
    expect(fuzzyMatch('u', '')).toBeNull()
  })

  it('returns null when a query character is missing from the target entirely', () => {
    expect(fuzzyMatch('xyz', 'users')).toBeNull()
  })

  it('is case-insensitive on both sides', () => {
    expect(fuzzyMatch('USR', 'Users')).not.toBeNull()
  })

  it('takes the exact-substring fast path and scores a start-of-string match best', () => {
    const atStart = fuzzyMatch('use', 'users')!
    const midString = fuzzyMatch('use', 'database')
    // "database" doesn't contain "use" as a substring, so this exercises the
    // subsequence path instead — just confirm the start match beats a
    // deep-in-string substring match.
    const deepSubstring = fuzzyMatch('log', 'catalog')!
    expect(atStart.positions).toEqual([0, 1, 2])
    expect(atStart.score).toBeLessThan(deepSubstring.score)
    expect(midString).toBeNull()
  })

  it('rewards a word-boundary substring match over a mid-word one', () => {
    // "log" appears after a boundary ('_') in "audit_log" (idx 6) and mid-word
    // in "catalog" (idx 4, no boundary before it) — boundary should score lower.
    const boundary = fuzzyMatch('log', 'audit_log')!
    const midWord = fuzzyMatch('log', 'catalog')!
    expect(boundary.score).toBeLessThan(midWord.score)
  })

  it('falls back to subsequence matching and records every match position in order', () => {
    // "uid" as a subsequence of "user_id": u(0) s i d(4) - wait, must be in order.
    const m = fuzzyMatch('uid', 'user_id')!
    expect(m.positions.length).toBe(3)
    expect(m.positions).toEqual([...m.positions].sort((a, b) => a - b))
  })

  it('scores consecutive subsequence matches better than scattered ones', () => {
    // Neither target contains "abc" as a literal substring (so both go through
    // the subsequence path, not the exact-match fast path), and the filler
    // ('X') isn't a boundary character, isolating the streak bonus from the
    // boundary bonus: 'ab' lands consecutively in the first, apart in the second.
    const consecutive = fuzzyMatch('abc', 'abXXXc')!
    const scattered = fuzzyMatch('abc', 'aXbXXc')!
    expect(consecutive.score).toBeLessThan(scattered.score)
  })

  it('requires subsequence order — later query chars cannot match earlier target chars', () => {
    // 'ba' is not a subsequence of 'ab'
    expect(fuzzyMatch('ba', 'ab')).toBeNull()
  })
})

describe('includesFold', () => {
  it('matches everything when the query is empty', () => {
    expect(includesFold('anything', '')).toBe(true)
  })

  it('is case-insensitive', () => {
    expect(includesFold('UserTable', 'usertable')).toBe(true)
  })

  it('returns false when the query is not a substring', () => {
    expect(includesFold('users', 'zzz')).toBe(false)
  })
})

describe('matchesFilter', () => {
  it('matches everything when the query is empty, even with no fields', () => {
    expect(matchesFilter('')).toBe(true)
  })

  it('matches when any field contains the query, case-insensitively', () => {
    expect(matchesFilter('prod', 'Local Dev', 'Production DB')).toBe(true)
  })

  it('skips null/undefined fields without throwing', () => {
    expect(matchesFilter('x', null, undefined, 'axe')).toBe(true)
    expect(matchesFilter('zzz', null, undefined)).toBe(false)
  })

  it('returns false when no field matches', () => {
    expect(matchesFilter('nope', 'foo', 'bar')).toBe(false)
  })
})
