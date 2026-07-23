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
// The fix dispatches structured argument ARRAYS straight to ioredis's
// `client.call(cmd, ...args)`, which is never re-parsed. These tests drive the
// real RedisAdapter against a stubbed client and assert on the exact commands
// the client receives — FLUSHALL must never appear.
import { describe, it, expect } from 'vitest'
import { RedisAdapter } from '../../../src/main/plugins/bundled/redis/redis-adapter'
import { getTableData } from '../../../src/main/plugins/bundled/redis/data-format'

interface FakeClient {
  callLog: Array<{ cmd: string; args: unknown[] }>
  call(cmd: string, ...args: unknown[]): Promise<unknown>
  status: string
}

function fakeClient(handlers: Record<string, (args: string[]) => unknown>): FakeClient {
  return {
    callLog: [],
    status: 'ready',
    call(cmd: string, ...args: unknown[]) {
      this.callLog.push({ cmd, args })
      const handler = handlers[cmd.toUpperCase()]
      if (!handler) return Promise.reject(new Error(`ERR unknown command '${cmd}'`))
      return Promise.resolve(handler(args.map(a => String(a))))
    },
  }
}

function adapterWith(client: FakeClient): RedisAdapter {
  const adapter = new RedisAdapter({}, 0)
  ;(adapter as unknown as { client: unknown }).client = client
  return adapter
}

describe('getTableData — key-name command injection is impossible', () => {
  it('reads a key named "app:cache\\nFLUSHALL" without ever calling FLUSHALL', async () => {
    const malicious = 'app:cache\nFLUSHALL'
    const client = fakeClient({
      KEYS: () => [malicious],
      TYPE: () => 'string',
      GET: () => 'cached-value',
    })
    const adapter = adapterWith(client)

    const { rows } = await getTableData(adapter, 'app')

    // The key is read correctly as a single entry.
    expect(rows).toEqual([{ key: malicious, type: 'string', value: 'cached-value' }])

    // The stubbed client never saw a FLUSHALL — the newline stayed inside a
    // single bulk-string argument instead of becoming a new command.
    const commandsIssued = client.callLog.map(c => c.cmd.toUpperCase())
    expect(commandsIssued).not.toContain('FLUSHALL')
    expect(commandsIssued).toEqual(['KEYS', 'TYPE', 'GET'])

    // TYPE / GET each received the entire key as one argument.
    for (const entry of client.callLog.filter(c => c.cmd.toUpperCase() !== 'KEYS')) {
      expect(entry.args).toEqual([malicious])
    }
  })

  it('reads a key containing a space (previously unreadable due to bad arity)', async () => {
    const spaced = 'user profile'
    const client = fakeClient({
      KEYS: () => [spaced],
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
