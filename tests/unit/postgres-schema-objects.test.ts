// PostgresAdapter.getSchemaObjects() fans out across five separate catalog
// queries (materialized views, functions/procedures, triggers, sequences,
// extensions) and stitches the results into one flat SchemaObject[] with a
// `kind` discriminator. The extensions query is deliberately gated to only
// run for the 'public' schema. query()'s timeoutMs path also opens a
// dedicated client and must reset statement_timeout before releasing it back
// to the pool — leaving it set would silently truncate every later query
// that happens to reuse the same pooled connection.
import { describe, it, expect, vi, beforeEach } from 'vitest'

interface QueuedResponse { rows: unknown[] }

let queued: QueuedResponse[] = []
let poolQueries: Array<{ sql: string; params?: unknown[] }> = []
let dedicatedClientQueries: string[] = []
let dedicatedClientReleased = false

function nextResponse(): QueuedResponse {
  return queued.shift() ?? { rows: [] }
}

const fakeDedicatedClient = {
  query: vi.fn(async (sql: string) => { dedicatedClientQueries.push(sql); return nextResponse() }),
  release: vi.fn(() => { dedicatedClientReleased = true }),
}

const fakePool = {
  query: vi.fn(async (sql: string, params?: unknown[]) => { poolQueries.push({ sql, params }); return nextResponse() }),
  connect: vi.fn(async () => fakeDedicatedClient),
  end: vi.fn(async () => {}),
}

vi.mock('pg', () => ({
  default: { Pool: class { query = fakePool.query; connect = fakePool.connect; end = fakePool.end } },
}))

import { PostgresAdapter } from '../../src/main/plugins/bundled/postgresql/postgres-adapter'

beforeEach(() => {
  queued = []
  poolQueries = []
  dedicatedClientQueries = []
  dedicatedClientReleased = false
  fakePool.query.mockClear()
  fakePool.connect.mockClear()
  fakeDedicatedClient.query.mockClear()
  fakeDedicatedClient.release.mockClear()
})

async function connected(): Promise<PostgresAdapter> {
  const a = new PostgresAdapter({ host: 'h', port: 5432, database: 'd' })
  await a.connect()
  return a
}

describe('PostgresAdapter.getSchemaObjects', () => {
  it('tags each catalog query result with its object kind', async () => {
    const a = await connected()
    queued.push(
      { rows: [{ name: 'mv1' }] },                                    // materialized views
      { rows: [{ name: 'fn1', signature: 'a int', return_type: 'int', kind: 'f' }] }, // functions
      { rows: [{ name: 'trg1', parent: 'users' }] },                  // triggers
      { rows: [{ name: 'seq1' }] },                                   // sequences
      { rows: [{ name: 'idx1', parent: 'users', kind: 'UNIQUE' }] },  // indexes
      { rows: [{ name: 'pgcrypto' }] },                               // extensions (schema === 'public')
    )
    const objects = await a.getSchemaObjects('public')
    expect(objects.map(o => o.kind)).toEqual([
      'materialized_view', 'function', 'trigger', 'sequence', 'index', 'extension',
    ])
  })

  it('reports a procedure (prokind "p") with no returnType, unlike a function', async () => {
    const a = await connected()
    queued.push(
      { rows: [] },
      { rows: [{ name: 'proc1', signature: '', return_type: 'void', kind: 'p' }] },
      { rows: [] }, { rows: [] }, { rows: [] }, { rows: [] },
    )
    const objects = await a.getSchemaObjects('public')
    const proc = objects.find(o => o.name === 'proc1')!
    expect(proc.kind).toBe('procedure')
    expect(proc.returnType).toBeUndefined()
  })

  it('skips the extensions query entirely for a non-public schema', async () => {
    const a = await connected()
    queued.push({ rows: [] }, { rows: [] }, { rows: [] }, { rows: [] }, { rows: [] })
    const objects = await a.getSchemaObjects('reporting')
    expect(objects.some(o => o.kind === 'extension')).toBe(false)
    // Only 5 queries should have run (no 6th extensions query).
    expect(poolQueries).toHaveLength(5)
  })

  it('defaults to the "public" schema when none is given', async () => {
    const a = await connected()
    queued.push({ rows: [] }, { rows: [] }, { rows: [] }, { rows: [] }, { rows: [] }, { rows: [] })
    await a.getSchemaObjects()
    expect(poolQueries[0].params).toEqual(['public'])
  })

  it('builds a function signature wrapped in parens, defaulting to "()" when empty', async () => {
    const a = await connected()
    queued.push(
      { rows: [] },
      { rows: [{ name: 'noargs', signature: '', return_type: 'void', kind: 'f' }] },
      { rows: [] }, { rows: [] }, { rows: [] }, { rows: [] },
    )
    const objects = await a.getSchemaObjects('public')
    expect(objects.find(o => o.name === 'noargs')?.signature).toBe('()')
  })
})

describe('PostgresAdapter.query — timeoutMs', () => {
  it('sets a statement_timeout on a dedicated client, runs the query, then resets it before releasing', async () => {
    const a = await connected()
    queued.push({ rows: [] }, { rows: [{ id: 1 }], fields: [{ name: 'id', dataTypeID: 23 }], rowCount: 1 } as never)
    await a.query('SELECT 1', undefined, { timeoutMs: 5000 })
    expect(dedicatedClientQueries[0]).toBe('SET statement_timeout TO 5000')
    expect(dedicatedClientQueries[1]).toBe('SELECT 1')
    expect(dedicatedClientQueries[2]).toBe('SET statement_timeout TO DEFAULT')
    expect(dedicatedClientReleased).toBe(true)
  })

  it('floors a fractional timeout instead of sending an invalid statement_timeout value', async () => {
    const a = await connected()
    queued.push({ rows: [] }, { rows: [] })
    await a.query('SELECT 1', undefined, { timeoutMs: 1500.7 })
    expect(dedicatedClientQueries[0]).toBe('SET statement_timeout TO 1500')
  })

  it('still resets statement_timeout and releases the client even if the query itself throws', async () => {
    const a = await connected()
    fakeDedicatedClient.query
      .mockImplementationOnce(async (sql: string) => { dedicatedClientQueries.push(sql); return { rows: [] } }) // SET
      .mockImplementationOnce(async (sql: string) => { dedicatedClientQueries.push(sql); throw new Error('boom') }) // the query
      .mockImplementationOnce(async (sql: string) => { dedicatedClientQueries.push(sql); return { rows: [] } }) // reset
    await expect(a.query('SELECT 1', undefined, { timeoutMs: 1000 })).rejects.toThrow('boom')
    expect(dedicatedClientQueries).toContain('SET statement_timeout TO DEFAULT')
    expect(dedicatedClientReleased).toBe(true)
  })

  it('uses the shared pool (no dedicated client) when no timeout is given', async () => {
    const a = await connected()
    fakePool.connect.mockClear() // clear the call made by connect() itself
    queued.push({ rows: [{ id: 1 }] })
    await a.query('SELECT 1')
    expect(fakePool.connect).not.toHaveBeenCalled()
  })

  it('ignores a zero or negative timeout — treats it as "no timeout"', async () => {
    const a = await connected()
    fakePool.connect.mockClear()
    queued.push({ rows: [] })
    await a.query('SELECT 1', undefined, { timeoutMs: 0 })
    expect(fakePool.connect).not.toHaveBeenCalled()
  })
})

describe('PostgresAdapter.switchDatabase', () => {
  it('is a no-op when already on the requested database', async () => {
    const a = await connected()
    fakePool.end.mockClear()
    await a.switchDatabase('d')
    expect(fakePool.end).not.toHaveBeenCalled()
  })

  it('tears down the old pool and opens a fresh one for a different database', async () => {
    const a = await connected()
    await a.switchDatabase('otherdb')
    expect(fakePool.end).toHaveBeenCalled()
    expect(fakePool.connect).toHaveBeenCalled()
  })

  it('rolls back any open in-flight session transactions before switching', async () => {
    const a = await connected()
    await a.openSession('s1', { autoCommit: false })
    dedicatedClientQueries.length = 0
    await a.query('INSERT INTO t VALUES (1)', undefined, { sessionId: 's1' }) // lazily BEGINs
    await a.switchDatabase('otherdb')
    expect(dedicatedClientQueries).toContain('ROLLBACK')
  })
})
