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

import { useSchemaStore } from '../../src/renderer/src/stores/schema'

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
  })
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

  it('fetchDatabases stores an empty array and returns [] on IPC failure', async () => {
    mockInvoke.mockRejectedValueOnce(new Error('boom'))
    const result = await useSchemaStore.getState().fetchDatabases('conn1')
    expect(result).toEqual([])
    expect(useSchemaStore.getState().databases.get('conn1')).toEqual([])
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

  it('fetchSchemas caches an empty array and clears loading on IPC failure', async () => {
    mockInvoke.mockRejectedValueOnce(new Error('down'))
    const result = await useSchemaStore.getState().fetchSchemas('conn1')
    expect(result).toEqual([])
    expect(useSchemaStore.getState().schemas.get('conn1')).toEqual([])
    expect(useSchemaStore.getState().loading).toBe(false)
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

  it('fetchSchemaObjects caches an empty array on IPC failure', async () => {
    mockInvoke.mockRejectedValueOnce(new Error('boom'))
    const result = await useSchemaStore.getState().fetchSchemaObjects('conn1', 'public')
    expect(result).toEqual([])
    expect(useSchemaStore.getState().objects.get('conn1:public')).toEqual([])
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
