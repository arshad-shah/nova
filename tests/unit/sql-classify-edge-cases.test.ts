// Additional edge cases for lib/sql-classify.ts not covered by
// tests/unit/sql-classify.test.ts (word-boundary matching, case sensitivity,
// multi-statement detection, and destructive-kind precedence).
import { describe, it, expect } from 'vitest'
import { isSchemaMutatingSql, destructiveKind, stripSqlNoise } from '../../src/renderer/src/lib/sql-classify'

describe('isSchemaMutatingSql - additional edge cases', () => {
  it('is case-insensitive', () => {
    expect(isSchemaMutatingSql('create table t (id int)')).toBe(true)
  })

  it('does not match a DDL keyword that is only a substring of an identifier', () => {
    // "CREATED_AT" contains "CREATE" but the pattern requires a word boundary
    // (\b) right after the keyword, so a plain SELECT on that column must not
    // be misclassified as schema-mutating DDL.
    expect(isSchemaMutatingSql('SELECT created_at FROM t')).toBe(false)
  })

  it('detects DDL as a later statement in a multi-statement string', () => {
    expect(isSchemaMutatingSql('SELECT 1; DROP TABLE t;')).toBe(true)
  })

  it('strips a block comment spanning a newline before matching', () => {
    expect(isSchemaMutatingSql('SELECT 1 /* CREATE\nTABLE x */')).toBe(false)
  })
})

describe('destructiveKind - additional edge cases', () => {
  it('prefers delete-drop-truncate over update-no-where when both patterns are present', () => {
    expect(destructiveKind('UPDATE users SET x = 1; DELETE FROM logs')).toBe('delete-drop-truncate')
  })

  it('returns null for empty input', () => {
    expect(destructiveKind('')).toBeNull()
  })

  it('ignores a destructive keyword mentioned only in a comment', () => {
    expect(destructiveKind('SELECT 1 -- DELETE FROM users')).toBeNull()
  })
})

describe('stripSqlNoise - additional edge cases', () => {
  it('strips a block comment that spans multiple lines', () => {
    expect(stripSqlNoise('SELECT /* multi\nline */ 1')).toBe('SELECT  1')
  })

  it('leaves SQL with no comments untouched', () => {
    expect(stripSqlNoise('SELECT * FROM users')).toBe('SELECT * FROM users')
  })
})
