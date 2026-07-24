import { describe, it, expect } from 'vitest'
import type { ActivityEntry } from '../../shared/activity'
import {
  parseFilter, serializeFilter, serializeToken, applyFilter, summarizeLevel,
  dedupeTokens, type FilterToken,
} from '../../src/renderer/src/lib/activity/filter'

const now = Date.now()
const ENTRIES: ActivityEntry[] = [
  { id: '1', ts: now, kind: 'query', level: 'success', title: 'ok one', detail: 'SELECT 1', source: 'pg-main' },
  { id: '2', ts: now, kind: 'query', level: 'error', title: 'Query failed', source: 'pg-main' },
  { id: '3', ts: now, kind: 'connection', level: 'success', title: 'connected', source: 'pg-replica' },
  { id: '4', ts: now, kind: 'log', level: 'debug', title: 'boot', source: 'app' },
  { id: '5', ts: now, kind: 'query', level: 'error', title: 'Query failed', source: 'pg-replica' },
]

describe('parseFilter', () => {
  it('parses typed keys and bare free text', () => {
    expect(parseFilter('level:error kind:query hello')).toEqual([
      { type: 'level', value: 'error' },
      { type: 'kind', value: 'query' },
      { type: 'text', value: 'hello' },
    ])
  })

  it('treats an unknown key as free text (never rejects input)', () => {
    expect(parseFilter('foo:bar')).toEqual([{ type: 'text', value: 'foo:bar' }])
  })

  it('treats a known key with an invalid value as free text', () => {
    expect(parseFilter('level:nope')).toEqual([{ type: 'text', value: 'level:nope' }])
  })

  it('groups a quoted value, including spaces, for source and free text', () => {
    expect(parseFilter('source:"pg main"')).toEqual([{ type: 'source', value: 'pg main' }])
    expect(parseFilter('"two words"')).toEqual([{ type: 'text', value: 'two words' }])
  })

  it('tolerates partial input (a lone key, an open quote)', () => {
    expect(parseFilter('level:')).toEqual([{ type: 'text', value: 'level:' }])
    expect(parseFilter('source:pg')).toEqual([{ type: 'source', value: 'pg' }])
    // An unterminated quote still yields a (text) token, never a throw.
    expect(() => parseFilter('"unterminated')).not.toThrow()
  })

  it('de-duplicates identical tokens', () => {
    expect(parseFilter('level:error level:error')).toEqual([{ type: 'level', value: 'error' }])
  })

  it('ignores empty input', () => {
    expect(parseFilter('   ')).toEqual([])
    expect(parseFilter('')).toEqual([])
  })
})

describe('serialize round-trip', () => {
  it('round-trips a canonical token list', () => {
    const tokens: FilterToken[] = [
      { type: 'level', value: 'error' },
      { type: 'kind', value: 'query' },
      { type: 'source', value: 'pg main' },
      { type: 'text', value: 'boom' },
    ]
    const str = serializeFilter(tokens)
    expect(str).toBe('level:error kind:query source:"pg main" boom')
    expect(parseFilter(str)).toEqual(tokens)
  })

  it('quotes a source or text value that contains whitespace', () => {
    expect(serializeToken({ type: 'source', value: 'a b' })).toBe('source:"a b"')
    expect(serializeToken({ type: 'text', value: 'a b' })).toBe('"a b"')
    expect(serializeToken({ type: 'text', value: 'ab' })).toBe('ab')
  })
})

describe('applyFilter', () => {
  it('returns all entries for an empty filter', () => {
    expect(applyFilter(ENTRIES, [])).toHaveLength(ENTRIES.length)
  })

  it('ANDs across keys and ORs within a key', () => {
    const only = applyFilter(ENTRIES, parseFilter('kind:query level:error'))
    expect(only.map((e) => e.id)).toEqual(['2', '5'])
  })

  it('matches source as a case-insensitive substring', () => {
    const replica = applyFilter(ENTRIES, parseFilter('source:REPLICA'))
    expect(replica.map((e) => e.id)).toEqual(['3', '5'])
  })

  it('ANDs multiple free-text terms across fields', () => {
    const hit = applyFilter(ENTRIES, parseFilter('query failed'))
    expect(hit.map((e) => e.id)).toEqual(['2', '5'])
  })
})

describe('summarizeLevel (deduplicated pill count)', () => {
  it('counts distinct titles and the raw total', () => {
    // Two error entries share the title "Query failed".
    expect(summarizeLevel(ENTRIES, 'error')).toEqual({ distinct: 1, total: 2 })
    expect(summarizeLevel(ENTRIES, 'success')).toEqual({ distinct: 2, total: 2 })
    expect(summarizeLevel(ENTRIES, 'warn')).toEqual({ distinct: 0, total: 0 })
  })
})

describe('dedupeTokens', () => {
  it('drops empty text tokens and later duplicates', () => {
    expect(dedupeTokens([
      { type: 'text', value: '' },
      { type: 'level', value: 'error' },
      { type: 'level', value: 'error' },
    ])).toEqual([{ type: 'level', value: 'error' }])
  })
})
