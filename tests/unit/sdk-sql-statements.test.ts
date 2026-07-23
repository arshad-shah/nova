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

  it('does not split on a semicolon inside a line comment, and retains the comment', () => {
    // The comment text now stays in the emitted statement (the old SDK splitter
    // silently deleted it); the `;` inside it still does not delimit.
    expect(splitSqlStatements('SELECT 1; -- comment; with semi\nSELECT 2;')).toEqual([
      'SELECT 1',
      '-- comment; with semi\nSELECT 2',
    ])
  })

  it('does not split on a semicolon inside a block comment, and retains the comment', () => {
    expect(splitSqlStatements('SELECT 1; /* a; b */ SELECT 2;')).toEqual([
      'SELECT 1',
      '/* a; b */ SELECT 2',
    ])
  })

  it('retains a leading line comment as part of its statement', () => {
    expect(splitSqlStatements('-- just a comment\nSELECT 1;')).toEqual([
      '-- just a comment\nSELECT 1',
    ])
  })

  it('handles a block comment with no closing */ by consuming to end of input', () => {
    expect(splitSqlStatements('SELECT 1; /* unterminated')).toEqual([
      'SELECT 1',
      '/* unterminated',
    ])
  })

  it('trims surrounding whitespace from each statement', () => {
    expect(splitSqlStatements('  SELECT 1  ;  \n  SELECT 2  ')).toEqual(['SELECT 1', 'SELECT 2'])
  })

  it('handles mixed quote types within one statement', () => {
    expect(splitSqlStatements(`SELECT "col", 'val;ue' FROM t;`)).toEqual([
      `SELECT "col", 'val;ue' FROM t`,
    ])
  })

  it('does not split inside a backtick-quoted MySQL identifier', () => {
    expect(splitSqlStatements('SELECT `weird;name` FROM t; SELECT 2;')).toEqual([
      'SELECT `weird;name` FROM t',
      'SELECT 2',
    ])
  })

  it('treats a backslash-escaped quote as part of the string', () => {
    expect(splitSqlStatements("SELECT 'it\\'s; fine'; SELECT 2;")).toEqual([
      "SELECT 'it\\'s; fine'",
      'SELECT 2',
    ])
  })

  describe('dollar quoting', () => {
    const body = "CREATE FUNCTION f() RETURNS int AS $$ BEGIN a; RETURN b; END $$ LANGUAGE plpgsql; SELECT 2;"

    it('keeps a $$-quoted body intact when dollarQuoting is enabled', () => {
      expect(splitSqlStatements(body, { dollarQuoting: true })).toEqual([
        'CREATE FUNCTION f() RETURNS int AS $$ BEGIN a; RETURN b; END $$ LANGUAGE plpgsql',
        'SELECT 2',
      ])
    })

    it('splits a $$-quoted body on its internal semicolons when dollarQuoting is off', () => {
      // Proves the behaviour is gated on the capability, not always-on.
      expect(splitSqlStatements(body).length).toBeGreaterThan(2)
    })

    it('handles a named $tag$ delimiter', () => {
      expect(
        splitSqlStatements("SELECT $body$ has a ; inside $body$; SELECT 2;", { dollarQuoting: true }),
      ).toEqual(['SELECT $body$ has a ; inside $body$', 'SELECT 2'])
    })

    it('does not treat a $1 placeholder as a dollar-quote opener', () => {
      expect(
        splitSqlStatements('SELECT * FROM t WHERE id = $1; SELECT 2;', { dollarQuoting: true }),
      ).toEqual(['SELECT * FROM t WHERE id = $1', 'SELECT 2'])
    })
  })
})
