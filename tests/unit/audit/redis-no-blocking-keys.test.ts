import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'

/**
 * Guardrail (issue #212) — the Redis plugin never enumerates keys with `KEYS`.
 *
 * `KEYS` (including `KEYS *`) is O(N) over the entire keyspace and **blocks the
 * Redis server** for its whole duration; on a production instance with millions
 * of keys, simply browsing a connection in the explorer would stall every other
 * client and could trip failover. Every key-listing path must instead use the
 * non-blocking, cursor-based `SCAN` (ioredis `scanStream`), honouring the
 * `scanCount` setting as its `COUNT` hint and a `maxKeys` cap on how far it walks.
 *
 * This test fails if the plugin reintroduces `KEYS`, in either form:
 *   - a direct `client.keys(...)` call, or
 *   - a structured command dispatch whose verb is `KEYS` (`['KEYS', …]`).
 * It is deliberately narrow: `Object.keys(...)` and the `KEYS` completion-list
 * entry (which merely documents the command a user may type) are not flagged.
 */

const REDIS_DIR = path.join(process.cwd(), 'src', 'main', 'plugins', 'bundled', 'redis')

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry)
    if (statSync(full).isDirectory()) return sourceFiles(full)
    return /\.ts$/.test(full) && !/\.(test|stories)\.ts$/.test(full) ? [full] : []
  })
}

const rel = (p: string) => path.relative(process.cwd(), p)

// A `client.keys(` / `.client.keys(` call — but NOT `Object.keys(`, which the
// word boundary before `client` rejects.
const CLIENT_KEYS_CALL = /\bclient\.keys\s*\(/
// A structured command dispatch whose leading verb is the KEYS command:
// `['KEYS', …]` or `["KEYS", …]`.
const KEYS_COMMAND_DISPATCH = /\[\s*['"]KEYS['"]/i

describe('guardrail — redis plugin never enumerates keys with KEYS (#212)', () => {
  it('no client.keys() call and no KEYS command dispatch in the plugin', () => {
    const offenders: string[] = []
    for (const file of sourceFiles(REDIS_DIR)) {
      const lines = readFileSync(file, 'utf8').split('\n')
      lines.forEach((line, i) => {
        if (CLIENT_KEYS_CALL.test(line) || KEYS_COMMAND_DISPATCH.test(line)) {
          offenders.push(`${rel(file)}:${i + 1}`)
        }
      })
    }

    expect(
      offenders,
      offenders.length
        ? `Redis KEYS is a server-blocking O(N) keyspace walk. Enumerate keys ` +
          `with SCAN (ioredis scanStream, via the adapter's scanKeys()) instead — ` +
          `it is non-blocking and honours the scanCount/maxKeys bounds.\nOffenders:\n  ` +
          offenders.join('\n  ')
        : undefined,
    ).toEqual([])
  })

  it('the guardrail actually catches both KEYS shapes (self-test)', () => {
    // Guards against the regexes silently rotting into something that never
    // matches — the failure mode that makes a fitness function worthless.
    expect(CLIENT_KEYS_CALL.test('const all = await this.client.keys("*")')).toBe(true)
    expect(KEYS_COMMAND_DISPATCH.test("await redis.command(['KEYS', pattern])")).toBe(true)
    // ...and does not flag the legitimate look-alikes.
    expect(CLIENT_KEYS_CALL.test('const names = Object.keys(row)')).toBe(false)
    expect(KEYS_COMMAND_DISPATCH.test("{ label: 'KEYS', kind: 'command' }")).toBe(false)
  })
})
