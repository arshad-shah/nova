// mongodb/data-format.ts: getTableData routes through the adapter's own
// query() so collection names never need manual escaping, and the
// jsonl importer accumulates per-line parse/execute errors instead of
// aborting the whole import on the first bad line.
import { describe, it, expect, vi } from 'vitest'
import type { DbAdapter } from '../../src/main/db/adapter'
import type { QueryResult } from '../../shared/types'
import {
  getTableData, jsonLinesExporter, bsonArrayExporter, jsonLinesImporter,
} from '../../src/main/plugins/bundled/mongodb/data-format'

function emptyResult(rows: Record<string, unknown>[] = []): QueryResult {
  return { rows, fields: [], rowCount: rows.length, duration: 0, affectedRows: 0 }
}

describe('mongodb getTableData', () => {
  it('sends a find-all payload with the collection name and an empty filter', async () => {
    const query = vi.fn(async () => emptyResult([{ _id: '1', name: 'a' }]))
    const adapter = { query } as unknown as DbAdapter
    await getTableData(adapter, 'users')
    expect(query).toHaveBeenCalledWith(JSON.stringify({ collection: 'users', operation: 'find', filter: {} }))
  })

  it('derives columns from the first row, marking _id as the primary key', async () => {
    const adapter = { query: vi.fn(async () => emptyResult([{ _id: '1', age: 30 }])) } as unknown as DbAdapter
    const { columns } = await getTableData(adapter, 'users')
    expect(columns).toEqual([
      { name: '_id', dataType: 'string', nullable: true, isPrimaryKey: true, isForeignKey: false, defaultValue: null },
      { name: 'age', dataType: 'number', nullable: true, isPrimaryKey: false, isForeignKey: false, defaultValue: null },
    ])
  })

  it('returns no columns for an empty collection', async () => {
    const adapter = { query: vi.fn(async () => emptyResult([])) } as unknown as DbAdapter
    const { rows, columns } = await getTableData(adapter, 'empty')
    expect(rows).toEqual([])
    expect(columns).toEqual([])
  })
})

describe('mongodb exporters', () => {
  it('jsonLinesExporter emits one JSON line per row with a trailing newline', () => {
    const out = jsonLinesExporter.execute([{ a: 1 }, { b: 2 }])
    expect(out).toBe('{"a":1}\n{"b":2}\n')
  })

  it('jsonLinesExporter produces an empty string for no rows (no dangling newline)', () => {
    expect(jsonLinesExporter.execute([])).toBe('')
  })

  it('bsonArrayExporter emits a pretty-printed JSON array', () => {
    const out = bsonArrayExporter.execute([{ a: 1 }])
    expect(out).toBe(JSON.stringify([{ a: 1 }], null, 2))
  })
})

describe('mongodb jsonLinesImporter', () => {
  it('requires an adapter on the options', async () => {
    await expect(jsonLinesImporter.parse('{}', { tableName: 't' })).rejects.toThrow(/requires an active adapter/)
  })

  it('requires a target collection (tableName)', async () => {
    const adapter = { query: vi.fn() } as unknown as DbAdapter
    await expect(jsonLinesImporter.parse('{}', { adapter })).rejects.toThrow(/target collection/)
  })

  it('inserts each valid document via the adapter and counts them as executed', async () => {
    const query = vi.fn(async () => emptyResult())
    const adapter = { query } as unknown as DbAdapter
    const content = '{"a":1}\n{"a":2}\n'
    const result = await jsonLinesImporter.parse(content, { adapter, tableName: 'items' })
    expect(result.executed).toBe(2)
    expect(result.errors).toEqual([])
    expect(query).toHaveBeenNthCalledWith(1, JSON.stringify({ collection: 'items', operation: 'insertOne', document: { a: 1 } }))
  })

  it('skips blank lines without counting them as executed or erroring', async () => {
    const adapter = { query: vi.fn(async () => emptyResult()) } as unknown as DbAdapter
    const result = await jsonLinesImporter.parse('{"a":1}\n\n   \n{"a":2}', { adapter, tableName: 'items' })
    expect(result.executed).toBe(2)
  })

  it('records a per-line error for invalid JSON but keeps processing subsequent lines', async () => {
    const adapter = { query: vi.fn(async () => emptyResult()) } as unknown as DbAdapter
    const result = await jsonLinesImporter.parse('{"a":1}\nnot json\n{"a":2}', { adapter, tableName: 'items' })
    expect(result.executed).toBe(2)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]).toMatch(/^Line 2: invalid JSON/)
  })

  it('records a per-line error when the adapter rejects the insert, without stopping the import', async () => {
    const adapter = {
      query: vi.fn()
        .mockResolvedValueOnce(emptyResult())
        .mockRejectedValueOnce(new Error('duplicate key'))
        .mockResolvedValueOnce(emptyResult()),
    } as unknown as DbAdapter
    const result = await jsonLinesImporter.parse('{"a":1}\n{"a":2}\n{"a":3}', { adapter, tableName: 'items' })
    expect(result.executed).toBe(2)
    expect(result.errors).toEqual(['Line 2: duplicate key'])
  })
})
