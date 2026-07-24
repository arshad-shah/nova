// redis/data-format.ts: getTableData enumerates a key prefix with SCAN (never
// the server-blocking KEYS), then reads every key on the page in TWO pipeline
// round trips — one TYPE batch, one type-specific read batch (GET vs LRANGE vs
// SMEMBERS vs HGETALL vs ZRANGE) — rather than two sequential awaits per key.
// A glob-metacharacter prefix is escaped so a "table" named e.g. "user*" can't
// expand into an unintended wildcard scan.
//
// Every command is dispatched as a STRUCTURED argument array — never an
// interpolated command string — so a key name containing a newline or a space
// cannot smuggle in a second command (see the "server-supplied key name" tests
// below and issue #211).
import { describe, it, expect, vi } from 'vitest'
import type { DbAdapter } from '../../src/main/db/adapter'
import type { RedisArg, RedisPipelineReply } from '../../src/main/plugins/bundled/redis/redis-adapter'
import { getTableData, jsonExporter } from '../../src/main/plugins/bundled/redis/data-format'

type PipelineFn = (commands: RedisArg[][]) => Promise<RedisPipelineReply[]>
type ScanFn = (match: string, opts?: { max?: number }) => Promise<{ keys: string[]; truncated: boolean }>

// A fake dispatcher: SCAN returns the canned key list; the pipeline answers each
// command from the per-key type/data maps, one reply per command in order.
function fakeAdapter(keys: string[], typeOf: Record<string, string>, data: Record<string, unknown>) {
  const scanKeys = vi.fn<ScanFn>(async (_match, opts) => ({
    keys: keys.slice(0, opts?.max ?? keys.length),
    truncated: false,
  }))
  const pipeline = vi.fn<PipelineFn>(async (commands) =>
    commands.map((args) => {
      const [verb, key] = args.map((a) => String(a))
      if (verb === 'TYPE') return { error: null, value: typeOf[key] ?? 'string' }
      if (['GET', 'LRANGE', 'SMEMBERS', 'ZRANGE', 'HGETALL'].includes(verb)) {
        return { error: null, value: data[key] }
      }
      return { error: new Error(`unexpected command ${args.join(' ')}`), value: null }
    }),
  )
  const command = vi.fn()
  return { command, scanKeys, pipeline } as unknown as DbAdapter & {
    scanKeys: typeof scanKeys
    pipeline: typeof pipeline
    command: typeof command
  }
}

describe('redis getTableData — type dispatch', () => {
  it('reads a string key via GET', async () => {
    const adapter = fakeAdapter(['user:1'], { 'user:1': 'string' }, { 'user:1': 'alice' })
    const { rows } = await getTableData(adapter, 'user')
    expect(rows).toEqual([{ key: 'user:1', type: 'string', value: 'alice' }])
  })

  it('reads a list key via LRANGE 0 -1', async () => {
    const adapter = fakeAdapter(['queue:1'], { 'queue:1': 'list' }, { 'queue:1': ['a', 'b'] })
    const { rows } = await getTableData(adapter, 'queue')
    expect(rows[0].value).toEqual(['a', 'b'])
  })

  it('reads a set key via SMEMBERS', async () => {
    const adapter = fakeAdapter(['tags:1'], { 'tags:1': 'set' }, { 'tags:1': ['x', 'y'] })
    const { rows } = await getTableData(adapter, 'tags')
    expect(rows[0].value).toEqual(['x', 'y'])
  })

  it('reads a hash key via HGETALL, folded into a plain object', async () => {
    const adapter = fakeAdapter(['profile:1'], { 'profile:1': 'hash' }, { 'profile:1': { name: 'bob', age: '5' } })
    const { rows } = await getTableData(adapter, 'profile')
    expect(rows[0].value).toEqual({ name: 'bob', age: '5' })
  })

  it('folds a flat [field, value, …] HGETALL reply into an object too', async () => {
    const adapter = fakeAdapter(['profile:1'], { 'profile:1': 'hash' }, { 'profile:1': ['name', 'bob', 'age', '5'] })
    const { rows } = await getTableData(adapter, 'profile')
    expect(rows[0].value).toEqual({ name: 'bob', age: '5' })
  })

  it('reads a zset key via ZRANGE WITHSCORES', async () => {
    const adapter = fakeAdapter(['board:1'], { 'board:1': 'zset' }, { 'board:1': ['alice', '10'] })
    const { rows } = await getTableData(adapter, 'board')
    expect(rows[0].value).toEqual(['alice', '10'])
  })

  it('records an unrecognized type as null value without issuing a read', async () => {
    const adapter = fakeAdapter(['weird:1'], { 'weird:1': 'stream' }, {})
    const { rows } = await getTableData(adapter, 'weird')
    expect(rows[0]).toEqual({ key: 'weird:1', type: 'stream', value: null })
  })

  it('falls back to type "unknown" when the TYPE lookup for a key errors', async () => {
    const scanKeys = vi.fn<ScanFn>(async () => ({ keys: ['broken:1'], truncated: false }))
    const pipeline = vi.fn<PipelineFn>(async (commands) =>
      commands.map((args) =>
        String(args[0]) === 'TYPE'
          ? { error: new Error('connection reset'), value: null }
          : { error: null, value: null },
      ),
    )
    const adapter = { command: vi.fn(), scanKeys, pipeline } as unknown as DbAdapter
    const { rows } = await getTableData(adapter, 'broken')
    expect(rows).toEqual([{ key: 'broken:1', type: 'unknown', value: null }])
  })

  it('marks a key "unknown" when its value read errors mid-batch', async () => {
    const scanKeys = vi.fn<ScanFn>(async () => ({ keys: ['a:1'], truncated: false }))
    const pipeline = vi.fn<PipelineFn>(async (commands) =>
      commands.map((args) =>
        String(args[0]) === 'TYPE'
          ? { error: null, value: 'string' }
          : { error: new Error('WRONGTYPE'), value: null },
      ),
    )
    const adapter = { command: vi.fn(), scanKeys, pipeline } as unknown as DbAdapter
    const { rows } = await getTableData(adapter, 'a')
    expect(rows).toEqual([{ key: 'a:1', type: 'unknown', value: null }])
  })

  it('escapes glob metacharacters in the table/prefix name before scanning', async () => {
    const adapter = fakeAdapter([], {}, {})
    await getTableData(adapter, 'user*[1]')
    expect(adapter.scanKeys).toHaveBeenCalledWith('user\\*\\[1\\]:*', expect.anything())
  })

  it('declares key/type/value as its fixed column shape', async () => {
    const adapter = fakeAdapter([], {}, {})
    const { columns } = await getTableData(adapter, 'empty')
    expect(columns.map((c) => c.name)).toEqual(['key', 'type', 'value'])
    expect(columns.find((c) => c.name === 'key')?.isPrimaryKey).toBe(true)
  })

  it('throws if handed an adapter without the structured command dispatcher', async () => {
    // A plain query()-only adapter is exactly the injection-prone path this
    // function must refuse; getTableData never falls back to string commands.
    const adapter = { query: vi.fn() } as unknown as DbAdapter
    await expect(getTableData(adapter, 'user')).rejects.toThrow(/command dispatcher/)
  })

  it('throws if the adapter has command() but not the scan/pipeline transport', async () => {
    const adapter = { command: vi.fn() } as unknown as DbAdapter
    await expect(getTableData(adapter, 'user')).rejects.toThrow(/command dispatcher/)
  })
})

describe('redis getTableData — pipelining (round-trip count)', () => {
  it('reads any number of keys in exactly two pipeline round trips, never one call per key', async () => {
    const keys = Array.from({ length: 50 }, (_, i) => `user:${i}`)
    const typeOf = Object.fromEntries(keys.map((k) => [k, 'string']))
    const data = Object.fromEntries(keys.map((k) => [k, `v-${k}`]))
    const adapter = fakeAdapter(keys, typeOf, data)

    const { rows } = await getTableData(adapter, 'user')

    expect(rows).toHaveLength(50)
    // One SCAN, one TYPE pipeline, one read pipeline — regardless of key count.
    expect(adapter.scanKeys).toHaveBeenCalledTimes(1)
    expect(adapter.pipeline).toHaveBeenCalledTimes(2)
    // The per-key single-command path is never taken.
    expect(adapter.command).not.toHaveBeenCalled()
  })
})

describe('redis getTableData — paging (View data / load more)', () => {
  const keys = ['user:1', 'user:2', 'user:3', 'user:4', 'user:5']
  const typeOf = Object.fromEntries(keys.map((k) => [k, 'string']))
  const data = Object.fromEntries(keys.map((k) => [k, k]))

  it('returns a bounded page and reports hasMore when more keys exist', async () => {
    const adapter = fakeAdapter(keys, typeOf, data)
    const result = await getTableData(adapter, 'user', undefined, { limit: 2, offset: 0 })
    expect(result.rows.map((r) => r.key)).toEqual(['user:1', 'user:2'])
    expect(result.hasMore).toBe(true)
  })

  it('pages with offset and clears hasMore on the final page', async () => {
    const adapter = fakeAdapter(keys, typeOf, data)
    const result = await getTableData(adapter, 'user', undefined, { limit: 2, offset: 4 })
    expect(result.rows.map((r) => r.key)).toEqual(['user:5'])
    expect(result.hasMore).toBe(false)
  })

  it('only scans enough keys to fill the requested page (+1 for hasMore)', async () => {
    const adapter = fakeAdapter(keys, typeOf, data)
    await getTableData(adapter, 'user', undefined, { limit: 2, offset: 1 })
    // offset(1) + limit(2) + 1 = 4
    expect(adapter.scanKeys).toHaveBeenCalledWith('user:*', { max: 4 })
  })

  it('omits hasMore on an unbounded (export) read and scans without a cap', async () => {
    const adapter = fakeAdapter(keys, typeOf, data)
    const result = await getTableData(adapter, 'user')
    expect(result.rows).toHaveLength(5)
    expect('hasMore' in result).toBe(false)
    expect(adapter.scanKeys).toHaveBeenCalledWith('user:*', { max: Infinity })
  })
})

describe('redis getTableData — server-supplied key names (injection)', () => {
  it('reads a key literally named "app\\nFLUSHALL" as a single argument, never issuing FLUSHALL', async () => {
    const malicious = 'app:cache\nFLUSHALL'
    const sent: RedisArg[][] = []
    const scanKeys = vi.fn<ScanFn>(async () => ({ keys: [malicious], truncated: false }))
    const pipeline = vi.fn<PipelineFn>(async (commands) => {
      sent.push(...commands)
      return commands.map((args) => {
        const verb = String(args[0])
        if (verb === 'TYPE') return { error: null, value: 'string' }
        if (verb === 'GET') return { error: null, value: 'cached' }
        return { error: new Error(`unexpected ${args.join(' ')}`), value: null }
      })
    })
    const adapter = { command: vi.fn(), scanKeys, pipeline } as unknown as DbAdapter

    const { rows } = await getTableData(adapter, 'app')

    // The malicious key is read correctly as one key...
    expect(rows).toEqual([{ key: malicious, type: 'string', value: 'cached' }])
    // ...no dispatched command is FLUSHALL (the newline never split it apart)...
    expect(sent.map((args) => String(args[0]))).not.toContain('FLUSHALL')
    // ...and TYPE / GET each received the whole key as ONE argument.
    expect(sent).toContainEqual(['TYPE', malicious])
    expect(sent).toContainEqual(['GET', malicious])
  })

  it('reads a key containing a space correctly (single argument, right arity)', async () => {
    const spaced = 'my key'
    const scanKeys = vi.fn<ScanFn>(async () => ({ keys: [spaced], truncated: false }))
    const pipeline = vi.fn<PipelineFn>(async (commands) =>
      commands.map((args) => {
        const verb = String(args[0])
        if (verb === 'TYPE') return { error: null, value: 'string' }
        if (verb === 'GET') return { error: null, value: 'reachable' }
        return { error: new Error('unexpected'), value: null }
      }),
    )
    const adapter = { command: vi.fn(), scanKeys, pipeline } as unknown as DbAdapter

    const { rows } = await getTableData(adapter, 'my')
    expect(rows).toEqual([{ key: spaced, type: 'string', value: 'reachable' }])
    expect(pipeline).toHaveBeenCalledWith(expect.arrayContaining([['GET', spaced]]))
  })
})

describe('redis jsonExporter', () => {
  it('pretty-prints rows as a JSON array', () => {
    expect(jsonExporter.execute([{ key: 'a', value: 1 }])).toBe(JSON.stringify([{ key: 'a', value: 1 }], null, 2))
  })

  it('renders an empty export as an empty array', () => {
    expect(jsonExporter.execute([])).toBe('[]')
  })
})
