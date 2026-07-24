// Regression for issue #211 — Redis stored command injection.
//
// The Redis driver used to read table data by interpolating server-supplied
// key names into command STRINGS and running them through `query()`, whose
// parser splits on whitespace and newlines. A key literally named
//
//     app:cache\nFLUSHALL
//
// therefore became TWO commands: `TYPE app:cache` and `FLUSHALL`. The payload
// is planted once (by anyone with write access to the Redis) and fires the
// moment a DBA browses that prefix in Verql.
//
// The fix dispatches structured argument ARRAYS — keys are enumerated with
// `scanStream` and read through an ioredis pipeline, both of which send each
// argument verbatim and never re-parse it. These tests drive the real
// RedisAdapter against a stubbed client and assert on the exact commands the
// client receives — FLUSHALL must never appear, and KEYS is never used at all.
import { describe, it, expect } from 'vitest'
import { Readable } from 'node:stream'
import { RedisAdapter } from '../../../src/main/plugins/bundled/redis/redis-adapter'
import { getTableData } from '../../../src/main/plugins/bundled/redis/data-format'

interface FakeClient {
  callLog: Array<{ cmd: string; args: unknown[] }>
  scanStream(opts: { match: string; count: number }): Readable
  pipeline(commands: string[][]): { exec(): Promise<[Error | null, unknown][]> }
  keys(): Promise<never>
  status: string
}

// Stub only the paths getTableData uses (SCAN + pipeline). `keys` is present but
// throws, so a regression that reintroduces the blocking KEYS call fails loudly.
function fakeClient(keys: string[], handlers: Record<string, (args: string[]) => unknown>): FakeClient {
  const client: FakeClient = {
    callLog: [],
    status: 'ready',
    keys() { return Promise.reject(new Error('KEYS must never be called — use SCAN')) },
    scanStream() { return Readable.from([keys]) },
    pipeline(commands: string[][]) {
      return {
        async exec(): Promise<[Error | null, unknown][]> {
          return commands.map(([cmd, ...args]) => {
            client.callLog.push({ cmd, args })
            const handler = handlers[cmd.toUpperCase()]
            if (!handler) return [new Error(`ERR unknown command '${cmd}'`), null]
            return [null, handler(args)]
          })
        },
      }
    },
  }
  return client
}

function adapterWith(client: FakeClient): RedisAdapter {
  const adapter = new RedisAdapter({}, 0)
  ;(adapter as unknown as { client: unknown }).client = client
  return adapter
}

describe('getTableData — key-name command injection is impossible', () => {
  it('reads a key named "app:cache\\nFLUSHALL" without ever calling FLUSHALL', async () => {
    const malicious = 'app:cache\nFLUSHALL'
    const client = fakeClient([malicious], {
      TYPE: () => 'string',
      GET: () => 'cached-value',
    })
    const adapter = adapterWith(client)

    const { rows } = await getTableData(adapter, 'app')

    // The key is read correctly as a single entry.
    expect(rows).toEqual([{ key: malicious, type: 'string', value: 'cached-value' }])

    // The stubbed client never saw a FLUSHALL — the newline stayed inside a
    // single bulk-string argument instead of becoming a new command — and KEYS
    // was never issued.
    const commandsIssued = client.callLog.map(c => c.cmd.toUpperCase())
    expect(commandsIssued).not.toContain('FLUSHALL')
    expect(commandsIssued).not.toContain('KEYS')
    expect(commandsIssued).toEqual(['TYPE', 'GET'])

    // TYPE / GET each received the entire key as one argument.
    for (const entry of client.callLog) {
      expect(entry.args).toEqual([malicious])
    }
  })

  it('reads a key containing a space (previously unreadable due to bad arity)', async () => {
    const spaced = 'user profile'
    const client = fakeClient([spaced], {
      TYPE: () => 'string',
      GET: (args) => (args[0] === spaced ? 'ok' : undefined),
    })
    const adapter = adapterWith(client)

    const { rows } = await getTableData(adapter, 'user')
    expect(rows).toEqual([{ key: spaced, type: 'string', value: 'ok' }])
    // GET received exactly one argument, the whole key — not "user" and "profile".
    const get = client.callLog.find(c => c.cmd.toUpperCase() === 'GET')!
    expect(get.args).toEqual([spaced])
  })
})
