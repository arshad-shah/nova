import { describe, it, expect, vi } from 'vitest'
import { splitSqlStatements, sqlStatementContribution } from '@/lib/statement-contributions/sql'
import { tabActions } from '@/stores/tab-actions'

describe('splitSqlStatements', () => {
  it('returns empty for empty/whitespace input', () => {
    expect(splitSqlStatements('')).toEqual([])
    expect(splitSqlStatements('   \n  \t  ')).toEqual([])
  })

  it('splits on top-level semicolons', () => {
    const r = splitSqlStatements('SELECT 1; SELECT 2;')
    expect(r.map((s) => s.text)).toEqual(['SELECT 1', 'SELECT 2'])
    expect(r[0].startLine).toBe(1)
    expect(r[1].startLine).toBe(1)
    expect(r[0].startColumn).toBe(1)
    expect(r[1].startColumn).toBeGreaterThan(r[0].endColumn)
  })

  it('detects boundary on newline + statement keyword (no semicolon)', () => {
    const r = splitSqlStatements('SELECT 1\nSELECT 2')
    expect(r.map((s) => s.text)).toEqual(['SELECT 1', 'SELECT 2'])
    expect(r[0].startLine).toBe(1)
    expect(r[1].startLine).toBe(2)
  })

  it('handles mixed terminators', () => {
    const r = splitSqlStatements('SELECT 1;\nUPDATE t SET x=1 WHERE id=1\nDELETE FROM t WHERE id=2;')
    expect(r.map((s) => s.text)).toEqual([
      'SELECT 1',
      'UPDATE t SET x=1 WHERE id=1',
      'DELETE FROM t WHERE id=2',
    ])
    expect(r[0].startLine).toBe(1)
    expect(r[1].startLine).toBe(2)
    expect(r[2].startLine).toBe(3)
  })

  it('ignores semicolons inside string literals', () => {
    const r = splitSqlStatements("SELECT ';not a delim;'; SELECT 2")
    expect(r.map((s) => s.text)).toEqual(["SELECT ';not a delim;'", 'SELECT 2'])
  })

  it('ignores keywords inside line and block comments', () => {
    const r = splitSqlStatements('SELECT 1 -- SELECT fake\n/* SELECT also fake */\n;\nSELECT 2')
    expect(r).toHaveLength(2)
    expect(r[0].text.startsWith('SELECT 1')).toBe(true)
    expect(r[1].text.startsWith('SELECT 2')).toBe(true)
  })

  it('captures full statement range (multi-line)', () => {
    const r = splitSqlStatements('SELECT\n  *\nFROM t')
    expect(r).toHaveLength(1)
    expect(r[0].startLine).toBe(1)
    expect(r[0].endLine).toBe(3)
  })

  it('emits one statement when no terminator and no keyword break', () => {
    const r = splitSqlStatements('SELECT a, b, c FROM t WHERE x = 1')
    expect(r).toHaveLength(1)
  })

  it('drops empty segments from trailing semicolons', () => {
    const r = splitSqlStatements('SELECT 1;;\n;')
    expect(r.map((s) => s.text)).toEqual(['SELECT 1'])
  })

  it('handles WITH (CTE) as a statement starter', () => {
    const r = splitSqlStatements('SELECT 1\nWITH cte AS (SELECT 1) SELECT * FROM cte')
    expect(r).toHaveLength(2)
    expect(r[1].text.startsWith('WITH')).toBe(true)
  })

  it('skips indentation whitespace before a keyword that starts a new statement on its own line', () => {
    const r = splitSqlStatements('SELECT 1\n  SELECT 2')
    expect(r.map((s) => s.text)).toEqual(['SELECT 1', 'SELECT 2'])
    expect(r[1].startColumn).toBe(3)
  })

  it('tracks line numbers across a multi-line block comment', () => {
    const r = splitSqlStatements('SELECT 1 /* line one\nline two\nline three */ + 2')
    expect(r).toHaveLength(1)
    expect(r[0].endLine).toBe(3)
  })

  it('treats a backslash-escaped quote inside a string as part of the string, not its terminator', () => {
    const r = splitSqlStatements("SELECT 'it\\'s fine'; SELECT 2")
    expect(r.map((s) => s.text)).toEqual(["SELECT 'it\\'s fine'", 'SELECT 2'])
  })

  it('tracks line numbers across a newline embedded in a string literal', () => {
    const r = splitSqlStatements("SELECT 'line one\nline two'; SELECT 2")
    const stmts = r
    expect(stmts).toHaveLength(2)
    expect(stmts[0].endLine).toBe(2)
    expect(stmts[1].startLine).toBe(2)
  })

  it('treats a doubled quote inside a string as an escape, not a terminator', () => {
    const r = splitSqlStatements("SELECT 'it''s; fine'; SELECT 2")
    expect(r.map((s) => s.text)).toEqual(["SELECT 'it''s; fine'", 'SELECT 2'])
  })

  it('retains comment text in the emitted statement', () => {
    const r = splitSqlStatements('SELECT 1 /* keep */ FROM t')
    expect(r).toHaveLength(1)
    expect(r[0].text).toBe('SELECT 1 /* keep */ FROM t')
  })

  it('keeps a $$-quoted body intact when dollarQuoting is enabled', () => {
    const src = 'CREATE FUNCTION f() AS $$ BEGIN a; b; END $$ LANGUAGE plpgsql;\nSELECT 2'
    const r = splitSqlStatements(src, { dollarQuoting: true })
    expect(r.map((s) => s.text)).toEqual([
      'CREATE FUNCTION f() AS $$ BEGIN a; b; END $$ LANGUAGE plpgsql',
      'SELECT 2',
    ])
  })

  it('splits a $$-quoted body on internal semicolons when dollarQuoting is off', () => {
    const src = 'CREATE FUNCTION f() AS $$ BEGIN a; b; END $$ LANGUAGE plpgsql'
    const r = splitSqlStatements(src)
    expect(r.length).toBeGreaterThan(1)
  })
})

describe('sqlStatementContribution', () => {
  it('splitStatements filters out statements that are only comments', () => {
    const src = '-- just a comment\nSELECT 1'
    const r = sqlStatementContribution.splitStatements(src)
    expect(r).toHaveLength(1)
    expect(r[0].text).toBe('SELECT 1')
  })

  it('splitStatements drops a block-comment-only statement too', () => {
    const src = 'SELECT 1;\n/* nothing but a comment */\nSELECT 2'
    const r = sqlStatementContribution.splitStatements(src)
    expect(r.map((s) => s.text)).toEqual(['SELECT 1', 'SELECT 2'])
  })

  it('the "run" lens action runs the statement text against the owning tab', () => {
    const spy = vi.spyOn(tabActions, 'runStatement').mockImplementation(() => {})
    const action = sqlStatementContribution.lensActions?.find((a) => a.id === 'run')
    action!.handler({ tabId: 't1', stmt: { text: 'SELECT 1' } } as never)
    expect(spy).toHaveBeenCalledWith('t1', 'SELECT 1')
    spy.mockRestore()
  })

  it('classifyDestructive flags a DELETE/DROP/TRUNCATE statement', () => {
    expect(sqlStatementContribution.classifyDestructive('DELETE FROM users')).toEqual({ messageKey: 'query.destructive.deleteDropTruncate' })
  })

  it('classifyDestructive flags an UPDATE with no WHERE clause', () => {
    expect(sqlStatementContribution.classifyDestructive('UPDATE users SET active = false')).toEqual({ messageKey: 'query.destructive.updateNoWhere' })
  })

  it('classifyDestructive is null for a plain SELECT', () => {
    expect(sqlStatementContribution.classifyDestructive('SELECT * FROM users')).toBeNull()
  })

  it('the "explain" lens action explains the statement text against the owning tab', () => {
    const spy = vi.spyOn(tabActions, 'explainStatement').mockImplementation(() => {})
    const action = sqlStatementContribution.lensActions?.find((a) => a.id === 'explain')
    action!.handler({ tabId: 't1', stmt: { text: 'SELECT 1' } } as never)
    expect(spy).toHaveBeenCalledWith('t1', 'SELECT 1')
    spy.mockRestore()
  })
})
