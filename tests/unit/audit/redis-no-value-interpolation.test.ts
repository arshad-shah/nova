import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'

/**
 * Guardrail (issue #211) — the Redis plugin never interpolates a value into a
 * command string passed to `query()`.
 *
 * `query()`'s parser (`parseRedisCommands`) splits on whitespace and newlines
 * with `redis-cli`-style quoting; it exists for **user-typed** console input.
 * Driver code that reads server-supplied values (key names) must never build a
 * command string from them — a key literally named `app\nFLUSHALL` spliced into
 * `` `TYPE ${key}` `` re-tokenises into a second command (stored command
 * injection). Such code must dispatch structured argument arrays through
 * `RedisCommandDispatcher.command([...])` instead, which ioredis sends verbatim.
 *
 * This test fails if any `query(` call in the plugin is handed a template
 * literal containing an interpolation. It is deliberately narrow: a plain
 * string or a non-interpolated template is fine; the danger is `${...}` inside
 * a command string.
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

// A call to `query(` (or `.query(`) whose first argument is a template literal
// that contains an interpolation before the template closes.
//   \bquery\s*\(   → the call (word boundary rejects `sampleQuery`, a method name)
//   \s*`           → first argument opens with a backtick
//   [^`]*\$\{      → an interpolation appears before the closing backtick
const INTERPOLATED_QUERY = /\bquery\s*\(\s*`[^`]*\$\{/

describe('guardrail — redis plugin never interpolates a value into a query() string (#211)', () => {
  it('no query() call in the redis plugin receives an interpolated template literal', () => {
    const offenders: string[] = []
    for (const file of sourceFiles(REDIS_DIR)) {
      const lines = readFileSync(file, 'utf8').split('\n')
      lines.forEach((line, i) => {
        if (INTERPOLATED_QUERY.test(line)) {
          offenders.push(`${rel(file)}:${i + 1}`)
        }
      })
    }

    expect(
      offenders,
      offenders.length
        ? `Redis command injection risk. Interpolating a value into a query() ` +
          `string lets a server-supplied key name (which can contain newlines) ` +
          `become a second Redis command. Dispatch a structured argument array ` +
          `via the adapter's command([...]) method instead.\nOffenders:\n  ` +
          offenders.join('\n  ')
        : undefined
    ).toEqual([])
  })

  it('the guardrail actually catches an interpolated query() call (self-test)', () => {
    // Guards against the regex silently rotting into something that never
    // matches — the failure mode that makes a fitness function worthless.
    const violation = 'const r = await adapter.query(`TYPE ${key}`)'
    const safe = 'const r = await redis.command([\'TYPE\', key])'
    expect(INTERPOLATED_QUERY.test(violation)).toBe(true)
    expect(INTERPOLATED_QUERY.test(safe)).toBe(false)
  })
})
