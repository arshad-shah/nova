import { describe, it, expect } from 'vitest'
import { parseRedisCommands, formatRedisResult } from '../../src/main/plugins/bundled/redis/redis-adapter'

describe('parseRedisCommands', () => {
  it('parses a single command', () => {
    const cmds = parseRedisCommands('GET user:1')
    expect(cmds).toEqual([['GET', 'user:1']])
  })

  it('parses multiple commands', () => {
    const cmds = parseRedisCommands('GET user:1\nSET foo bar')
    expect(cmds).toEqual([['GET', 'user:1'], ['SET', 'foo', 'bar']])
  })

  it('skips empty lines', () => {
    const cmds = parseRedisCommands('GET key\n\nSET foo bar\n')
    expect(cmds).toEqual([['GET', 'key'], ['SET', 'foo', 'bar']])
  })

  it('handles commands with multiple args', () => {
    const cmds = parseRedisCommands('SET foo bar EX 300')
    expect(cmds).toEqual([['SET', 'foo', 'bar', 'EX', '300']])
  })

  it('trims whitespace', () => {
    const cmds = parseRedisCommands('  GET  key  ')
    expect(cmds).toEqual([['GET', 'key']])
  })

  it('keeps a double-quoted value with spaces as a single argument', () => {
    // Previously `SET k "hello world"` split into four tokens and the value
    // could not be written at all.
    expect(parseRedisCommands('SET k "hello world"')).toEqual([['SET', 'k', 'hello world']])
  })

  it('keeps a single-quoted value with spaces as a single argument', () => {
    expect(parseRedisCommands("SET k 'hello world'")).toEqual([['SET', 'k', 'hello world']])
  })

  it('unescapes \\n, \\t and \\xHH inside double quotes', () => {
    expect(parseRedisCommands('SET k "a\\nb\\tc\\x41"')).toEqual([['SET', 'k', 'a\nb\tc\x41']])
  })

  it('treats backslash escapes literally inside single quotes (except \\\')', () => {
    expect(parseRedisCommands("SET k 'a\\nb'")).toEqual([['SET', 'k', 'a\\nb']])
    expect(parseRedisCommands("SET k 'it\\'s'")).toEqual([['SET', 'k', "it's"]])
  })

  it('concatenates adjacent quoted and unquoted runs into one argument', () => {
    expect(parseRedisCommands('SET k "foo"bar')).toEqual([['SET', 'k', 'foobar']])
  })

  it('preserves an empty double-quoted argument', () => {
    expect(parseRedisCommands('SET k ""')).toEqual([['SET', 'k', '']])
  })
})

describe('formatRedisResult', () => {
  it('formats a scalar string result', () => {
    const result = formatRedisResult([{ command: 'GET key', value: 'hello' }])
    expect(result.rows).toEqual([{ value: 'hello' }])
    expect(result.rowCount).toBe(1)
  })

  it('formats a null result', () => {
    const result = formatRedisResult([{ command: 'GET missing', value: null }])
    expect(result.rows).toEqual([{ value: '(nil)' }])
  })

  it('formats an array result', () => {
    const result = formatRedisResult([{ command: 'KEYS *', value: ['user:1', 'user:2', 'session:abc'] }])
    expect(result.rows).toHaveLength(3)
    expect(result.rows[0]).toEqual({ index: 0, value: 'user:1' })
  })

  it('formats a hash result', () => {
    const result = formatRedisResult([{ command: 'HGETALL user:1', value: { name: 'Alice', age: '30' } }])
    expect(result.rows).toHaveLength(2)
    expect(result.rows[0]).toEqual({ field: 'name', value: 'Alice' })
  })

  it('formats multiple command results with delimiters', () => {
    const result = formatRedisResult([
      { command: 'GET foo', value: 'bar' },
      { command: 'GET baz', value: 'qux' }
    ])
    expect(result.rows).toHaveLength(3)
    expect(result.rows[0]).toEqual({ command: 'GET foo', value: 'bar' })
    expect(result.rows[1]).toEqual({ command: '---', value: '---' })
    expect(result.rows[2]).toEqual({ command: 'GET baz', value: 'qux' })
  })
})
