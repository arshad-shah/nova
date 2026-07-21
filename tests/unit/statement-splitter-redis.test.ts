import { describe, it, expect, vi } from 'vitest'
import { splitRedisStatements, redisStatementContribution } from '@/lib/statement-contributions/redis'
import { tabActions } from '@/stores/tab-actions'

describe('splitRedisStatements', () => {
  it('returns empty for empty input', () => {
    expect(splitRedisStatements('')).toEqual([])
  })

  it('treats each non-empty line as a statement', () => {
    const r = splitRedisStatements('GET foo\nSET bar 1\nINCR counter')
    expect(r.map((s) => s.text)).toEqual(['GET foo', 'SET bar 1', 'INCR counter'])
    expect(r.map((s) => s.startLine)).toEqual([1, 2, 3])
  })

  it('skips comment lines and blank lines', () => {
    const r = splitRedisStatements('# header\n\nGET foo\n# another\nSET bar 1')
    expect(r.map((s) => s.text)).toEqual(['GET foo', 'SET bar 1'])
    expect(r.map((s) => s.startLine)).toEqual([3, 5])
  })

  it('captures full line range including end column', () => {
    const r = splitRedisStatements('GET foo')
    expect(r[0]).toMatchObject({ startLine: 1, startColumn: 1, endLine: 1, endColumn: 8 })
  })
})

describe('redisStatementContribution.classifyDestructive', () => {
  it('flags FLUSHALL/FLUSHDB/DEL/UNLINK/GETDEL as destructive', () => {
    for (const cmd of ['FLUSHALL', 'FLUSHDB', 'DEL foo', 'UNLINK foo', 'GETDEL foo', 'del lowercase']) {
      expect(redisStatementContribution.classifyDestructive(cmd)).toEqual({ messageKey: 'query.destructive.generic' })
    }
  })

  it('finds a destructive command on a later line of a multi-line script', () => {
    const r = redisStatementContribution.classifyDestructive('SET a 1\nGET a\nFLUSHALL')
    expect(r).toEqual({ messageKey: 'query.destructive.generic' })
  })

  it('is null for a script with no destructive commands', () => {
    expect(redisStatementContribution.classifyDestructive('GET foo\nSET bar 1')).toBeNull()
  })
})

describe('redisStatementContribution.lensActions', () => {
  it('the "run" action runs the statement text against the owning tab', () => {
    const spy = vi.spyOn(tabActions, 'runStatement').mockImplementation(() => {})
    const action = redisStatementContribution.lensActions?.find((a) => a.id === 'run')
    action!.handler({ tabId: 't1', stmt: { text: 'GET foo' } } as never)
    expect(spy).toHaveBeenCalledWith('t1', 'GET foo')
    spy.mockRestore()
  })
})
