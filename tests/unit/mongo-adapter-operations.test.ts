// MongoAdapter.query() dispatches a parsed MongoQuery to one of 11 collection
// operations. Each branch shapes the driver call differently (find applies
// sort/limit/projection only when present; several mutating ops require a
// field the JSON parser doesn't itself enforce). These tests drive the real
// dispatcher against a fake collection so a swapped case label or a dropped
// argument shows up as a wrong call, not just a type error.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MongoAdapter } from '../../src/main/plugins/bundled/mongodb/mongo-adapter'

interface FakeCursor {
  calls: { sort?: unknown; limit?: unknown; project?: unknown }
  sort(s: unknown): FakeCursor
  limit(n: unknown): FakeCursor
  project(p: unknown): FakeCursor
  toArray(): Promise<unknown[]>
}

function makeCursor(data: unknown[]): FakeCursor {
  const calls: FakeCursor['calls'] = {}
  const cursor: FakeCursor = {
    calls,
    sort(s) { calls.sort = s; return cursor },
    limit(n) { calls.limit = n; return cursor },
    project(p) { calls.project = p; return cursor },
    async toArray() { return data },
  }
  return cursor
}

function fakeCollection(overrides: Record<string, unknown> = {}) {
  return {
    find: vi.fn(() => makeCursor([{ _id: '1' }])),
    findOne: vi.fn(async () => ({ _id: '1', name: 'a' })),
    aggregate: vi.fn(() => makeCursor([{ _id: 'g1', total: 3 }])),
    countDocuments: vi.fn(async () => 7),
    distinct: vi.fn(async () => ['a', 'b']),
    insertOne: vi.fn(async () => ({ insertedId: 'new-id' })),
    insertMany: vi.fn(async () => ({ insertedCount: 2 })),
    updateOne: vi.fn(async () => ({ matchedCount: 1, modifiedCount: 1 })),
    updateMany: vi.fn(async () => ({ matchedCount: 3, modifiedCount: 3 })),
    deleteOne: vi.fn(async () => ({ deletedCount: 1 })),
    deleteMany: vi.fn(async () => ({ deletedCount: 4 })),
    indexes: vi.fn(async () => [{ name: '_id_', key: { _id: 1 }, unique: true }]),
    ...overrides,
  }
}

function adapterWithDb(collection: ReturnType<typeof fakeCollection>) {
  const adapter = new MongoAdapter('mongodb://localhost/test', 'test')
  const db = {
    collection: vi.fn(() => collection),
    listCollections: vi.fn(() => makeCursor([{ name: 'users' }, { name: 'orders' }])),
    admin: vi.fn(() => ({ serverInfo: async () => ({ version: '7.0.1' }) })),
  }
  ;(adapter as unknown as { db: unknown }).db = db
  return { adapter, db }
}

describe('MongoAdapter.query — operation dispatch', () => {
  let collection: ReturnType<typeof fakeCollection>

  beforeEach(() => { collection = fakeCollection() })

  it('find applies sort/limit/projection only when provided', async () => {
    const { adapter } = adapterWithDb(collection)
    await adapter.query(JSON.stringify({
      collection: 'users', operation: 'find', filter: { age: 25 }, sort: { age: -1 }, limit: 5, projection: { name: 1 },
    }))
    const cursor = (collection.find as ReturnType<typeof vi.fn>).mock.results[0].value as FakeCursor
    expect(collection.find).toHaveBeenCalledWith({ age: 25 })
    expect(cursor.calls.sort).toEqual({ age: -1 })
    expect(cursor.calls.limit).toBe(5)
    expect(cursor.calls.project).toEqual({ name: 1 })
  })

  it('find with no options skips sort/limit/projection chaining entirely', async () => {
    const { adapter } = adapterWithDb(collection)
    await adapter.query(JSON.stringify({ collection: 'users', operation: 'find' }))
    const cursor = (collection.find as ReturnType<typeof vi.fn>).mock.results[0].value as FakeCursor
    expect(collection.find).toHaveBeenCalledWith({})
    expect(cursor.calls).toEqual({})
  })

  it('findOne returns a one-row result, or empty rows when nothing matches', async () => {
    const { adapter } = adapterWithDb(fakeCollection({ findOne: vi.fn(async () => null) }))
    const result = await adapter.query(JSON.stringify({ collection: 'users', operation: 'findOne', filter: { id: 'x' } }))
    expect(result.rows).toEqual([])
    expect(result.rowCount).toBe(0)
  })

  it('aggregate runs the given pipeline and shapes grouped output', async () => {
    const { adapter } = adapterWithDb(collection)
    const result = await adapter.query(JSON.stringify({
      collection: 'orders', operation: 'aggregate', pipeline: [{ $group: { _id: '$status' } }],
    }))
    expect(collection.aggregate).toHaveBeenCalledWith([{ $group: { _id: '$status' } }])
    expect(result.rows).toEqual([{ _id: 'g1', total: 3 }])
  })

  it('count returns the scalar under a "result" column', async () => {
    const { adapter } = adapterWithDb(collection)
    const result = await adapter.query(JSON.stringify({ collection: 'users', operation: 'count', filter: {} }))
    expect(result.rows).toEqual([{ result: 7 }])
  })

  it('distinct requires a "field" property and throws without one', async () => {
    const { adapter } = adapterWithDb(collection)
    await expect(adapter.query(JSON.stringify({ collection: 'users', operation: 'distinct' })))
      .rejects.toThrow(/requires a "field"/)
    expect(collection.distinct).not.toHaveBeenCalled()
  })

  it('distinct calls the driver with the field and filter', async () => {
    const { adapter } = adapterWithDb(collection)
    await adapter.query(JSON.stringify({ collection: 'users', operation: 'distinct', field: 'name', filter: { active: true } }))
    expect(collection.distinct).toHaveBeenCalledWith('name', { active: true })
  })

  it('insertOne requires a "document" property and throws without one', async () => {
    const { adapter } = adapterWithDb(collection)
    await expect(adapter.query(JSON.stringify({ collection: 'users', operation: 'insertOne' })))
      .rejects.toThrow(/requires a "document"/)
  })

  it('insertOne reports affectedRows=1 and echoes the inserted id', async () => {
    const { adapter } = adapterWithDb(collection)
    const result = await adapter.query(JSON.stringify({ collection: 'users', operation: 'insertOne', document: { name: 'x' } }))
    expect(result.affectedRows).toBe(1)
    expect(result.rows[0].insertedId).toBe('new-id')
  })

  it('insertMany requires a "documents" property and throws without one', async () => {
    const { adapter } = adapterWithDb(collection)
    await expect(adapter.query(JSON.stringify({ collection: 'users', operation: 'insertMany' })))
      .rejects.toThrow(/requires a "documents"/)
  })

  it('insertMany reports affectedRows from insertedCount', async () => {
    const { adapter } = adapterWithDb(collection)
    const result = await adapter.query(JSON.stringify({ collection: 'users', operation: 'insertMany', documents: [{ a: 1 }, { a: 2 }] }))
    expect(result.affectedRows).toBe(2)
  })

  it('updateOne reports modifiedCount as affectedRows, not matchedCount', async () => {
    const { adapter } = adapterWithDb(fakeCollection({
      updateOne: vi.fn(async () => ({ matchedCount: 5, modifiedCount: 2 })),
    }))
    const result = await adapter.query(JSON.stringify({
      collection: 'users', operation: 'updateOne', filter: {}, update: { $set: { a: 1 } },
    }))
    expect(result.affectedRows).toBe(2)
  })

  it('updateMany reports modifiedCount as affectedRows', async () => {
    const { adapter } = adapterWithDb(collection)
    const result = await adapter.query(JSON.stringify({
      collection: 'users', operation: 'updateMany', filter: {}, update: { $set: { a: 1 } },
    }))
    expect(result.affectedRows).toBe(3)
  })

  it('deleteOne/deleteMany report deletedCount as affectedRows', async () => {
    const { adapter } = adapterWithDb(collection)
    const one = await adapter.query(JSON.stringify({ collection: 'users', operation: 'deleteOne', filter: {} }))
    const many = await adapter.query(JSON.stringify({ collection: 'users', operation: 'deleteMany', filter: {} }))
    expect(one.affectedRows).toBe(1)
    expect(many.affectedRows).toBe(4)
  })

  it('throws "Not connected" when db is unset', async () => {
    const adapter = new MongoAdapter('mongodb://localhost/test', 'test')
    await expect(adapter.query('{"collection":"users","operation":"find"}')).rejects.toThrow(/Not connected/)
  })
})

describe('MongoAdapter — schema introspection', () => {
  it('getTables lists collections tagged with the current database as schema', async () => {
    const { adapter } = adapterWithDb(fakeCollection())
    const tables = await adapter.getTables()
    expect(tables).toEqual([
      { name: 'users', schema: 'test', type: 'table' },
      { name: 'orders', schema: 'test', type: 'table' },
    ])
  })

  it('getColumns infers columns by sampling one document, marking _id as the primary key', async () => {
    const { adapter } = adapterWithDb(fakeCollection())
    const columns = await adapter.getColumns('users')
    expect(columns.find(c => c.name === '_id')?.isPrimaryKey).toBe(true)
    expect(columns.find(c => c.name === 'name')?.isPrimaryKey).toBe(false)
  })

  it('getColumns reports each column\'s dataType from the sampled value\'s JS type, not a fixed placeholder', async () => {
    // A dataType hardcoded to a constant would pass every other assertion here
    // yet silently stop telling the schema browser whether a field is a
    // string, number, or boolean.
    const { adapter } = adapterWithDb(fakeCollection({
      findOne: vi.fn(async () => ({ _id: '1', name: 'a', age: 30, active: true })),
    }))
    const columns = await adapter.getColumns('users')
    expect(columns.find(c => c.name === '_id')?.dataType).toBe('string')
    expect(columns.find(c => c.name === 'name')?.dataType).toBe('string')
    expect(columns.find(c => c.name === 'age')?.dataType).toBe('number')
    expect(columns.find(c => c.name === 'active')?.dataType).toBe('boolean')
  })

  it('getColumns returns [] for an empty collection (no sample document)', async () => {
    const { adapter } = adapterWithDb(fakeCollection({ findOne: vi.fn(async () => null) }))
    expect(await adapter.getColumns('empty')).toEqual([])
  })

  it('getIndexes maps compound keys to a column list', async () => {
    const { adapter } = adapterWithDb(fakeCollection({
      indexes: vi.fn(async () => [{ name: 'name_age', key: { name: 1, age: -1 }, unique: false }]),
    }))
    const indexes = await adapter.getIndexes('users')
    expect(indexes).toEqual([{ name: 'name_age', columns: ['name', 'age'], unique: false }])
  })

  it('getRowCount delegates to countDocuments for the given collection', async () => {
    const { adapter, db } = adapterWithDb(fakeCollection({ countDocuments: vi.fn(async () => 42) }))
    expect(await adapter.getRowCount('users')).toBe(42)
    expect(db.collection).toHaveBeenCalledWith('users')
  })

  it('getSchemas returns only the current database name (Mongo has no separate schema concept)', async () => {
    const { adapter } = adapterWithDb(fakeCollection())
    expect(await adapter.getSchemas()).toEqual(['test'])
  })
})

describe('MongoAdapter — database switching and lifecycle', () => {
  it('getDatabases lists names from the admin listDatabases call', async () => {
    const adapter = new MongoAdapter('mongodb://localhost/test', 'test')
    const client = {
      db: vi.fn(() => ({ admin: () => ({ listDatabases: async () => ({ databases: [{ name: 'app' }, { name: 'admin' }] }) }) })),
    }
    ;(adapter as unknown as { client: unknown }).client = client
    expect(await adapter.getDatabases()).toEqual(['app', 'admin'])
  })

  it('getDatabases throws when not connected', async () => {
    const adapter = new MongoAdapter('mongodb://localhost/test', 'test')
    await expect(adapter.getDatabases()).rejects.toThrow(/Not connected/)
  })

  it('switchDatabase re-selects the db off the same client and updates currentDatabase', async () => {
    const adapter = new MongoAdapter('mongodb://localhost/test', 'test')
    const dbs: Record<string, unknown> = {}
    const client = { db: vi.fn((name: string) => (dbs[name] = { name })) }
    ;(adapter as unknown as { client: unknown }).client = client
    await adapter.switchDatabase('reporting')
    expect(client.db).toHaveBeenCalledWith('reporting')
    expect((adapter as unknown as { currentDatabase: string }).currentDatabase).toBe('reporting')
  })

  it('cancelQuery is a no-op that resolves without touching the client', async () => {
    const adapter = new MongoAdapter('mongodb://localhost/test', 'test')
    await expect(adapter.cancelQuery()).resolves.toBeUndefined()
  })

  it('isConnected is false until both client and db are set', async () => {
    const adapter = new MongoAdapter('mongodb://localhost/test', 'test')
    expect(await adapter.isConnected()).toBe(false)
    ;(adapter as unknown as { client: unknown; db: unknown }).client = {}
    ;(adapter as unknown as { client: unknown; db: unknown }).db = {}
    expect(await adapter.isConnected()).toBe(true)
  })

  it('testConnection surfaces the server version string', async () => {
    const { adapter } = adapterWithDb(fakeCollection())
    const info = await adapter.testConnection()
    expect(info.version).toBe('MongoDB 7.0.1')
  })
})
