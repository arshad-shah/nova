// Behavioral tests for PostgresAdapter's non-session, non-timeout, non-schema-
// objects surface: connect/disconnect lifecycle, plain query() result shaping,
// setSchema, and the getTables/getColumns/getIndexes/getSchemas/getDatabases/
// getRowCount introspection queries. Complements (without overlapping)
// postgres-schema-objects.test.ts (getSchemaObjects + query timeoutMs +
// switchDatabase) and postgres-session.test.ts (session/transaction lifecycle).
// Same fake pg.Pool mocking style as those files.
import { describe, it, expect, vi, beforeEach } from 'vitest'

interface QueuedResponse { rows: unknown[]; fields?: unknown[]; rowCount?: number | null }

let queued: QueuedResponse[] = []
let poolQueries: Array<{ sql: string; params?: unknown[] }> = []
let connectCalls = 0
let clientReleased = false

function nextResponse(): QueuedResponse {
  return queued.shift() ?? { rows: [] }
}

const fakeClient = {
  query: vi.fn(async () => nextResponse()),
  release: vi.fn(() => { clientReleased = true }),
}

const fakePool = {
  query: vi.fn(async (sql: string, params?: unknown[]) => { poolQueries.push({ sql, params }); return nextResponse() }),
  connect: vi.fn(async () => { connectCalls++; return fakeClient }),
  end: vi.fn(async () => {}),
}

vi.mock('pg', () => ({
  default: { Pool: class { query = fakePool.query; connect = fakePool.connect; end = fakePool.end } },
}))

import { PostgresAdapter } from '../../src/main/plugins/bundled/postgresql/postgres-adapter'

beforeEach(() => {
  queued = []
  poolQueries = []
  connectCalls = 0
  clientReleased = false
  fakePool.query.mockClear()
  fakePool.connect.mockClear()
  fakePool.end.mockClear()
  fakeClient.query.mockClear()
  fakeClient.release.mockClear()
})

async function connected(config: Record<string, unknown> = { host: 'h', port: 5432, database: 'd' }): Promise<PostgresAdapter> {
  const a = new PostgresAdapter(config)
  await a.connect()
  return a
}

describe('PostgresAdapter.connect / isConnected / disconnect', () => {
  it('connect() acquires and releases a client to validate the pool', async () => {
    await connected()
    expect(connectCalls).toBe(1)
    expect(clientReleased).toBe(true)
  })

  it('isConnected reflects pool lifecycle', async () => {
    const a = new PostgresAdapter({ database: 'd' })
    expect(await a.isConnected()).toBe(false)
    await a.connect()
    expect(await a.isConnected()).toBe(true)
    await a.disconnect()
    expect(await a.isConnected()).toBe(false)
  })
})

describe('PostgresAdapter — "Not connected" guards', () => {
  it('rejects every introspection method before connect()', async () => {
    const a = new PostgresAdapter({ database: 'd' })
    await expect(a.testConnection()).rejects.toThrow(/Not connected/)
    await expect(a.setSchema('s')).rejects.toThrow(/Not connected/)
    await expect(a.query('SELECT 1')).rejects.toThrow(/Not connected/)
    await expect(a.getTables()).rejects.toThrow(/Not connected/)
    await expect(a.getColumns('t')).rejects.toThrow(/Not connected/)
    await expect(a.getIndexes('t')).rejects.toThrow(/Not connected/)
    await expect(a.getSchemas()).rejects.toThrow(/Not connected/)
    await expect(a.getDatabases()).rejects.toThrow(/Not connected/)
    await expect(a.getRowCount('t')).rejects.toThrow(/Not connected/)
    await expect(a.getSchemaObjects()).rejects.toThrow(/Not connected/)
  })
})

describe('PostgresAdapter.testConnection / setSchema', () => {
  it('testConnection extracts the version string', async () => {
    const a = await connected()
    queued.push({ rows: [{ version: 'PostgreSQL 16.1' }] })
    expect((await a.testConnection()).version).toBe('PostgreSQL 16.1')
  })

  it('testConnection falls back to "unknown" with no rows', async () => {
    const a = await connected()
    queued.push({ rows: [] })
    expect((await a.testConnection()).version).toBe('unknown')
  })

  it('setSchema issues SET search_path with the identifier double-quoted', async () => {
    const a = await connected()
    queued.push({ rows: [] })
    await a.setSchema('reporting')
    expect(poolQueries.at(-1)?.sql).toBe('SET search_path TO "reporting"')
  })
})

describe('PostgresAdapter.query — plain shape (no session, no timeout)', () => {
  it('maps fields to FieldInfo using dataTypeID and reports rowCount/affectedRows from the result', async () => {
    const a = await connected()
    queued.push({
      rows: [{ id: 1 }, { id: 2 }],
      fields: [{ name: 'id', dataTypeID: 23 }],
      rowCount: 2,
    })
    const result = await a.query('SELECT id FROM t')
    expect(result.rows).toEqual([{ id: 1 }, { id: 2 }])
    expect(result.fields).toEqual([{ name: 'id', dataType: '23', nullable: true }])
    expect(result.rowCount).toBe(2)
    expect(result.affectedRows).toBe(2)
  })

  it('defaults rows/fields/affectedRows sensibly when the driver omits them', async () => {
    const a = await connected()
    queued.push({ rows: [] })
    const result = await a.query('DELETE FROM t')
    expect(result.rows).toEqual([])
    expect(result.fields).toEqual([])
    expect(result.rowCount).toBe(0)
    expect(result.affectedRows).toBe(0)
  })
})

describe('PostgresAdapter.getTables', () => {
  it('queries information_schema.tables scoped to the schema and flags VIEW rows', async () => {
    const a = await connected()
    queued.push({ rows: [
      { name: 'orders', table_type: 'BASE TABLE' },
      { name: 'order_totals', table_type: 'VIEW' },
    ] })
    const tables = await a.getTables('sales')
    expect(poolQueries.at(-1)?.params).toEqual(['sales'])
    expect(tables).toEqual([
      { name: 'orders', schema: 'sales', type: 'table' },
      { name: 'order_totals', schema: 'sales', type: 'view' },
    ])
  })

  it('defaults to the "public" schema when none is given', async () => {
    const a = await connected()
    queued.push({ rows: [] })
    await a.getTables()
    expect(poolQueries.at(-1)?.params).toEqual(['public'])
  })
})

describe('PostgresAdapter.getColumns', () => {
  it('merges primary-key and foreign-key catalog lookups into the column list', async () => {
    const a = await connected()
    queued.push(
      { rows: [
        { name: 'id', data_type: 'integer', is_nullable: 'NO', column_default: null },
        { name: 'customer_id', data_type: 'integer', is_nullable: 'YES', column_default: null },
      ] }, // columns
      { rows: [{ column_name: 'id' }] }, // pg_index PK lookup
      { rows: [{ column_name: 'customer_id', ref_table: 'customers', ref_column: 'id' }] }, // FK lookup
    )
    const columns = await a.getColumns('orders', 'sales')
    expect(columns).toEqual([
      { name: 'id', dataType: 'integer', nullable: false, defaultValue: null, isPrimaryKey: true, isForeignKey: false, references: undefined },
      { name: 'customer_id', dataType: 'integer', nullable: true, defaultValue: null, isPrimaryKey: false, isForeignKey: true, references: { table: 'customers', column: 'id' } },
    ])
  })
})

describe('PostgresAdapter.getIndexes', () => {
  it('maps aggregated index rows, excluding the primary key index (filtered in SQL)', async () => {
    const a = await connected()
    queued.push({ rows: [
      { index_name: 'idx_email', is_unique: true, columns: ['email'] },
      { index_name: 'idx_name_city', is_unique: false, columns: ['name', 'city'] },
    ] })
    const indexes = await a.getIndexes('users')
    expect(indexes).toEqual([
      { name: 'idx_email', columns: ['email'], unique: true },
      { name: 'idx_name_city', columns: ['name', 'city'], unique: false },
    ])
  })
})

describe('PostgresAdapter.getSchemas / getDatabases', () => {
  it('getSchemas excludes system catalogs', async () => {
    const a = await connected()
    queued.push({ rows: [{ schema_name: 'public' }, { schema_name: 'sales' }] })
    expect(await a.getSchemas()).toEqual(['public', 'sales'])
    expect(poolQueries.at(-1)?.sql).toContain("NOT IN ('pg_catalog', 'information_schema', 'pg_toast')")
  })

  it('getDatabases lists only real, connectable databases', async () => {
    const a = await connected()
    queued.push({ rows: [{ datname: 'appdb' }] })
    expect(await a.getDatabases()).toEqual(['appdb'])
    expect(poolQueries.at(-1)?.sql).toContain('datistemplate = false')
  })
})

describe('PostgresAdapter.getRowCount', () => {
  it('quotes schema.table with double quotes and parses the count as an integer', async () => {
    const a = await connected()
    queued.push({ rows: [{ cnt: '42' }] })
    const count = await a.getRowCount('orders', 'sales')
    expect(poolQueries.at(-1)?.sql).toBe('SELECT count(*) as cnt FROM "sales"."orders"')
    expect(count).toBe(42)
  })

  it('defaults to the "public" schema when none is given', async () => {
    const a = await connected()
    queued.push({ rows: [{ cnt: '0' }] })
    await a.getRowCount('orders')
    expect(poolQueries.at(-1)?.sql).toBe('SELECT count(*) as cnt FROM "public"."orders"')
  })
})

describe('PostgresAdapter.setAutoCommit / requireSession error paths', () => {
  it('turning autoCommit on while a transaction is open issues COMMIT', async () => {
    const a = await connected()
    await a.openSession('s1', { autoCommit: false })
    fakeClient.query.mockClear()
    await a.beginTransaction('s1')
    fakeClient.query.mockClear()
    await a.setAutoCommit('s1', true)
    expect(fakeClient.query).toHaveBeenCalledWith('COMMIT')
  })

  it('turning autoCommit off with no open transaction issues no statement', async () => {
    const a = await connected()
    await a.openSession('s1')
    fakeClient.query.mockClear()
    await a.setAutoCommit('s1', false)
    expect(fakeClient.query).not.toHaveBeenCalled()
  })

  it('setAutoCommit/beginTransaction on an unknown session throw', async () => {
    const a = await connected()
    await expect(a.setAutoCommit('nope', true)).rejects.toThrow(/no open session/i)
    await expect(a.beginTransaction('nope')).rejects.toThrow(/no open session/i)
  })

  it('beginTransaction is a no-op (no extra BEGIN) when the session already has an open transaction', async () => {
    const a = await connected()
    await a.openSession('s1', { autoCommit: false })
    await a.beginTransaction('s1')
    fakeClient.query.mockClear()
    await a.beginTransaction('s1')
    expect(fakeClient.query).not.toHaveBeenCalled()
  })

  it('closeSession on an unknown id is a silent no-op', async () => {
    const a = await connected()
    await expect(a.closeSession('nope')).resolves.toBeUndefined()
  })

  it('commit/rollback on a session with no open transaction are no-ops', async () => {
    const a = await connected()
    await a.openSession('s1')
    fakeClient.query.mockClear()
    await a.commit('s1')
    await a.rollback('s1')
    expect(fakeClient.query).not.toHaveBeenCalled()
  })
})
