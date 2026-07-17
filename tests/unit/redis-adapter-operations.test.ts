// RedisAdapter's schema-introspection methods encode Redis-specific
// semantics as relational-shaped data: key prefixes become "tables", INFO
// output gets regex-parsed into a database list, and "table" names are
// re-derived from the `prefix:*` KEYS convention. These tests exercise that
// translation layer against a fake ioredis client, independent of a live
// server.
import { describe, it, expect, vi, beforeEach } from 'vitest'

const ioredisCalls: string[] = []
let fakeInstance: { select: ReturnType<typeof vi.fn>; ping: ReturnType<typeof vi.fn> } | undefined

vi.mock('ioredis', () => ({
  default: vi.fn().mockImplementation(function FakeRedis(this: Record<string, unknown>) {
    fakeInstance = {
      select: vi.fn(async (n: number) => { ioredisCalls.push(`select ${n}`); return 'OK' }),
      ping: vi.fn(async () => { ioredisCalls.push('ping'); return 'PONG' }),
    }
    Object.assign(this, fakeInstance)
  }),
}))

import { RedisAdapter } from '../../src/main/plugins/bundled/redis/redis-adapter'

function adapterWithClient(client: Record<string, unknown>, database = 0): RedisAdapter {
  const adapter = new RedisAdapter({}, database)
  ;(adapter as unknown as { client: unknown }).client = client
  return adapter
}

describe('RedisAdapter — getTables (key-prefix grouping)', () => {
  it('groups colon-delimited keys by their first segment', async () => {
    const adapter = adapterWithClient({ keys: vi.fn(async () => ['user:1', 'user:2', 'session:abc']) })
    const tables = await adapter.getTables()
    expect(tables.map(t => t.name).sort()).toEqual(['session', 'user'])
  })

  it('treats a key with no colon as its own prefix', async () => {
    const adapter = adapterWithClient({ keys: vi.fn(async () => ['standalone']) })
    const tables = await adapter.getTables()
    expect(tables).toEqual([{ name: 'standalone', schema: 'db0', type: 'table' }])
  })

  it('tags every table with the current database as its schema', async () => {
    const adapter = adapterWithClient({ keys: vi.fn(async () => ['a:1']) }, 3)
    const tables = await adapter.getTables()
    expect(tables[0].schema).toBe('db3')
  })

  it('throws "Not connected" without a client', async () => {
    const adapter = new RedisAdapter({}, 0)
    await expect(adapter.getTables()).rejects.toThrow(/Not connected/)
  })
})

describe('RedisAdapter — getRowCount / getColumns / getIndexes', () => {
  it('getRowCount counts keys under the "table:*" prefix', async () => {
    const keys = vi.fn(async () => ['user:1', 'user:2', 'user:3'])
    const adapter = adapterWithClient({ keys })
    expect(await adapter.getRowCount('user')).toBe(3)
    expect(keys).toHaveBeenCalledWith('user:*')
  })

  it('getColumns/getIndexes are always empty — Redis has neither concept', async () => {
    const adapter = adapterWithClient({})
    expect(await adapter.getColumns('user')).toEqual([])
    expect(await adapter.getIndexes('user')).toEqual([])
  })
})

describe('RedisAdapter — getDatabases (INFO keyspace parsing)', () => {
  it('extracts db numbers from "dbN:" lines in the keyspace section', async () => {
    const info = vi.fn(async () => 'db0:keys=3,expires=0,avg_ttl=0\r\ndb5:keys=10,expires=2,avg_ttl=0\r\n')
    const adapter = adapterWithClient({ info })
    expect(await adapter.getDatabases()).toEqual(['db0', 'db5'])
    expect(info).toHaveBeenCalledWith('keyspace')
  })

  it('always includes db0 even when the keyspace section omits it (nothing stored there yet)', async () => {
    const adapter = adapterWithClient({ info: vi.fn(async () => 'db2:keys=1,expires=0\r\n') })
    expect(await adapter.getDatabases()).toEqual(['db0', 'db2'])
  })

  it('returns just db0 for an entirely empty keyspace', async () => {
    const adapter = adapterWithClient({ info: vi.fn(async () => '') })
    expect(await adapter.getDatabases()).toEqual(['db0'])
  })
})

describe('RedisAdapter — switchDatabase', () => {
  it('parses the numeric suffix and SELECTs it', async () => {
    const select = vi.fn(async () => 'OK')
    const adapter = adapterWithClient({ select })
    await adapter.switchDatabase('db7')
    expect(select).toHaveBeenCalledWith(7)
    expect((adapter as unknown as { currentDatabase: number }).currentDatabase).toBe(7)
  })

  it('rejects a database name with no parseable number', async () => {
    const adapter = adapterWithClient({ select: vi.fn() })
    await expect(adapter.switchDatabase('production')).rejects.toThrow(/Invalid database/)
  })
})

describe('RedisAdapter — testConnection / isConnected / disconnect', () => {
  it('testConnection extracts the redis_version from INFO server output', async () => {
    const adapter = adapterWithClient({ info: vi.fn(async () => 'redis_version:7.2.4\r\nother:1\r\n') })
    const result = await adapter.testConnection()
    expect(result.version).toBe('Redis 7.2.4')
  })

  it('testConnection falls back to "unknown" when the version line is missing', async () => {
    const adapter = adapterWithClient({ info: vi.fn(async () => 'nothing_here:1\r\n') })
    const result = await adapter.testConnection()
    expect(result.version).toBe('Redis unknown')
  })

  it('testConnection throws when not connected', async () => {
    const adapter = new RedisAdapter({}, 0)
    await expect(adapter.testConnection()).rejects.toThrow(/Not connected/)
  })

  it('isConnected reflects the client status, not just its presence', async () => {
    const adapter = adapterWithClient({ status: 'connecting' })
    expect(await adapter.isConnected()).toBe(false)
    ;(adapter as unknown as { client: { status: string } }).client.status = 'ready'
    expect(await adapter.isConnected()).toBe(true)
  })

  it('isConnected is false with no client at all', async () => {
    const adapter = new RedisAdapter({}, 0)
    expect(await adapter.isConnected()).toBe(false)
  })

  it('disconnect quits the client and clears the reference', async () => {
    const quit = vi.fn(async () => 'OK')
    const adapter = adapterWithClient({ quit })
    await adapter.disconnect()
    expect(quit).toHaveBeenCalled()
    expect(await adapter.isConnected()).toBe(false)
  })

  it('disconnect tolerates having no client (no-op, does not throw)', async () => {
    const adapter = new RedisAdapter({}, 0)
    await expect(adapter.disconnect()).resolves.toBeUndefined()
  })

  it('cancelQuery is a no-op that resolves', async () => {
    const adapter = adapterWithClient({})
    await expect(adapter.cancelQuery()).resolves.toBeUndefined()
  })
})

describe('RedisAdapter — connect()', () => {
  beforeEach(() => { ioredisCalls.length = 0; fakeInstance = undefined })

  it('selects the configured database before pinging, when database != 0', async () => {
    const adapter = new RedisAdapter({}, 5)
    await adapter.connect()
    expect(ioredisCalls).toEqual(['select 5', 'ping'])
  })

  it('skips SELECT entirely for the default database 0 (avoids a redundant round-trip)', async () => {
    const adapter = new RedisAdapter({}, 0)
    await adapter.connect()
    expect(ioredisCalls).toEqual(['ping'])
  })
})
