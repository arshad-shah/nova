// Behavioral tests for MysqlAdapter — mocks mysql2/promise and asserts the
// SQL/params sent to the pool plus the shape of what comes back. Mirrors the
// mocking style used by tests/unit/bugs/query-timeout.test.ts and
// tests/unit/postgres-schema-objects.test.ts (queue of canned responses,
// captured call log).
import { describe, it, expect, vi, beforeEach } from 'vitest'

interface QueuedResponse { rows?: unknown[]; fields?: unknown[] }
interface Call { sql: unknown; params?: unknown }

let queued: QueuedResponse[] = []
let calls: Call[] = []
let poolEnded = false
let getConnectionCalls = 0
let releaseCalls = 0

function nextResponse(): [unknown, unknown] {
  const r = queued.shift()
  return [r?.rows ?? [], r?.fields ?? []]
}

const fakePool = {
  query: vi.fn(async (sqlOrOpts: unknown, params?: unknown) => {
    if (typeof sqlOrOpts === 'object' && sqlOrOpts !== null) {
      calls.push({ sql: sqlOrOpts })
    } else {
      calls.push({ sql: sqlOrOpts, params })
    }
    return nextResponse()
  }),
  getConnection: vi.fn(async () => {
    getConnectionCalls++
    return { release: vi.fn(() => { releaseCalls++ }) }
  }),
  end: vi.fn(async () => { poolEnded = true }),
}

vi.mock('mysql2/promise', () => ({
  default: { createPool: vi.fn(() => fakePool) },
}))

import { MysqlAdapter } from '../../src/main/plugins/bundled/mysql/mysql-adapter'

beforeEach(() => {
  queued = []
  calls = []
  poolEnded = false
  getConnectionCalls = 0
  releaseCalls = 0
  fakePool.query.mockClear()
  fakePool.getConnection.mockClear()
  fakePool.end.mockClear()
})

async function connected(config: Record<string, unknown> = { host: 'h', port: 3306, database: 'db' }): Promise<MysqlAdapter> {
  const a = new MysqlAdapter(config)
  await a.connect()
  return a
}

describe('MysqlAdapter.connect / isConnected / disconnect', () => {
  it('acquires a connection from the pool and releases it immediately', async () => {
    await connected()
    expect(getConnectionCalls).toBe(1)
    expect(releaseCalls).toBe(1)
  })

  it('isConnected is false before connect and true after', async () => {
    const a = new MysqlAdapter({ database: 'db' })
    expect(await a.isConnected()).toBe(false)
    await a.connect()
    expect(await a.isConnected()).toBe(true)
  })

  it('disconnect ends the pool and flips isConnected back to false', async () => {
    const a = await connected()
    await a.disconnect()
    expect(poolEnded).toBe(true)
    expect(await a.isConnected()).toBe(false)
  })
})

describe('MysqlAdapter — "Not connected" guards', () => {
  it('testConnection/query/getTables/getRowCount all reject before connect()', async () => {
    const a = new MysqlAdapter({ database: 'db' })
    await expect(a.testConnection()).rejects.toThrow(/Not connected/)
    await expect(a.query('SELECT 1')).rejects.toThrow(/Not connected/)
    await expect(a.getTables()).rejects.toThrow(/Not connected/)
    await expect(a.getRowCount('t')).rejects.toThrow(/Not connected/)
    await expect(a.switchDatabase('x')).rejects.toThrow(/Not connected/)
    await expect(a.setSchema('x')).rejects.toThrow(/Not connected/)
    await expect(a.getColumns('t')).rejects.toThrow(/Not connected/)
    await expect(a.getIndexes('t')).rejects.toThrow(/Not connected/)
    await expect(a.getSchemas()).rejects.toThrow(/Not connected/)
    await expect(a.getDatabases()).rejects.toThrow(/Not connected/)
  })
})

describe('MysqlAdapter.testConnection', () => {
  it('extracts the version from the first row', async () => {
    const a = await connected()
    queued.push({ rows: [{ version: '8.0.34' }] })
    const result = await a.testConnection()
    expect(result.version).toBe('8.0.34')
  })

  it('falls back to "unknown" when the row is missing a version field', async () => {
    const a = await connected()
    queued.push({ rows: [{}] })
    const result = await a.testConnection()
    expect(result.version).toBe('unknown')
  })
})

describe('MysqlAdapter.switchDatabase / setSchema', () => {
  it('switchDatabase issues USE with the identifier backtick-quoted and updates config.database', async () => {
    const a = await connected()
    queued.push({ rows: [] })
    await a.switchDatabase('otherdb')
    expect(calls.at(-1)?.sql).toBe('USE `otherdb`')
    // config.database changed — confirmed via getSchemas() reading it back.
    queued.push({ rows: [] })
    const schemas = await a.getSchemas()
    expect(schemas).toEqual(['otherdb'])
  })

  it('setSchema issues USE with the identifier backtick-quoted', async () => {
    const a = await connected()
    queued.push({ rows: [] })
    await a.setSchema('reporting')
    expect(calls.at(-1)?.sql).toBe('USE `reporting`')
  })
})

describe('MysqlAdapter.query', () => {
  it('returns rows/fields/rowCount for a SELECT, mapping nullability from FieldPacket flags', async () => {
    const a = await connected()
    queued.push({
      rows: [{ id: 1, name: 'Alice' }],
      fields: [
        { name: 'id', type: 3, flags: 1 },       // NOT_NULL set
        { name: 'name', type: 253, flags: 0 },   // nullable
      ],
    })
    const result = await a.query('SELECT id, name FROM users')
    expect(result.rows).toEqual([{ id: 1, name: 'Alice' }])
    expect(result.fields).toEqual([
      { name: 'id', dataType: '3', nullable: false },
      { name: 'name', dataType: '253', nullable: true },
    ])
    expect(result.rowCount).toBe(1)
    expect(result.affectedRows).toBe(0)
    expect(result.duration).toBeGreaterThanOrEqual(0)
  })

  it('reports affectedRows from a ResultSetHeader for a non-SELECT statement', async () => {
    const a = await connected()
    // mysql2 returns a single (non-array) ResultSetHeader object for writes.
    queued.push({ rows: undefined, fields: undefined })
    fakePool.query.mockImplementationOnce(async (sql: unknown) => {
      calls.push({ sql })
      return [{ affectedRows: 3 }, undefined]
    })
    const result = await a.query('UPDATE users SET active = 1')
    expect(result.rows).toEqual([])
    expect(result.rowCount).toBe(0)
    expect(result.affectedRows).toBe(3)
  })

  it('sends the timeout options-object form (sql/values/timeout) when timeoutMs is given', async () => {
    const a = await connected()
    queued.push({ rows: [] })
    await a.query('SELECT SLEEP(10)', ['p'], { timeoutMs: 1500.9 })
    const sentOpts = calls.at(-1)?.sql as { sql: string; values: unknown[]; timeout: number }
    expect(sentOpts.sql).toBe('SELECT SLEEP(10)')
    expect(sentOpts.values).toEqual(['p'])
    expect(sentOpts.timeout).toBe(1500) // floored
  })

  it('uses the plain (sql, params) form when no timeout is given', async () => {
    const a = await connected()
    queued.push({ rows: [] })
    await a.query('SELECT 1', ['a'])
    expect(calls.at(-1)).toEqual({ sql: 'SELECT 1', params: ['a'] })
  })

  it('ignores a zero timeout — treats it as "no timeout"', async () => {
    const a = await connected()
    queued.push({ rows: [] })
    await a.query('SELECT 1', undefined, { timeoutMs: 0 })
    expect(calls.at(-1)).toEqual({ sql: 'SELECT 1', params: undefined })
  })
})

describe('MysqlAdapter.getTables', () => {
  it('queries information_schema.tables with the resolved database and flags VIEW rows', async () => {
    const a = await connected({ database: 'shop' })
    queued.push({ rows: [
      { name: 'orders', table_type: 'BASE TABLE' },
      { name: 'order_totals', table_type: 'VIEW' },
    ] })
    const tables = await a.getTables()
    expect(calls.at(-1)?.params).toEqual(['shop'])
    expect(tables).toEqual([
      { name: 'orders', schema: 'shop', type: 'table' },
      { name: 'order_totals', schema: 'shop', type: 'view' },
    ])
  })

  it('uses the explicit schema argument over config.database', async () => {
    const a = await connected({ database: 'shop' })
    queued.push({ rows: [] })
    await a.getTables('otherdb')
    expect(calls.at(-1)?.params).toEqual(['otherdb'])
  })
})

describe('MysqlAdapter.getColumns', () => {
  it('merges the foreign-key lookup into the column list and flags the primary key', async () => {
    const a = await connected({ database: 'shop' })
    queued.push(
      { rows: [
        { name: 'id', data_type: 'int', is_nullable: 'NO', column_default: null, column_key: 'PRI' },
        { name: 'customer_id', data_type: 'int', is_nullable: 'YES', column_default: null, column_key: '' },
      ] },
      { rows: [
        { column_name: 'customer_id', referenced_table_name: 'customers', referenced_column_name: 'id' },
      ] },
    )
    const columns = await a.getColumns('orders')
    expect(columns).toEqual([
      { name: 'id', dataType: 'int', nullable: false, defaultValue: null, isPrimaryKey: true, isForeignKey: false, references: undefined },
      { name: 'customer_id', dataType: 'int', nullable: true, defaultValue: null, isPrimaryKey: false, isForeignKey: true, references: { table: 'customers', column: 'id' } },
    ])
  })

  it('leaves isForeignKey false for every column when there are no referencing FKs', async () => {
    const a = await connected({ database: 'shop' })
    queued.push(
      { rows: [{ name: 'id', data_type: 'int', is_nullable: 'NO', column_default: null, column_key: 'PRI' }] },
      { rows: [] },
    )
    const columns = await a.getColumns('orders')
    expect(columns[0].isForeignKey).toBe(false)
    expect(columns[0].references).toBeUndefined()
  })
})

describe('MysqlAdapter.getIndexes', () => {
  it('splits GROUP_CONCAT columns and marks unique from non_unique = 0', async () => {
    const a = await connected()
    queued.push({ rows: [
      { index_name: 'idx_email', non_unique: 0, columns: 'email' },
      { index_name: 'idx_name_city', non_unique: 1, columns: 'name,city' },
    ] })
    const indexes = await a.getIndexes('users')
    expect(indexes).toEqual([
      { name: 'idx_email', columns: ['email'], unique: true },
      { name: 'idx_name_city', columns: ['name', 'city'], unique: false },
    ])
  })
})

describe('MysqlAdapter.getSchemas', () => {
  it('returns the single configured database as the only schema', async () => {
    const a = await connected({ database: 'shop' })
    expect(await a.getSchemas()).toEqual(['shop'])
  })

  it('returns an empty array when no database is configured', async () => {
    const a = await connected({})
    expect(await a.getSchemas()).toEqual([])
  })
})

describe('MysqlAdapter.getDatabases', () => {
  it('queries schemata excluding the internal system schemas', async () => {
    const a = await connected()
    queued.push({ rows: [{ schema_name: 'shop' }, { schema_name: 'analytics' }] })
    const dbs = await a.getDatabases()
    const sql = String(calls.at(-1)?.sql)
    expect(sql).toContain("NOT IN ('mysql', 'information_schema', 'performance_schema', 'sys')")
    expect(dbs).toEqual(['shop', 'analytics'])
  })
})

describe('MysqlAdapter.getRowCount', () => {
  it('quotes db.table with backticks and returns the count', async () => {
    const a = await connected({ database: 'shop' })
    queued.push({ rows: [{ cnt: 42 }] })
    const count = await a.getRowCount('orders')
    expect(calls.at(-1)?.sql).toBe('SELECT count(*) as cnt FROM `shop`.`orders`')
    expect(count).toBe(42)
  })

  it('uses an explicit schema argument over config.database', async () => {
    const a = await connected({ database: 'shop' })
    queued.push({ rows: [{ cnt: 7 }] })
    await a.getRowCount('orders', 'archive')
    expect(calls.at(-1)?.sql).toBe('SELECT count(*) as cnt FROM `archive`.`orders`')
  })
})
