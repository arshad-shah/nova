// SnowflakeAdapter.connect() picks one of three mutually-exclusive auth
// branches (key-pair JWT, SSO/OAuth, username+password) from config shape
// alone, and only forwards database/schema/warehouse/role when the config
// actually sets them. A wrong branch or an always-set optional field would
// either silently fail auth or override a role/warehouse the user didn't
// ask for. These drive the real connect()/query() logic against a fake
// snowflake-sdk connection.
import { describe, it, expect, vi, beforeEach } from 'vitest'

interface FakeConnection {
  connect: ReturnType<typeof vi.fn>
  destroy: ReturnType<typeof vi.fn>
  execute: ReturnType<typeof vi.fn>
}

let lastCreateConnectionOpts: Record<string, unknown> | undefined
let queuedResponses: Array<{ rows: unknown[]; columns?: unknown[] }> = []
let executedSql: string[] = []

function makeFakeConnection(): FakeConnection {
  return {
    connect: vi.fn((cb: (err?: Error) => void) => cb()),
    destroy: vi.fn((cb: (err?: Error) => void) => cb()),
    execute: vi.fn((opts: { sqlText: string; complete: (err: unknown, stmt: unknown, rows: unknown[]) => void }) => {
      executedSql.push(opts.sqlText)
      const resp = queuedResponses.shift() ?? { rows: [] }
      const stmt = { getColumns: () => resp.columns ?? [], cancel: vi.fn((cb2: (e?: Error) => void) => cb2()) }
      opts.complete(null, stmt, resp.rows)
      return stmt
    }),
  }
}

vi.mock('snowflake-sdk', () => ({
  default: {
    configure: vi.fn(),
    createConnection: vi.fn((opts: Record<string, unknown>) => {
      lastCreateConnectionOpts = opts
      return makeFakeConnection()
    }),
  },
}))

vi.mock('fs/promises', () => ({
  default: { readFile: vi.fn(async () => 'PEM_KEY_CONTENTS') },
}))

import { SnowflakeAdapter } from '../../src/main/plugins/bundled/snowflake/snowflake-adapter'
import fs from 'fs/promises'

beforeEach(() => {
  lastCreateConnectionOpts = undefined
  queuedResponses = []
  executedSql = []
  vi.mocked(fs.readFile).mockClear()
})

describe('SnowflakeAdapter.connect — auth branch selection', () => {
  it('uses username/password auth by default, with no authenticator set', async () => {
    const adapter = new SnowflakeAdapter({ account: 'acct', username: 'bob', password: 'secret' })
    await adapter.connect()
    expect(lastCreateConnectionOpts?.username).toBe('bob')
    expect(lastCreateConnectionOpts?.password).toBe('secret')
    expect(lastCreateConnectionOpts?.authenticator).toBeUndefined()
  })

  it('switches to key-pair JWT auth when privateKeyPath is set, reading the key file', async () => {
    const adapter = new SnowflakeAdapter({ account: 'acct', username: 'bob', privateKeyPath: '/keys/rsa.pem' })
    await adapter.connect()
    expect(fs.readFile).toHaveBeenCalledWith('/keys/rsa.pem', 'utf-8')
    expect(lastCreateConnectionOpts?.authenticator).toBe('SNOWFLAKE_JWT')
    expect(lastCreateConnectionOpts?.privateKey).toBe('PEM_KEY_CONTENTS')
    // Key-pair auth must not also carry a plaintext password.
    expect(lastCreateConnectionOpts?.password).toBeUndefined()
  })

  it('adds privateKeyPass only when a passphrase is configured', async () => {
    const adapter = new SnowflakeAdapter({ account: 'acct', privateKeyPath: '/k.pem', passphrase: 'hunter2' })
    await adapter.connect()
    expect(lastCreateConnectionOpts?.privateKeyPass).toBe('hunter2')
  })

  it('takes the SSO/OAuth branch when authenticator is set without a password', async () => {
    const adapter = new SnowflakeAdapter({ account: 'acct', username: 'bob', authenticator: 'externalbrowser' })
    await adapter.connect()
    expect(lastCreateConnectionOpts?.authenticator).toBe('externalbrowser')
    expect(lastCreateConnectionOpts?.clientStoreTemporaryCredential).toBe(true)
    expect(lastCreateConnectionOpts?.password).toBeUndefined()
  })

  it('prefers username/password over SSO when both authenticator and password are present', async () => {
    // authenticator + password together fail the SSO branch's `!this.config.password`
    // guard, so this must fall through to plain username/password auth.
    const adapter = new SnowflakeAdapter({ account: 'acct', username: 'bob', password: 'secret', authenticator: 'externalbrowser' })
    await adapter.connect()
    expect(lastCreateConnectionOpts?.password).toBe('secret')
    expect(lastCreateConnectionOpts?.clientStoreTemporaryCredential).toBeUndefined()
  })

  it('omits database/schema/warehouse/role entirely when not configured (auth-only connection)', async () => {
    const adapter = new SnowflakeAdapter({ account: 'acct', username: 'bob', password: 'x' })
    await adapter.connect()
    expect(lastCreateConnectionOpts).not.toHaveProperty('database')
    expect(lastCreateConnectionOpts).not.toHaveProperty('schema')
    expect(lastCreateConnectionOpts).not.toHaveProperty('warehouse')
    expect(lastCreateConnectionOpts).not.toHaveProperty('role')
  })

  it('forwards database/schema/warehouse/role when present', async () => {
    const adapter = new SnowflakeAdapter({
      account: 'acct', username: 'bob', password: 'x',
      database: 'DB1', schema: 'S1', warehouse: 'WH1', role: 'R1',
    })
    await adapter.connect()
    expect(lastCreateConnectionOpts?.database).toBe('DB1')
    expect(lastCreateConnectionOpts?.schema).toBe('S1')
    expect(lastCreateConnectionOpts?.warehouse).toBe('WH1')
    expect(lastCreateConnectionOpts?.role).toBe('R1')
  })

  it('builds accessUrl from host only when a host override is configured', async () => {
    const withHost = new SnowflakeAdapter({ account: 'acct', username: 'b', password: 'x', host: 'custom.snowflakecomputing.com' })
    await withHost.connect()
    expect(lastCreateConnectionOpts?.accessUrl).toBe('https://custom.snowflakecomputing.com')

    const withoutHost = new SnowflakeAdapter({ account: 'acct', username: 'b', password: 'x' })
    await withoutHost.connect()
    expect(lastCreateConnectionOpts).not.toHaveProperty('accessUrl')
  })

  it('marks the adapter connected only after the SDK connect callback fires', async () => {
    const adapter = new SnowflakeAdapter({ account: 'acct', username: 'b', password: 'x' })
    expect(await adapter.isConnected()).toBe(false)
    await adapter.connect()
    expect(await adapter.isConnected()).toBe(true)
  })

  it('rejects when the SDK connect callback reports an error', async () => {
    const { default: snowflakeSdk } = await import('snowflake-sdk')
    vi.mocked(snowflakeSdk.createConnection).mockImplementationOnce((opts) => {
      lastCreateConnectionOpts = opts as Record<string, unknown>
      return { connect: (cb: (err?: Error) => void) => cb(new Error('bad credentials')) } as unknown as ReturnType<typeof snowflakeSdk.createConnection>
    })
    const adapter = new SnowflakeAdapter({ account: 'acct', username: 'b', password: 'wrong' })
    await expect(adapter.connect()).rejects.toThrow(/bad credentials/)
  })
})

describe('SnowflakeAdapter — getConnectionOptions', () => {
  async function connectedAdapter(): Promise<SnowflakeAdapter> {
    const adapter = new SnowflakeAdapter({ account: 'acct', username: 'b', password: 'x' })
    await adapter.connect()
    return adapter
  }

  it('maps "warehouse" to SHOW WAREHOUSES and extracts names, dropping blanks', async () => {
    const adapter = await connectedAdapter()
    queuedResponses.push({ rows: [{ '"name"': 'WH1' }, { '"name"': '' }, { '"name"': 'WH2' }] })
    const names = await adapter.getConnectionOptions('warehouse')
    expect(executedSql).toContain('SHOW WAREHOUSES')
    expect(names).toEqual(['WH1', 'WH2'])
  })

  it('maps "role"/"database"/"schema" to their respective SHOW commands', async () => {
    const adapter = await connectedAdapter()
    queuedResponses.push({ rows: [{ '"name"': 'SYSADMIN' }] })
    expect(await adapter.getConnectionOptions('role')).toEqual(['SYSADMIN'])
    expect(executedSql.at(-1)).toBe('SHOW ROLES')

    queuedResponses.push({ rows: [{ '"name"': 'PROD' }] })
    expect(await adapter.getConnectionOptions('database')).toEqual(['PROD'])
    expect(executedSql.at(-1)).toBe('SHOW DATABASES')

    queuedResponses.push({ rows: [{ '"name"': 'PUBLIC' }] })
    expect(await adapter.getConnectionOptions('schema')).toEqual(['PUBLIC'])
    expect(executedSql.at(-1)).toBe('SHOW SCHEMAS')
  })

  it('returns [] for an unrecognized field without issuing any query', async () => {
    const adapter = await connectedAdapter()
    const before = executedSql.length
    expect(await adapter.getConnectionOptions('bogus')).toEqual([])
    expect(executedSql.length).toBe(before)
  })
})

describe('SnowflakeAdapter — schema/warehouse/role switching', () => {
  async function connectedAdapter(): Promise<SnowflakeAdapter> {
    const adapter = new SnowflakeAdapter({ account: 'acct', username: 'b', password: 'x' })
    await adapter.connect()
    return adapter
  }

  it('switchDatabase issues USE DATABASE with the identifier quoted', async () => {
    const adapter = await connectedAdapter()
    queuedResponses.push({ rows: [] })
    await adapter.switchDatabase('ANALYTICS')
    expect(executedSql.at(-1)).toBe('USE DATABASE "ANALYTICS"')
  })

  it('doubles an embedded quote in the identifier rather than breaking out of it', async () => {
    const adapter = await connectedAdapter()
    queuedResponses.push({ rows: [] })
    await adapter.switchDatabase('WEIRD"NAME')
    expect(executedSql.at(-1)).toBe('USE DATABASE "WEIRD""NAME"')
  })

  it('setSchema/switchWarehouse/switchRole each issue their matching USE statement', async () => {
    const adapter = await connectedAdapter()
    queuedResponses.push({ rows: [] }, { rows: [] }, { rows: [] })
    await adapter.setSchema('S1')
    await adapter.switchWarehouse('WH1')
    await adapter.switchRole('R1')
    expect(executedSql.slice(-3)).toEqual(['USE SCHEMA "S1"', 'USE WAREHOUSE "WH1"', 'USE ROLE "R1"'])
  })

  it('all four throw "Not connected" before connect()', async () => {
    const adapter = new SnowflakeAdapter({ account: 'acct' })
    await expect(adapter.switchDatabase('D')).rejects.toThrow(/Not connected/)
    await expect(adapter.setSchema('S')).rejects.toThrow(/Not connected/)
    await expect(adapter.switchWarehouse('W')).rejects.toThrow(/Not connected/)
    await expect(adapter.switchRole('R')).rejects.toThrow(/Not connected/)
  })
})

describe('SnowflakeAdapter — schema introspection', () => {
  async function connectedAdapter(): Promise<SnowflakeAdapter> {
    const adapter = new SnowflakeAdapter({ account: 'acct', username: 'b', password: 'x' })
    await adapter.connect()
    return adapter
  }

  it('getTables defaults to schema PUBLIC and flags VIEW rows as views', async () => {
    const adapter = await connectedAdapter()
    queuedResponses.push({ rows: [
      { TABLE_NAME: 'USERS', TABLE_TYPE: 'BASE TABLE' },
      { TABLE_NAME: 'ACTIVE_USERS', TABLE_TYPE: 'VIEW' },
    ] })
    const tables = await adapter.getTables()
    expect(tables).toEqual([
      { name: 'USERS', schema: 'PUBLIC', type: 'table' },
      { name: 'ACTIVE_USERS', schema: 'PUBLIC', type: 'view' },
    ])
  })

  it('getColumns merges the column list with PK/FK lookups keyed by Snowflake\'s quoted-lowercase SHOW output', async () => {
    const adapter = await connectedAdapter()
    queuedResponses.push(
      { rows: [
        { COLUMN_NAME: 'ID', DATA_TYPE: 'NUMBER', IS_NULLABLE: 'NO', COLUMN_DEFAULT: null },
        { COLUMN_NAME: 'ORG_ID', DATA_TYPE: 'NUMBER', IS_NULLABLE: 'YES', COLUMN_DEFAULT: null },
      ] }, // INFORMATION_SCHEMA.COLUMNS
      { rows: [{ '"column_name"': 'ID' }] }, // SHOW PRIMARY KEYS
      { rows: [{ '"fk_column_name"': 'ORG_ID', '"pk_table_name"': 'ORGS', '"pk_column_name"': 'ID' }] }, // SHOW IMPORTED KEYS
    )
    const columns = await adapter.getColumns('USERS')
    expect(columns[0]).toMatchObject({ name: 'ID', isPrimaryKey: true, isForeignKey: false })
    expect(columns[1]).toMatchObject({ name: 'ORG_ID', isPrimaryKey: false, isForeignKey: true, references: { table: 'ORGS', column: 'ID' } })
  })

  it('getRowCount quotes schema.table and reads the COUNT(*) column', async () => {
    const adapter = await connectedAdapter()
    queuedResponses.push({ rows: [{ CNT: 123 }] })
    const count = await adapter.getRowCount('USERS', 'ANALYTICS')
    expect(executedSql.at(-1)).toBe('SELECT COUNT(*) AS CNT FROM "ANALYTICS"."USERS"')
    expect(count).toBe(123)
  })

  it('getDatabases extracts names via extractSnowflakeName and drops blanks', async () => {
    const adapter = await connectedAdapter()
    queuedResponses.push({ rows: [{ '"name"': 'DB1' }, { '"name"': '' }] })
    expect(await adapter.getDatabases()).toEqual(['DB1'])
  })

  it('getIndexes always returns [] — Snowflake has no traditional indexes', async () => {
    const adapter = await connectedAdapter()
    expect(await adapter.getIndexes('USERS')).toEqual([])
  })
})

describe('SnowflakeAdapter.query', () => {
  async function connectedAdapter(): Promise<SnowflakeAdapter> {
    const adapter = new SnowflakeAdapter({ account: 'acct', username: 'b', password: 'x' })
    await adapter.connect()
    return adapter
  }

  it('shapes rows/fields from the SDK statement columns, and reports affectedRows = rows.length', async () => {
    const adapter = await connectedAdapter()
    queuedResponses.push({
      rows: [{ ID: 1 }, { ID: 2 }],
      columns: [
        { getName: () => 'ID', getType: () => 'NUMBER', isNullable: () => false },
      ],
    })
    const result = await adapter.query('SELECT ID FROM USERS')
    expect(result.rows).toEqual([{ ID: 1 }, { ID: 2 }])
    expect(result.fields).toEqual([{ name: 'ID', dataType: 'NUMBER', nullable: false }])
    expect(result.rowCount).toBe(2)
    expect(result.affectedRows).toBe(2)
    expect(result.duration).toBeGreaterThanOrEqual(0)
  })

  it('rejects when the SDK execute callback reports an error', async () => {
    const adapter = await connectedAdapter()
    const conn = adapter['connection'] as unknown as { execute: ReturnType<typeof vi.fn> }
    conn.execute.mockImplementationOnce((opts: { complete: (err: unknown, stmt: unknown, rows: unknown[]) => void }) => {
      opts.complete(new Error('syntax error'), null, [])
      return { getColumns: () => [], cancel: vi.fn((cb: (e?: Error) => void) => cb()) }
    })
    await expect(adapter.query('SELECT bogus')).rejects.toThrow(/syntax error/)
  })

  it('throws "Not connected" before connect()', async () => {
    const adapter = new SnowflakeAdapter({ account: 'acct' })
    await expect(adapter.query('SELECT 1')).rejects.toThrow(/Not connected/)
  })
})

describe('SnowflakeAdapter.testConnection', () => {
  it('runs SELECT CURRENT_VERSION() and extracts the version from the first row', async () => {
    const adapter = new SnowflakeAdapter({ account: 'acct', username: 'b', password: 'x' })
    await adapter.connect()
    queuedResponses.push({ rows: [{ version: '8.1.2' }] })
    const result = await adapter.testConnection()
    expect(executedSql.at(-1)).toBe('SELECT CURRENT_VERSION() as version')
    expect(result.version).toBe('8.1.2')
  })

  it('falls back to "unknown" when no row is returned', async () => {
    const adapter = new SnowflakeAdapter({ account: 'acct', username: 'b', password: 'x' })
    await adapter.connect()
    queuedResponses.push({ rows: [] })
    expect((await adapter.testConnection()).version).toBe('unknown')
  })
})

describe('SnowflakeAdapter.cancelQuery', () => {
  it('is a no-op when there is no active statement', async () => {
    const adapter = new SnowflakeAdapter({ account: 'acct', username: 'b', password: 'x' })
    await adapter.connect()
    await expect(adapter.cancelQuery()).resolves.toBeUndefined()
  })

  it('calls cancel() on the statement tracked from the last execute() call', async () => {
    // The fake connection's execute() completes synchronously, so by the time
    // query() resolves, `activeStatement` has been set back to that just-
    // completed statement (complete() nulls it, then execute() returns and
    // the adapter re-assigns it) — this still exercises the real cancelQuery()
    // code path of "cancel whatever `activeStatement` currently references".
    const adapter = new SnowflakeAdapter({ account: 'acct', username: 'b', password: 'x' })
    await adapter.connect()
    queuedResponses.push({ rows: [] })
    await adapter.query('SELECT 1')
    const stmt = adapter['activeStatement'] as unknown as { cancel: ReturnType<typeof vi.fn> } | null
    expect(stmt).not.toBeNull()
    await adapter.cancelQuery()
    expect(stmt!.cancel).toHaveBeenCalled()
  })
})

describe('SnowflakeAdapter.getSchemas', () => {
  it('excludes INFORMATION_SCHEMA from the schema list', async () => {
    const adapter = new SnowflakeAdapter({ account: 'acct', username: 'b', password: 'x' })
    await adapter.connect()
    queuedResponses.push({ rows: [{ SCHEMA_NAME: 'PUBLIC' }, { SCHEMA_NAME: 'ANALYTICS' }] })
    const schemas = await adapter.getSchemas()
    expect(executedSql.at(-1)).toContain("NOT IN ('INFORMATION_SCHEMA')")
    expect(schemas).toEqual(['PUBLIC', 'ANALYTICS'])
  })

  it('throws "Not connected" before connect()', async () => {
    const adapter = new SnowflakeAdapter({ account: 'acct' })
    await expect(adapter.getSchemas()).rejects.toThrow(/Not connected/)
  })
})

describe('SnowflakeAdapter — disconnect', () => {
  it('destroys the connection and flips isConnected back to false', async () => {
    const adapter = new SnowflakeAdapter({ account: 'acct', username: 'b', password: 'x' })
    await adapter.connect()
    await adapter.disconnect()
    expect(await adapter.isConnected()).toBe(false)
  })

  it('does not throw even if the SDK reports a destroy error', async () => {
    const { default: snowflakeSdk } = await import('snowflake-sdk')
    vi.mocked(snowflakeSdk.createConnection).mockImplementationOnce((opts) => {
      lastCreateConnectionOpts = opts as Record<string, unknown>
      return {
        connect: (cb: (err?: Error) => void) => cb(),
        destroy: (cb: (err?: Error) => void) => cb(new Error('teardown failed')),
      } as unknown as ReturnType<typeof snowflakeSdk.createConnection>
    })
    const adapter = new SnowflakeAdapter({ account: 'acct', username: 'b', password: 'x' })
    await adapter.connect()
    await expect(adapter.disconnect()).resolves.toBeUndefined()
    expect(await adapter.isConnected()).toBe(false)
  })

  it('is a no-op when never connected', async () => {
    const adapter = new SnowflakeAdapter({ account: 'acct' })
    await expect(adapter.disconnect()).resolves.toBeUndefined()
  })
})
