import { describe, it, expect, vi } from 'vitest'
import { splitMongoStatements, mongoStatementContribution, classifyMongoDestructive } from '@/lib/statement-contributions/mongodb'
import { tabActions } from '@/stores/tab-actions'

describe('splitMongoStatements', () => {
  it('returns empty for empty input', () => {
    expect(splitMongoStatements('')).toEqual([])
  })

  it('emits one statement per balanced top-level brace group', () => {
    const src = '{"find":"users"}\n{"find":"orders"}'
    const r = splitMongoStatements(src)
    expect(r.map((s) => s.text)).toEqual(['{"find":"users"}', '{"find":"orders"}'])
    expect(r.map((s) => s.startLine)).toEqual([1, 2])
  })

  it('keeps a multi-line document as one statement', () => {
    const src = '{\n  "find": "users",\n  "limit": 10\n}'
    const r = splitMongoStatements(src)
    expect(r).toHaveLength(1)
    expect(r[0].startLine).toBe(1)
    expect(r[0].endLine).toBe(4)
  })

  it('treats two consecutive documents as separate even without blank line', () => {
    const src = '{ "a": 1 }{ "b": 2 }'
    const r = splitMongoStatements(src)
    expect(r).toHaveLength(2)
  })

  it('ignores braces inside string literals', () => {
    const src = '{ "x": "has } brace" }\n{ "y": 1 }'
    const r = splitMongoStatements(src)
    expect(r).toHaveLength(2)
  })

  it('keeps a nested object as part of the same top-level statement', () => {
    const src = '{ "a": { "b": 1 } }'
    const r = splitMongoStatements(src)
    expect(r).toHaveLength(1)
    expect(r[0].text).toBe(src)
  })

  it('skips stray characters between top-level documents (array brackets, commas)', () => {
    // db.foo.insertMany([{a:1},{b:2}]) — the splitter only cares about
    // brace-balanced groups, so `[`, `,`, `]`, and the leading call text are
    // just skipped as non-'{' characters.
    const src = 'db.foo.insertMany([{"a":1},{"b":2}])'
    const r = splitMongoStatements(src)
    expect(r.map((s) => s.text)).toEqual(['{"a":1}', '{"b":2}'])
  })

  it('skips leading tabs and carriage returns before a document', () => {
    const src = '\t\r{ "a": 1 }'
    const r = splitMongoStatements(src)
    expect(r).toHaveLength(1)
    expect(r[0].startColumn).toBe(3)
  })

  it('handles an escaped quote inside a string without ending the string early', () => {
    const src = '{ "x": "esc\\"aped" }'
    const r = splitMongoStatements(src)
    expect(r).toHaveLength(1)
    expect(r[0].text).toBe(src)
  })

  it('handles a backslash-newline escape inside a string, tracking the line number', () => {
    const src = '{ "x": "line\\\ncontinued" }\n{ "y": 2 }'
    const r = splitMongoStatements(src)
    expect(r).toHaveLength(2)
    expect(r[1].startLine).toBe(3)
  })

  it('tracks the line number across a real (unescaped) newline inside a string', () => {
    const src = '{ "x": "a\nb" }\n{ "y": 2 }'
    const r = splitMongoStatements(src)
    expect(r).toHaveLength(2)
    expect(r[1].startLine).toBe(3)
  })
})

describe('classifyMongoDestructive', () => {
  it('flags a drop() call as destructive', () => {
    expect(classifyMongoDestructive('db.users.drop()')).toEqual({ messageKey: 'query.destructive.generic' })
  })
  it('flags deleteMany/deleteOne/remove/findOneAndDelete/dropDatabase', () => {
    for (const call of ['db.users.deleteMany({})', 'db.users.deleteOne({})', 'db.users.remove({})', 'db.users.findOneAndDelete({})', 'db.dropDatabase()']) {
      expect(classifyMongoDestructive(call)).not.toBeNull()
    }
  })
  it('is null for a read-only find()', () => {
    expect(classifyMongoDestructive('db.users.find({})')).toBeNull()
  })
})

describe('mongoStatementContribution.lensActions', () => {
  it('the "run" action runs the statement text against the owning tab', () => {
    const spy = vi.spyOn(tabActions, 'runStatement').mockImplementation(() => {})
    const action = mongoStatementContribution.lensActions?.find((a) => a.id === 'run')
    expect(action).toBeDefined()
    action!.handler({ tabId: 't1', stmt: { text: '{"find":"users"}' } } as never)
    expect(spy).toHaveBeenCalledWith('t1', '{"find":"users"}')
    spy.mockRestore()
  })
})
