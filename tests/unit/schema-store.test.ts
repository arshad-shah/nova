import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { SchemaTable, SchemaColumn, SchemaIndex } from '../../shared/types'
import { IPC_CHANNELS } from '../../shared/ipc'

const mockInvoke = vi.fn()
vi.stubGlobal('window', {
  electronAPI: {
    invoke: mockInvoke,
    on: vi.fn(() => vi.fn())
  }
})

import { useSchemaStore, schemaErrorTag } from '../../src/renderer/src/stores/schema'
import { ACTIVITY_KIND } from '../../shared/activity'

function resetStore(): void {
  useSchemaStore.setState({
    tables: new Map(),
    columns: new Map(),
    indexes: new Map(),
    schemas: new Map(),
    databases: new Map(),
    objects: new Map(),
    expandedTables: new Set(),
    filterText: '',
    rowCounts: new Map(),
    loading: false,
    cacheVersion: 0,
    errored: new Set(),
    databasesPending: new Map(),
    schemasPending: new Map(),
    tablesPending: new Map(),
    columnsPending: new Map(),
    indexesPending: new Map(),
    objectsPending: new Map(),
    rowCountsPending: new Map(),
  })
}

/** A promise whose resolution is controllable from the test body. */
function deferred<T>(): { promise: Promise<T>; resolve: (v: T) => void; reject: (e: unknown) => void } {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

/**
 * How many *data* round trips the bridge saw, excluding the fire-and-forget
 * `activity:record` writes that error paths emit over the same mock.
 */
function dataInvokeCount(): number {
  return mockInvoke.mock.calls.filter(([channel]) => channel !== IPC_CHANNELS.ACTIVITY_RECORD).length
}

describe('Schema cache logic', () => {
  it('caches tables by connection+schema key', () => {
    const cache = new Map<string, SchemaTable[]>()
    const key = 'conn1:public'
    const tables: SchemaTable[] = [
      { name: 'users', schema: 'public', type: 'table' },
      { name: 'orders', schema: 'public', type: 'table' },
      { name: 'active_users', schema: 'public', type: 'view' }
    ]
    cache.set(key, tables)
    expect(cache.get(key)).toHaveLength(3)
    expect(cache.get(key)![2].type).toBe('view')
  })

  it('caches columns by connection+table key', () => {
    const cache = new Map<string, SchemaColumn[]>()
    const key = 'conn1:public.users'
    const columns: SchemaColumn[] = [
      { name: 'id', dataType: 'integer', nullable: false, defaultValue: null, isPrimaryKey: true, isForeignKey: false },
      { name: 'name', dataType: 'varchar', nullable: false, defaultValue: null, isPrimaryKey: false, isForeignKey: false },
      { name: 'org_id', dataType: 'integer', nullable: true, defaultValue: null, isPrimaryKey: false, isForeignKey: true, references: { table: 'orgs', column: 'id' } }
    ]
    cache.set(key, columns)
    const fks = cache.get(key)!.filter(c => c.isForeignKey)
    expect(fks).toHaveLength(1)
    expect(fks[0].references!.table).toBe('orgs')
  })

  it('invalidates cache on refresh', () => {
    const cache = new Map<string, SchemaTable[]>()
    cache.set('conn1:public', [{ name: 'old', schema: 'public', type: 'table' }])
    cache.delete('conn1:public')
    expect(cache.get('conn1:public')).toBeUndefined()
  })
})

describe('Schema filter and row count cache', () => {
  it('filterText filters table names case-insensitively', () => {
    const tables: SchemaTable[] = [
      { name: 'users', schema: 'public', type: 'table' },
      { name: 'user_roles', schema: 'public', type: 'table' },
      { name: 'posts', schema: 'public', type: 'table' },
      { name: 'active_users', schema: 'public', type: 'view' }
    ]
    const filterText = 'user'
    const filtered = tables.filter(t => t.name.toLowerCase().includes(filterText.toLowerCase()))
    expect(filtered).toHaveLength(3)
    expect(filtered.map(t => t.name)).toEqual(['users', 'user_roles', 'active_users'])
  })

  it('rowCounts cache stores counts by composite key', () => {
    const rowCounts = new Map<string, number>()
    rowCounts.set('conn1:public:users', 1200)
    rowCounts.set('conn1:public:posts', 856)
    expect(rowCounts.get('conn1:public:users')).toBe(1200)
    expect(rowCounts.get('conn1:public:posts')).toBe(856)
    expect(rowCounts.get('conn1:public:missing')).toBeUndefined()
  })

  it('clearCache removes rowCounts for a connection', () => {
    const rowCounts = new Map<string, number>()
    rowCounts.set('conn1:public:users', 1200)
    rowCounts.set('conn2:public:posts', 500)
    const next = new Map<string, number>()
    for (const [k, v] of rowCounts) {
      if (!k.startsWith('conn1')) next.set(k, v)
    }
    expect(next.size).toBe(1)
    expect(next.get('conn2:public:posts')).toBe(500)
  })
})

describe('useSchemaStore (behavioral)', () => {
  beforeEach(() => {
    mockInvoke.mockReset()
    resetStore()
  })

  it('fetchDatabases calls IPC and caches the filtered result', async () => {
    mockInvoke.mockResolvedValueOnce(['db1', '', 'db2'])
    const result = await useSchemaStore.getState().fetchDatabases('conn1')
    expect(mockInvoke).toHaveBeenCalledWith(IPC_CHANNELS.DB_GET_DATABASES, 'conn1')
    expect(result).toEqual(['db1', 'db2'])
    expect(useSchemaStore.getState().databases.get('conn1')).toEqual(['db1', 'db2'])
  })

  it('fetchDatabases returns the cached value without re-invoking IPC', async () => {
    mockInvoke.mockResolvedValueOnce(['db1'])
    await useSchemaStore.getState().fetchDatabases('conn1')
    mockInvoke.mockClear()
    const result = await useSchemaStore.getState().fetchDatabases('conn1')
    expect(mockInvoke).not.toHaveBeenCalled()
    expect(result).toEqual(['db1'])
  })

  it('fetchDatabases returns [] and marks errored (not cached-empty) on IPC failure', async () => {
    mockInvoke.mockRejectedValueOnce(new Error('boom'))
    const result = await useSchemaStore.getState().fetchDatabases('conn1')
    expect(result).toEqual([])
    // A failed fetch must not masquerade as a connection with zero databases:
    // no cached result, an errored marker instead.
    expect(useSchemaStore.getState().databases.has('conn1')).toBe(false)
    expect(useSchemaStore.getState().errored.has(schemaErrorTag('databases', 'conn1'))).toBe(true)
  })

  it('switchDatabase rejects immediately when database name is empty', async () => {
    await expect(useSchemaStore.getState().switchDatabase('conn1', '')).rejects.toThrow(
      'Database name is required'
    )
    expect(mockInvoke).not.toHaveBeenCalled()
  })

  it('switchDatabase invokes IPC on the happy path', async () => {
    mockInvoke.mockResolvedValueOnce(undefined)
    await useSchemaStore.getState().switchDatabase('conn1', 'db2')
    expect(mockInvoke).toHaveBeenCalledWith(IPC_CHANNELS.DB_SWITCH_DATABASE, 'conn1', 'db2')
  })

  it('switchDatabase wraps an IPC failure in a friendly error naming the database', async () => {
    mockInvoke.mockRejectedValueOnce(new Error('permission denied'))
    await expect(useSchemaStore.getState().switchDatabase('conn1', 'rdsadmin')).rejects.toThrow(
      'Cannot switch to database "rdsadmin"'
    )
  })

  it('fetchSchemas keys the cache by connection+database when database is given', async () => {
    mockInvoke.mockResolvedValueOnce(['public'])
    const result = await useSchemaStore.getState().fetchSchemas('conn1', 'db2')
    expect(result).toEqual(['public'])
    expect(useSchemaStore.getState().schemas.get('conn1:db2')).toEqual(['public'])
    expect(useSchemaStore.getState().schemas.has('conn1')).toBe(false)
  })

  it('fetchSchemas sets loading true during the fetch and false after', async () => {
    let resolveFn!: (v: string[]) => void
    mockInvoke.mockReturnValueOnce(new Promise<string[]>((res) => { resolveFn = res }))
    const p = useSchemaStore.getState().fetchSchemas('conn1')
    expect(useSchemaStore.getState().loading).toBe(true)
    resolveFn(['public'])
    await p
    expect(useSchemaStore.getState().loading).toBe(false)
  })

  it('fetchSchemas returns [], clears loading, and marks errored on IPC failure', async () => {
    mockInvoke.mockRejectedValueOnce(new Error('down'))
    const result = await useSchemaStore.getState().fetchSchemas('conn1')
    expect(result).toEqual([])
    expect(useSchemaStore.getState().schemas.has('conn1')).toBe(false)
    expect(useSchemaStore.getState().loading).toBe(false)
    expect(useSchemaStore.getState().errored.has(schemaErrorTag('schemas', 'conn1'))).toBe(true)
  })

  it('fetchTables keys the cache by connection+database+schema when a database is given', async () => {
    const tables: SchemaTable[] = [{ name: 'users', schema: 'public', type: 'table' }]
    mockInvoke.mockResolvedValueOnce(tables)
    const result = await useSchemaStore.getState().fetchTables('conn1', 'public', 'db2')
    expect(mockInvoke).toHaveBeenCalledWith(IPC_CHANNELS.DB_GET_TABLES, 'conn1', 'public')
    expect(result).toEqual(tables)
    expect(useSchemaStore.getState().tables.get('conn1:db2:public')).toEqual(tables)
  })

  it('fetchTables returns [] and clears loading on IPC failure without caching', async () => {
    mockInvoke.mockRejectedValueOnce(new Error('nope'))
    const result = await useSchemaStore.getState().fetchTables('conn1', 'public')
    expect(result).toEqual([])
    expect(useSchemaStore.getState().loading).toBe(false)
    expect(useSchemaStore.getState().tables.has('conn1:public')).toBe(false)
  })

  it('fetchColumns caches per connection+schema+table key', async () => {
    const columns: SchemaColumn[] = [
      { name: 'id', dataType: 'integer', nullable: false, defaultValue: null, isPrimaryKey: true, isForeignKey: false }
    ]
    mockInvoke.mockResolvedValueOnce(columns)
    const result = await useSchemaStore.getState().fetchColumns('conn1', 'users', 'public')
    expect(mockInvoke).toHaveBeenCalledWith(IPC_CHANNELS.DB_GET_COLUMNS, 'conn1', 'users', 'public')
    expect(result).toEqual(columns)
    expect(useSchemaStore.getState().columns.get('conn1:public:users')).toEqual(columns)
  })

  it('fetchColumns returns [] on IPC failure without throwing', async () => {
    mockInvoke.mockRejectedValueOnce(new Error('nope'))
    const result = await useSchemaStore.getState().fetchColumns('conn1', 'users', 'public')
    expect(result).toEqual([])
    expect(useSchemaStore.getState().columns.has('conn1:public:users')).toBe(false)
  })

  it('fetchIndexes fetches, caches and returns indexes', async () => {
    const indexes: SchemaIndex[] = [{ name: 'users_pkey', columns: ['id'], unique: true }]
    mockInvoke.mockResolvedValueOnce(indexes)
    const result = await useSchemaStore.getState().fetchIndexes('conn1', 'users', 'public')
    expect(mockInvoke).toHaveBeenCalledWith(IPC_CHANNELS.DB_GET_INDEXES, 'conn1', 'users', 'public')
    expect(result).toEqual(indexes)
    expect(useSchemaStore.getState().indexes.get('conn1:public:users')).toEqual(indexes)
  })

  it('fetchIndexes returns the cached value without re-invoking IPC', async () => {
    const indexes: SchemaIndex[] = [{ name: 'idx', columns: ['a'], unique: false }]
    mockInvoke.mockResolvedValueOnce(indexes)
    await useSchemaStore.getState().fetchIndexes('conn1', 'users', 'public')
    mockInvoke.mockClear()
    const result = await useSchemaStore.getState().fetchIndexes('conn1', 'users', 'public')
    expect(mockInvoke).not.toHaveBeenCalled()
    expect(result).toEqual(indexes)
  })

  it('fetchSchemaObjects returns [] and marks errored (not cached-empty) on IPC failure', async () => {
    mockInvoke.mockRejectedValueOnce(new Error('boom'))
    const result = await useSchemaStore.getState().fetchSchemaObjects('conn1', 'public')
    expect(result).toEqual([])
    expect(useSchemaStore.getState().objects.has('conn1:public')).toBe(false)
    expect(useSchemaStore.getState().errored.has(schemaErrorTag('objects', 'conn1:public'))).toBe(true)
  })

  it('toggleTable adds then removes a key from expandedTables', () => {
    useSchemaStore.getState().toggleTable('conn1:public:users')
    expect(useSchemaStore.getState().expandedTables.has('conn1:public:users')).toBe(true)
    useSchemaStore.getState().toggleTable('conn1:public:users')
    expect(useSchemaStore.getState().expandedTables.has('conn1:public:users')).toBe(false)
  })

  it('setFilterText updates filterText', () => {
    useSchemaStore.getState().setFilterText('user')
    expect(useSchemaStore.getState().filterText).toBe('user')
  })

  it('fetchRowCount fetches and caches the count once, skipping a second call', async () => {
    mockInvoke.mockResolvedValueOnce(1200)
    await useSchemaStore.getState().fetchRowCount('conn1', 'users', 'public')
    expect(useSchemaStore.getState().rowCounts.get('conn1:public:users')).toBe(1200)
    mockInvoke.mockClear()
    await useSchemaStore.getState().fetchRowCount('conn1', 'users', 'public')
    expect(mockInvoke).not.toHaveBeenCalled()
  })

  it('clearCache with no connectionId wipes every cache and bumps cacheVersion', () => {
    useSchemaStore.setState({
      tables: new Map([['conn1:public', []]]),
      schemas: new Map([['conn1', []]]),
      databases: new Map([['conn1', []]]),
      filterText: 'x',
      cacheVersion: 3,
    })
    useSchemaStore.getState().clearCache()
    const s = useSchemaStore.getState()
    expect(s.tables.size).toBe(0)
    expect(s.schemas.size).toBe(0)
    expect(s.databases.size).toBe(0)
    expect(s.filterText).toBe('')
    expect(s.cacheVersion).toBe(4)
  })

  it('clearCache(connectionId) drops only that connection\'s keys, including the bare-id form', () => {
    useSchemaStore.setState({
      tables: new Map([
        ['conn1:public', [{ name: 't1', schema: 'public', type: 'table' }] as SchemaTable[]],
        ['conn2:public', [{ name: 't2', schema: 'public', type: 'table' }] as SchemaTable[]],
      ]),
      schemas: new Map([['conn1', ['public']], ['conn2', ['public']]]),
      databases: new Map([['conn1', ['db']], ['conn2', ['db']]]),
      cacheVersion: 0,
    })
    useSchemaStore.getState().clearCache('conn1')
    const s = useSchemaStore.getState()
    expect(s.tables.has('conn1:public')).toBe(false)
    expect(s.tables.has('conn2:public')).toBe(true)
    expect(s.schemas.has('conn1')).toBe(false)
    expect(s.schemas.has('conn2')).toBe(true)
    expect(s.databases.has('conn1')).toBe(false)
    expect(s.cacheVersion).toBe(1)
  })
})

describe('useSchemaStore — in-flight request de-duplication (#206)', () => {
  beforeEach(() => {
    mockInvoke.mockReset()
    resetStore()
  })

  it('two concurrent fetchColumns for the same key produce exactly one ipc.invoke', async () => {
    const d = deferred<SchemaColumn[]>()
    mockInvoke.mockReturnValueOnce(d.promise)

    const p1 = useSchemaStore.getState().fetchColumns('conn1', 'users', 'public')
    const p2 = useSchemaStore.getState().fetchColumns('conn1', 'users', 'public')

    // Both callers arrived before the request settled: one round trip only.
    expect(mockInvoke).toHaveBeenCalledTimes(1)

    const columns: SchemaColumn[] = [
      { name: 'id', dataType: 'integer', nullable: false, defaultValue: null, isPrimaryKey: true, isForeignKey: false }
    ]
    d.resolve(columns)
    const [r1, r2] = await Promise.all([p1, p2])

    // Both callers receive the shared result…
    expect(r1).toEqual(columns)
    expect(r2).toEqual(columns)
    // …and it is cached for later callers, still one invoke total.
    expect(useSchemaStore.getState().columns.get('conn1:public:users')).toEqual(columns)
    expect(mockInvoke).toHaveBeenCalledTimes(1)
  })

  it('distinct keys are not de-duplicated — each fires its own request', async () => {
    mockInvoke.mockResolvedValue([])
    await Promise.all([
      useSchemaStore.getState().fetchColumns('conn1', 'users', 'public'),
      useSchemaStore.getState().fetchColumns('conn1', 'orders', 'public'),
    ])
    expect(mockInvoke).toHaveBeenCalledTimes(2)
  })

  it('de-duplicates concurrent fetchIndexes, fetchTables, and fetchRowCount', async () => {
    const indexes = deferred<SchemaIndex[]>()
    mockInvoke.mockReturnValueOnce(indexes.promise)
    const ip1 = useSchemaStore.getState().fetchIndexes('conn1', 'users', 'public')
    const ip2 = useSchemaStore.getState().fetchIndexes('conn1', 'users', 'public')
    expect(mockInvoke).toHaveBeenCalledTimes(1)
    indexes.resolve([{ name: 'users_pkey', columns: ['id'], unique: true }])
    await Promise.all([ip1, ip2])

    mockInvoke.mockReset()
    const tables = deferred<SchemaTable[]>()
    mockInvoke.mockReturnValueOnce(tables.promise)
    const tp1 = useSchemaStore.getState().fetchTables('conn1', 'public')
    const tp2 = useSchemaStore.getState().fetchTables('conn1', 'public')
    expect(mockInvoke).toHaveBeenCalledTimes(1)
    tables.resolve([{ name: 'users', schema: 'public', type: 'table' }])
    await Promise.all([tp1, tp2])

    mockInvoke.mockReset()
    const count = deferred<number>()
    mockInvoke.mockReturnValueOnce(count.promise)
    const rc1 = useSchemaStore.getState().fetchRowCount('conn1', 'users', 'public')
    const rc2 = useSchemaStore.getState().fetchRowCount('conn1', 'users', 'public')
    expect(mockInvoke).toHaveBeenCalledTimes(1)
    count.resolve(42)
    await Promise.all([rc1, rc2])
    expect(useSchemaStore.getState().rowCounts.get('conn1:public:users')).toBe(42)
  })

  it('a failed fetchIndexes returns [] (no throw) and evicts its pending entry so the next call retries', async () => {
    // fetchIndexes now follows the shared policy: a failure is caught and
    // returns [] rather than propagating as an unhandled rejection, and the
    // dedupe `finally` still evicts the pending entry.
    const first = deferred<SchemaIndex[]>()
    mockInvoke.mockReturnValueOnce(first.promise)
    const failing = useSchemaStore.getState().fetchIndexes('conn1', 'users', 'public')
    first.reject(new Error('transient'))
    await expect(failing).resolves.toEqual([])

    // Pending entry gone → a fresh call issues a new invoke and succeeds.
    const indexes: SchemaIndex[] = [{ name: 'idx', columns: ['a'], unique: false }]
    mockInvoke.mockResolvedValueOnce(indexes)
    const result = await useSchemaStore.getState().fetchIndexes('conn1', 'users', 'public')
    expect(result).toEqual(indexes)
    // Two data round trips (the failure also fires a fire-and-forget activity
    // record on the same bridge — count only the index fetches).
    expect(dataInvokeCount()).toBe(2)
  })

  it('a failed fetchColumns (which returns []) also retries on the next call', async () => {
    mockInvoke.mockRejectedValueOnce(new Error('boom'))
    const first = await useSchemaStore.getState().fetchColumns('conn1', 'users', 'public')
    expect(first).toEqual([])
    // The empty result was not cached and no pending entry lingers, so a retry
    // hits IPC again rather than returning the stale empty list.
    const columns: SchemaColumn[] = [
      { name: 'id', dataType: 'integer', nullable: false, defaultValue: null, isPrimaryKey: true, isForeignKey: false }
    ]
    mockInvoke.mockResolvedValueOnce(columns)
    const second = await useSchemaStore.getState().fetchColumns('conn1', 'users', 'public')
    expect(second).toEqual(columns)
    // The failure also records a fire-and-forget activity entry over the same
    // bridge — count only the column fetches.
    expect(dataInvokeCount()).toBe(2)
  })

  it('clearCache(connectionId) drops in-flight promises for that connection', async () => {
    const d = deferred<SchemaColumn[]>()
    mockInvoke.mockReturnValueOnce(d.promise)
    const first = useSchemaStore.getState().fetchColumns('conn1', 'users', 'public')
    expect(useSchemaStore.getState().columnsPending.has('conn1:public:users')).toBe(true)

    useSchemaStore.getState().clearCache('conn1')
    expect(useSchemaStore.getState().columnsPending.has('conn1:public:users')).toBe(false)

    // A caller arriving after the invalidation must start a fresh request rather
    // than latch onto the promise that predates the clear.
    const fresh: SchemaColumn[] = [
      { name: 'id', dataType: 'integer', nullable: false, defaultValue: null, isPrimaryKey: true, isForeignKey: false }
    ]
    mockInvoke.mockResolvedValueOnce(fresh)
    const second = await useSchemaStore.getState().fetchColumns('conn1', 'users', 'public')
    expect(second).toEqual(fresh)
    expect(mockInvoke).toHaveBeenCalledTimes(2)

    // Settle the abandoned first request; it must not throw unhandled.
    d.resolve([])
    await first
  })

  it('clearCache() with no connectionId clears every pending map', () => {
    useSchemaStore.setState({
      columnsPending: new Map([['conn1:public:users', Promise.resolve([])]]),
      tablesPending: new Map([['conn1:public', Promise.resolve([])]]),
    })
    useSchemaStore.getState().clearCache()
    expect(useSchemaStore.getState().columnsPending.size).toBe(0)
    expect(useSchemaStore.getState().tablesPending.size).toBe(0)
  })
})

describe('useSchemaStore — unified fetch error policy (#201)', () => {
  beforeEach(() => {
    mockInvoke.mockReset()
    resetStore()
    // The activity seam is invoked (fire-and-forget) via the same bridge mock;
    // resolve those writes so recording never itself rejects.
    mockInvoke.mockImplementation((channel: unknown) =>
      channel === IPC_CHANNELS.ACTIVITY_RECORD
        ? Promise.resolve(undefined)
        : Promise.reject(new Error('boom'))
    )
  })

  // Every fetcher, invoked against a backend that rejects, must: settle without
  // throwing, cache no result, and set an errored marker. This is the guard —
  // add a fetcher that swallows silently or rejects unhandled and it fails here.
  const cases: Array<{
    name: string
    kind: Parameters<typeof schemaErrorTag>[0]
    key: string
    run: () => Promise<unknown>
    cache: () => Map<string, unknown>
  }> = [
    {
      name: 'fetchDatabases',
      kind: 'databases',
      key: 'conn1',
      run: () => useSchemaStore.getState().fetchDatabases('conn1'),
      cache: () => useSchemaStore.getState().databases as Map<string, unknown>,
    },
    {
      name: 'fetchSchemas',
      kind: 'schemas',
      key: 'conn1',
      run: () => useSchemaStore.getState().fetchSchemas('conn1'),
      cache: () => useSchemaStore.getState().schemas as Map<string, unknown>,
    },
    {
      name: 'fetchTables',
      kind: 'tables',
      key: 'conn1:public',
      run: () => useSchemaStore.getState().fetchTables('conn1', 'public'),
      cache: () => useSchemaStore.getState().tables as Map<string, unknown>,
    },
    {
      name: 'fetchColumns',
      kind: 'columns',
      key: 'conn1:public:users',
      run: () => useSchemaStore.getState().fetchColumns('conn1', 'users', 'public'),
      cache: () => useSchemaStore.getState().columns as Map<string, unknown>,
    },
    {
      name: 'fetchIndexes',
      kind: 'indexes',
      key: 'conn1:public:users',
      run: () => useSchemaStore.getState().fetchIndexes('conn1', 'users', 'public'),
      cache: () => useSchemaStore.getState().indexes as Map<string, unknown>,
    },
    {
      name: 'fetchSchemaObjects',
      kind: 'objects',
      key: 'conn1:public',
      run: () => useSchemaStore.getState().fetchSchemaObjects('conn1', 'public'),
      cache: () => useSchemaStore.getState().objects as Map<string, unknown>,
    },
    {
      name: 'fetchRowCount',
      kind: 'rowCounts',
      key: 'conn1:public:users',
      run: () => useSchemaStore.getState().fetchRowCount('conn1', 'users', 'public'),
      cache: () => useSchemaStore.getState().rowCounts as Map<string, unknown>,
    },
  ]

  for (const c of cases) {
    it(`${c.name}: an IPC failure resolves (no unhandled rejection), caches nothing, and marks errored`, async () => {
      // Resolves rather than rejects — proves no fetcher leaks a rejection.
      await expect(c.run()).resolves.not.toThrow()
      expect(c.cache().has(c.key)).toBe(false)
      expect(useSchemaStore.getState().errored.has(schemaErrorTag(c.kind, c.key))).toBe(true)
    })
  }

  it('records the failure to the activity seam as a store-level error', async () => {
    await useSchemaStore.getState().fetchColumns('conn1', 'users', 'public')
    const activityCall = mockInvoke.mock.calls.find(
      ([channel]) => channel === IPC_CHANNELS.ACTIVITY_RECORD
    )
    expect(activityCall).toBeDefined()
    const payload = activityCall![1] as { kind: string; level: string; source?: string }
    expect(payload.kind).toBe(ACTIVITY_KIND.STORE)
    expect(payload.level).toBe('error')
    expect(payload.source).toBe('schema-store')
  })

  it('a successful retry clears the errored marker', async () => {
    // First attempt fails and marks errored.
    await useSchemaStore.getState().fetchColumns('conn1', 'users', 'public')
    expect(useSchemaStore.getState().errored.has(schemaErrorTag('columns', 'conn1:public:users'))).toBe(true)

    // Second attempt (the retry) succeeds → marker cleared, result cached.
    const columns: SchemaColumn[] = [
      { name: 'id', dataType: 'integer', nullable: false, defaultValue: null, isPrimaryKey: true, isForeignKey: false }
    ]
    mockInvoke.mockImplementationOnce(() => Promise.resolve(columns))
    const result = await useSchemaStore.getState().fetchColumns('conn1', 'users', 'public')
    expect(result).toEqual(columns)
    expect(useSchemaStore.getState().errored.has(schemaErrorTag('columns', 'conn1:public:users'))).toBe(false)
  })

  it('clearCache(connectionId) drops that connection\'s errored markers, keeping others', async () => {
    await useSchemaStore.getState().fetchColumns('conn1', 'users', 'public')
    await useSchemaStore.getState().fetchColumns('conn2', 'orders', 'public')
    expect(useSchemaStore.getState().errored.has(schemaErrorTag('columns', 'conn1:public:users'))).toBe(true)
    expect(useSchemaStore.getState().errored.has(schemaErrorTag('columns', 'conn2:public:orders'))).toBe(true)

    useSchemaStore.getState().clearCache('conn1')
    expect(useSchemaStore.getState().errored.has(schemaErrorTag('columns', 'conn1:public:users'))).toBe(false)
    expect(useSchemaStore.getState().errored.has(schemaErrorTag('columns', 'conn2:public:orders'))).toBe(true)
  })

  it('clearCache() with no connectionId clears all errored markers', async () => {
    await useSchemaStore.getState().fetchColumns('conn1', 'users', 'public')
    expect(useSchemaStore.getState().errored.size).toBeGreaterThan(0)
    useSchemaStore.getState().clearCache()
    expect(useSchemaStore.getState().errored.size).toBe(0)
  })
})
