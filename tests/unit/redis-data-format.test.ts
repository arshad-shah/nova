// redis/data-format.ts: getTableData walks a key prefix and dispatches on
// each key's TYPE to read it correctly (GET vs LRANGE vs SMEMBERS vs
// HGETALL vs ZRANGE); a glob-metacharacter prefix must be escaped so a
// "table" named e.g. "user*" can't expand into an unintended wildcard scan.
import { describe, it, expect, vi } from 'vitest'
import type { DbAdapter } from '../../src/main/db/adapter'
import type { QueryResult } from '../../shared/types'
import { getTableData, jsonExporter } from '../../src/main/plugins/bundled/redis/data-format'

function rowsResult(rows: Record<string, unknown>[]): QueryResult {
  return { rows, fields: [], rowCount: rows.length, duration: 0, affectedRows: 0 }
}

// Simulates the adapter's plain-text command protocol: pattern-match the
// leading verb of the query string and return canned per-type responses.
function fakeAdapter(keys: string[], typeOf: Record<string, string>, data: Record<string, unknown>) {
  const query = vi.fn(async (cmd: string) => {
    const [verb, ...rest] = cmd.split(' ')
    if (verb === 'KEYS') return rowsResult(keys.map((k, i) => ({ index: i, value: k })))
    const key = rest[0]
    if (verb === 'TYPE') return rowsResult([{ value: typeOf[key] ?? 'string' }])
    if (verb === 'GET') return rowsResult([{ value: data[key] }])
    if (verb === 'LRANGE') return rowsResult((data[key] as unknown[]).map(v => ({ value: v })))
    if (verb === 'SMEMBERS') return rowsResult((data[key] as unknown[]).map(v => ({ value: v })))
    if (verb === 'ZRANGE') return rowsResult((data[key] as unknown[]).map(v => ({ value: v })))
    if (verb === 'HGETALL') {
      const hash = data[key] as Record<string, unknown>
      return rowsResult(Object.entries(hash).map(([field, value]) => ({ field, value })))
    }
    throw new Error(`unexpected command ${cmd}`)
  })
  return { query } as unknown as DbAdapter
}

describe('redis getTableData — type dispatch', () => {
  it('reads a string key via GET', async () => {
    const adapter = fakeAdapter(['user:1'], { 'user:1': 'string' }, { 'user:1': 'alice' })
    const { rows } = await getTableData(adapter, 'user')
    expect(rows).toEqual([{ key: 'user:1', type: 'string', value: 'alice' }])
  })

  it('reads a list key via LRANGE 0 -1', async () => {
    const adapter = fakeAdapter(['queue:1'], { 'queue:1': 'list' }, { 'queue:1': ['a', 'b'] })
    const { rows } = await getTableData(adapter, 'queue')
    expect(rows[0].value).toEqual(['a', 'b'])
  })

  it('reads a set key via SMEMBERS', async () => {
    const adapter = fakeAdapter(['tags:1'], { 'tags:1': 'set' }, { 'tags:1': ['x', 'y'] })
    const { rows } = await getTableData(adapter, 'tags')
    expect(rows[0].value).toEqual(['x', 'y'])
  })

  it('reads a hash key via HGETALL, folded into a plain object', async () => {
    const adapter = fakeAdapter(['profile:1'], { 'profile:1': 'hash' }, { 'profile:1': { name: 'bob', age: '5' } })
    const { rows } = await getTableData(adapter, 'profile')
    expect(rows[0].value).toEqual({ name: 'bob', age: '5' })
  })

  it('reads a zset key via ZRANGE WITHSCORES', async () => {
    const adapter = fakeAdapter(['board:1'], { 'board:1': 'zset' }, { 'board:1': ['alice', '10'] })
    const { rows } = await getTableData(adapter, 'board')
    expect(rows[0].value).toEqual(['alice', '10'])
  })

  it('records an unrecognized type as null value without throwing', async () => {
    const adapter = fakeAdapter(['weird:1'], { 'weird:1': 'stream' }, {})
    const { rows } = await getTableData(adapter, 'weird')
    expect(rows[0]).toEqual({ key: 'weird:1', type: 'stream', value: null })
  })

  it('falls back to type "unknown" when a per-key command throws mid-walk', async () => {
    const adapter = { query: vi.fn(async (cmd: string) => {
      if (cmd.startsWith('KEYS')) return rowsResult([{ index: 0, value: 'broken:1' }])
      throw new Error('connection reset')
    }) } as unknown as DbAdapter
    const { rows } = await getTableData(adapter, 'broken')
    expect(rows).toEqual([{ key: 'broken:1', type: 'unknown', value: null }])
  })

  it('escapes glob metacharacters in the table/prefix name before scanning', async () => {
    const query = vi.fn(async () => rowsResult([]))
    const adapter = { query } as unknown as DbAdapter
    await getTableData(adapter, 'user*[1]')
    expect(query).toHaveBeenCalledWith('KEYS user\\*\\[1\\]:*')
  })

  it('declares key/type/value as its fixed column shape', async () => {
    const adapter = fakeAdapter([], {}, {})
    const { columns } = await getTableData(adapter, 'empty')
    expect(columns.map(c => c.name)).toEqual(['key', 'type', 'value'])
    expect(columns.find(c => c.name === 'key')?.isPrimaryKey).toBe(true)
  })
})

describe('redis jsonExporter', () => {
  it('pretty-prints rows as a JSON array', () => {
    expect(jsonExporter.execute([{ key: 'a', value: 1 }])).toBe(JSON.stringify([{ key: 'a', value: 1 }], null, 2))
  })

  it('renders an empty export as an empty array', () => {
    expect(jsonExporter.execute([])).toBe('[]')
  })
})
