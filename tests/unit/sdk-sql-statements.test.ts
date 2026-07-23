import { describe, it, expect } from 'vitest'
import { splitSqlStatements } from '../../src/main/plugins/sdk/sql-statements'

describe('splitSqlStatements', () => {
  it('splits multiple statements on semicolons', () => {
    expect(splitSqlStatements('SELECT 1; SELECT 2;')).toEqual(['SELECT 1', 'SELECT 2'])
  })

  it('returns an empty array for empty input', () => {
    expect(splitSqlStatements('')).toEqual([])
  })

  it('returns an empty array for whitespace-only input', () => {
    expect(splitSqlStatements('   \n\t  ')).toEqual([])
  })

  it('includes a trailing statement with no closing semicolon', () => {
    expect(splitSqlStatements('SELECT 1; SELECT 2')).toEqual(['SELECT 1', 'SELECT 2'])
  })

  it('drops empty statements produced by consecutive semicolons', () => {
    expect(splitSqlStatements('SELECT 1;; SELECT 2;')).toEqual(['SELECT 1', 'SELECT 2'])
  })

  it('does not split on a semicolon inside a single-quoted string', () => {
    expect(splitSqlStatements("SELECT 'a;b'; SELECT 2;")).toEqual(["SELECT 'a;b'", 'SELECT 2'])
  })

  it('does not split on a semicolon inside a double-quoted identifier', () => {
    expect(splitSqlStatements('SELECT "a;b"; SELECT 2;')).toEqual(['SELECT "a;b"', 'SELECT 2'])
  })

  it('handles an escaped (doubled) quote inside a string', () => {
    expect(splitSqlStatements("SELECT 'it''s; fine';")).toEqual(["SELECT 'it''s; fine'"])
  })

  it('ignores a semicolon inside a line comment', () => {
    expect(splitSqlStatements('SELECT 1; -- comment; with semi\nSELECT 2;')).toEqual([
      'SELECT 1',
      'SELECT 2',
    ])
  })

  it('ignores a semicolon inside a block comment', () => {
    expect(splitSqlStatements('SELECT 1; /* a; b */ SELECT 2;')).toEqual(['SELECT 1', 'SELECT 2'])
  })

  it('strips a leading line comment entirely, including its own statement', () => {
    expect(splitSqlStatements('-- just a comment\nSELECT 1;')).toEqual(['SELECT 1'])
  })

  it('handles a block comment with no closing */ by consuming to end of input', () => {
    expect(splitSqlStatements('SELECT 1; /* unterminated')).toEqual(['SELECT 1'])
  })

  it('trims surrounding whitespace from each statement', () => {
    expect(splitSqlStatements('  SELECT 1  ;  \n  SELECT 2  ')).toEqual(['SELECT 1', 'SELECT 2'])
  })

  it('handles mixed quote types within one statement', () => {
    expect(splitSqlStatements(`SELECT "col", 'val;ue' FROM t;`)).toEqual([
      `SELECT "col", 'val;ue' FROM t`,
    ])
  })
})
