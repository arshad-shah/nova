import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'
import type { DbAdapter } from '../../src/main/db/adapter'
import Database from 'better-sqlite3'
import { SqliteAdapter } from '../../src/main/plugins/bundled/sqlite/sqlite-adapter'
import fs from 'fs'
import path from 'path'
import os from 'os'

const TEST_DB = path.join(__dirname, 'test-sqlite.db')

describe('SQLite Adapter', () => {
  let adapter: DbAdapter

  beforeAll(async () => {
    adapter = new SqliteAdapter({ database: TEST_DB })
    await adapter.connect()
  })

  afterAll(async () => {
    await adapter.disconnect()
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB)
  })

  it('connects and returns version', async () => {
    const result = await adapter.query('SELECT sqlite_version() as version')
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0].version).toBeDefined()
    expect(result.fields[0].name).toBe('version')
    expect(result.duration).toBeGreaterThanOrEqual(0)
  })

  it('creates a table and inserts data', async () => {
    await adapter.query('CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT)')
    const insert = await adapter.query("INSERT INTO users (name, email) VALUES ('Alice', 'alice@test.com')")
    expect(insert.affectedRows).toBe(1)
  })

  it('queries data with params', async () => {
    const result = await adapter.query('SELECT * FROM users WHERE name = ?', ['Alice'])
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0].name).toBe('Alice')
    expect(result.rowCount).toBe(1)
  })

  it('lists tables', async () => {
    const tables = await adapter.getTables()
    const userTable = tables.find(t => t.name === 'users')
    expect(userTable).toBeDefined()
    expect(userTable!.type).toBe('table')
  })

  it('lists columns', async () => {
    const columns = await adapter.getColumns('users')
    expect(columns).toHaveLength(3)
    const idCol = columns.find(c => c.name === 'id')!
    expect(idCol.isPrimaryKey).toBe(true)
    expect(idCol.dataType).toMatch(/INTEGER/i)
  })

  it('lists schemas (SQLite returns main)', async () => {
    const schemas = await adapter.getSchemas()
    expect(schemas).toContain('main')
  })

  it('lists indexes', async () => {
    await adapter.query('CREATE INDEX idx_users_email ON users(email)')
    const indexes = await adapter.getIndexes('users')
    const emailIdx = indexes.find(i => i.name === 'idx_users_email')
    expect(emailIdx).toBeDefined()
    expect(emailIdx!.columns).toContain('email')
  })

  it('handles errors gracefully', async () => {
    await expect(adapter.query('SELECT * FROM nonexistent_table')).rejects.toThrow()
  })
})

describe('SqliteAdapter.getRowCount', () => {
  let adapter: SqliteAdapter
  let dbPath: string

  beforeEach(async () => {
    dbPath = path.join(os.tmpdir(), `test-rowcount-${Date.now()}.db`)
    const db = new Database(dbPath)
    db.exec('CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)')
    db.exec("INSERT INTO users VALUES (1, 'Alice'), (2, 'Bob'), (3, 'Charlie')")
    db.exec('CREATE VIEW active_users AS SELECT * FROM users WHERE id > 1')
    db.close()

    adapter = new SqliteAdapter({ database: dbPath })
    await adapter.connect()
  })

  afterEach(async () => {
    await adapter.disconnect()
    fs.unlinkSync(dbPath)
  })

  it('returns exact row count for a table', async () => {
    const count = await adapter.getRowCount('users')
    expect(count).toBe(3)
  })

  it('returns row count for a view', async () => {
    const count = await adapter.getRowCount('active_users')
    expect(count).toBe(2)
  })
})

describe('SqliteAdapter — switchDatabase / getDatabases', () => {
  it('switchDatabase always throws — SQLite has no server-side database switch', async () => {
    const dbPath = path.join(os.tmpdir(), `test-switchdb-${Date.now()}.db`)
    const adapter = new SqliteAdapter({ database: dbPath })
    await adapter.connect()
    await expect(adapter.switchDatabase('other')).rejects.toThrow(/does not support switching databases/)
    await adapter.disconnect()
    fs.unlinkSync(dbPath)
  })

  it('getDatabases returns the basename of the configured file path', async () => {
    const dbPath = path.join(os.tmpdir(), `test-getdb-${Date.now()}.db`)
    const adapter = new SqliteAdapter({ database: dbPath })
    await adapter.connect()
    expect(await adapter.getDatabases()).toEqual([path.basename(dbPath)])
    await adapter.disconnect()
    fs.unlinkSync(dbPath)
  })
})

describe('SqliteAdapter — manual transactions across sessions', () => {
  let adapter: SqliteAdapter
  let dbPath: string

  beforeEach(async () => {
    dbPath = path.join(os.tmpdir(), `test-txn-${Date.now()}-${Math.random()}.db`)
    const db = new Database(dbPath)
    db.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT)')
    db.close()
    adapter = new SqliteAdapter({ database: dbPath })
    await adapter.connect()
  })

  afterEach(async () => {
    await adapter.disconnect()
    fs.unlinkSync(dbPath)
  })

  it('an autoCommit=false session lazily BEGINs on first query, then commit() persists it', async () => {
    await adapter.openSession('s1', { autoCommit: false })
    await adapter.query("INSERT INTO t (v) VALUES ('a')", undefined, { sessionId: 's1' })
    await adapter.commit('s1')
    const rows = (await adapter.query('SELECT * FROM t')).rows
    expect(rows).toHaveLength(1)
  })

  it('rollback() undoes the in-flight transaction', async () => {
    await adapter.openSession('s1', { autoCommit: false })
    await adapter.query("INSERT INTO t (v) VALUES ('a')", undefined, { sessionId: 's1' })
    await adapter.rollback('s1')
    const rows = (await adapter.query('SELECT * FROM t')).rows
    expect(rows).toHaveLength(0)
  })

  it('rejects opening a second transaction while another session already holds one', async () => {
    await adapter.openSession('s1', { autoCommit: false })
    await adapter.openSession('s2', { autoCommit: false })
    await adapter.beginTransaction('s1')
    await expect(adapter.beginTransaction('s2')).rejects.toThrow(/only one active transaction/)
  })

  it('query() on an unknown sessionId throws instead of silently using the shared connection', async () => {
    await expect(adapter.query('SELECT 1', undefined, { sessionId: 'ghost' })).rejects.toThrow(/no open session/i)
  })

  it('setAutoCommit(true) while a transaction is open commits it first', async () => {
    await adapter.openSession('s1', { autoCommit: false })
    await adapter.query("INSERT INTO t (v) VALUES ('a')", undefined, { sessionId: 's1' })
    await adapter.setAutoCommit('s1', true)
    // The transaction is committed — a fresh session should see the row
    // without needing an explicit commit() call.
    const rows = (await adapter.query('SELECT * FROM t')).rows
    expect(rows).toHaveLength(1)
  })

  it('closeSession() rolls back an uncommitted transaction before dropping the session', async () => {
    await adapter.openSession('s1', { autoCommit: false })
    await adapter.query("INSERT INTO t (v) VALUES ('a')", undefined, { sessionId: 's1' })
    await adapter.closeSession('s1')
    const rows = (await adapter.query('SELECT * FROM t')).rows
    expect(rows).toHaveLength(0)
  })

  it('disconnect() rolls back any sessions left with an open transaction', async () => {
    await adapter.openSession('s1', { autoCommit: false })
    await adapter.query("INSERT INTO t (v) VALUES ('a')", undefined, { sessionId: 's1' })
    await adapter.disconnect()
    // Reconnect to inspect persisted state (disconnect() closed the shared db handle).
    const check = new SqliteAdapter({ database: dbPath })
    await check.connect()
    const rows = (await check.query('SELECT * FROM t')).rows
    expect(rows).toHaveLength(0)
    await check.disconnect()
  })

  it('commit()/rollback() on a session with no open transaction are silent no-ops', async () => {
    await adapter.openSession('s1')
    await expect(adapter.commit('s1')).resolves.toBeUndefined()
    await expect(adapter.rollback('s1')).resolves.toBeUndefined()
  })
})

describe('SqliteAdapter.query — RETURNING vs plain write statements', () => {
  let adapter: SqliteAdapter
  let dbPath: string

  beforeEach(async () => {
    dbPath = path.join(os.tmpdir(), `test-returning-${Date.now()}-${Math.random()}.db`)
    adapter = new SqliteAdapter({ database: dbPath })
    await adapter.connect()
    await adapter.query('CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT)')
  })

  afterEach(async () => {
    await adapter.disconnect()
    fs.unlinkSync(dbPath)
  })

  it('an INSERT ... RETURNING is treated as a reader: rows come back, not just affectedRows', async () => {
    const result = await adapter.query("INSERT INTO t (v) VALUES ('x') RETURNING id, v")
    expect(result.rows).toEqual([{ id: 1, v: 'x' }])
    expect(result.fields.map(f => f.name)).toEqual(['id', 'v'])
  })

  it('a plain INSERT (no RETURNING) reports affectedRows and no rows', async () => {
    const result = await adapter.query("INSERT INTO t (v) VALUES ('y')")
    expect(result.rows).toEqual([])
    expect(result.affectedRows).toBe(1)
  })
})
