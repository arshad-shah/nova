import { describe, it, expect } from 'vitest'
import { createRelationalGetTableData } from '../../src/main/plugins/sdk/relational-helpers'
import type { DbAdapter } from '../../src/main/db/adapter'
import type { SchemaColumn } from '@shared/types'

function col(name: string): SchemaColumn {
  return { name, dataType: 'text', nullable: true, isPrimaryKey: false, isForeignKey: false, defaultValue: null }
}

/** Stub adapter that records the SQL it was asked to run and returns a
 *  configurable number of rows. */
function makeAdapter(rowCount: number) {
  const queries: string[] = []
  const adapter = {
    getColumns: async () => [col('id'), col('name')],
    query: async (sql: string) => {
      queries.push(sql)
      return { rows: Array.from({ length: rowCount }, (_, i) => ({ id: i })), columns: [] }
    },
  } as unknown as DbAdapter
  return { adapter, queries }
}

describe('createRelationalGetTableData', () => {
  it('bounds the browse read with a driver-aware LIMIT clause for each quoting style', async () => {
    for (const quote of ['"', '`'] as const) {
      const read = createRelationalGetTableData(quote)
      const { adapter, queries } = makeAdapter(0)
      await read(adapter, 'users', 'public', { limit: 100 })
      const q = quote
      // Over-fetches by one (limit + 1) so it can report hasMore without COUNT(*).
      expect(queries[0]).toBe(`SELECT * FROM ${q}public${q}.${q}users${q} LIMIT 101`)
    }
  })

  it('renders OFFSET when paging past the first page', async () => {
    const read = createRelationalGetTableData('"')
    const { adapter, queries } = makeAdapter(0)
    await read(adapter, 'users', undefined, { limit: 50, offset: 50 })
    expect(queries[0]).toBe('SELECT * FROM "users" LIMIT 51 OFFSET 50')
  })

  it('honours a driver-declared pagination style (offset-fetch)', async () => {
    const read = createRelationalGetTableData('"', { pagination: { style: 'offset-fetch' } })
    const { adapter, queries } = makeAdapter(0)
    await read(adapter, 'users', undefined, { limit: 10, offset: 20 })
    expect(queries[0]).toBe('SELECT * FROM "users" OFFSET 20 ROWS FETCH NEXT 11 ROWS ONLY')
  })

  it('reports hasMore and trims the extra row when a full page is returned', async () => {
    const read = createRelationalGetTableData('"')
    // Adapter returns limit + 1 rows → there is at least one more row.
    const { adapter } = makeAdapter(11)
    const result = await read(adapter, 'users', undefined, { limit: 10 })
    expect(result.rows).toHaveLength(10)
    expect(result.hasMore).toBe(true)
  })

  it('reports hasMore=false when the page is not full', async () => {
    const read = createRelationalGetTableData('"')
    const { adapter } = makeAdapter(4)
    const result = await read(adapter, 'users', undefined, { limit: 10 })
    expect(result.rows).toHaveLength(4)
    expect(result.hasMore).toBe(false)
  })

  it('issues an unbounded SELECT for the export path (no limit) and omits hasMore', async () => {
    const read = createRelationalGetTableData('"')
    const { adapter, queries } = makeAdapter(3)
    const result = await read(adapter, 'users', 'public')
    expect(queries[0]).toBe('SELECT * FROM "public"."users"')
    expect(result.rows).toHaveLength(3)
    expect(result.hasMore).toBeUndefined()
  })
})
