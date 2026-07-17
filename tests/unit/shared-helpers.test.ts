import { describe, it, expect } from 'vitest'
import { clamp } from '../../src/renderer/src/lib/math'
import { formatDuration } from '../../src/renderer/src/lib/format-time'
import { includesFold, matchesFilter } from '../../src/renderer/src/lib/fuzzy-match'
import { makeQueryResult, inferFieldsFromRows } from '../../src/main/db/result-shape'
import { assertConnected } from '../../src/main/db/assert-connected'

describe('clamp', () => {
  it('constrains to the range', () => {
    expect(clamp(5, 0, 10)).toBe(5)
    expect(clamp(-1, 0, 10)).toBe(0)
    expect(clamp(11, 0, 10)).toBe(10)
    expect(clamp(0, 0, 10)).toBe(0)
    expect(clamp(10, 0, 10)).toBe(10)
  })
})

describe('formatDuration', () => {
  it('renders sub-second as ms and rounds', () => {
    expect(formatDuration(0)).toBe('0ms')
    expect(formatDuration(420)).toBe('420ms')
    expect(formatDuration(999.4)).toBe('999ms')
  })
  it('renders one second and up as fixed seconds', () => {
    expect(formatDuration(1000)).toBe('1.0s')
    expect(formatDuration(1500)).toBe('1.5s')
    expect(formatDuration(12345)).toBe('12.3s')
  })
})

describe('includesFold', () => {
  it('is case-insensitive and empty-query matches all', () => {
    expect(includesFold('Hello World', 'hello')).toBe(true)
    expect(includesFold('Hello World', 'WORLD')).toBe(true)
    expect(includesFold('Hello', 'xyz')).toBe(false)
    expect(includesFold('anything', '')).toBe(true)
  })
})

describe('matchesFilter', () => {
  it('matches across fields, skipping nullish', () => {
    expect(matchesFilter('foo', 'a foo b', null, undefined)).toBe(true)
    expect(matchesFilter('BAR', 'nope', 'a bar')).toBe(true)
    expect(matchesFilter('zzz', 'a', 'b', 'c')).toBe(false)
    expect(matchesFilter('', 'a')).toBe(true)
  })
})

describe('makeQueryResult', () => {
  it('derives rowCount and a non-negative duration', () => {
    const start = performance.now()
    const r = makeQueryResult({
      rows: [{ a: 1 }, { a: 2 }],
      fields: [{ name: 'a', dataType: 'int', nullable: false }],
      affectedRows: 2,
      start,
    })
    expect(r.rowCount).toBe(2)
    expect(r.affectedRows).toBe(2)
    expect(r.duration).toBeGreaterThanOrEqual(0)
  })
  it('defaults affectedRows to 0', () => {
    expect(makeQueryResult({ rows: [], fields: [], start: performance.now() }).affectedRows).toBe(0)
  })
})

describe('inferFieldsFromRows', () => {
  it('derives unknown/nullable fields from the first row', () => {
    expect(inferFieldsFromRows([])).toEqual([])
    expect(inferFieldsFromRows([{ id: 1, name: 'x' }])).toEqual([
      { name: 'id', dataType: 'unknown', nullable: true },
      { name: 'name', dataType: 'unknown', nullable: true },
    ])
  })
})

describe('assertConnected', () => {
  it('returns the handle when present', () => {
    const obj = { q: 1 }
    expect(assertConnected(obj)).toBe(obj)
  })
  it('throws the canonical message when null/undefined', () => {
    expect(() => assertConnected(null)).toThrow('Not connected')
    expect(() => assertConnected(undefined)).toThrow('Not connected')
    expect(() => assertConnected(null, 'custom')).toThrow('custom')
  })
})
