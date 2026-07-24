import type { DbAdapter } from '../../../db/adapter'
import type { SchemaColumn, TableDataOptions, TableDataResult } from '@shared/types'
import type { RedisArg, RedisCommandDispatcher } from './redis-adapter'
import type { RegisteredExporter } from '../../sdk/exporter-registry'

/**
 * In Redis, "tables" are key prefixes. `getTableData` walks every key matching
 * `${prefix}:*` and emits `{ key, value }` rows. Special characters in the
 * prefix are escaped so the user can name a "table" containing glob chars
 * without it expanding into a wildcard.
 */
function escapeRedisGlob(s: string): string {
  return s.replace(/[*?[\]\\]/g, '\\$&')
}

/**
 * Narrow the generic adapter to the Redis structured-command dispatcher. At
 * runtime this is always a `RedisAdapter` (the driver factory built it); the
 * guard keeps the type honest and fails loudly if some other adapter is passed.
 */
function asRedisDispatcher(adapter: DbAdapter): RedisCommandDispatcher {
  const candidate = adapter as Partial<RedisCommandDispatcher>
  if (
    typeof candidate.command !== 'function' ||
    typeof candidate.scanKeys !== 'function' ||
    typeof candidate.pipeline !== 'function'
  ) {
    throw new Error('Redis getTableData requires the RedisAdapter command dispatcher')
  }
  return candidate as RedisCommandDispatcher
}

/** Build the type-specific read for a key, or `null` for a type we can't render. */
function readCommandFor(type: string, key: string): RedisArg[] | null {
  switch (type) {
    case 'string': return ['GET', key]
    case 'list': return ['LRANGE', key, '0', '-1']
    case 'set': return ['SMEMBERS', key]
    case 'hash': return ['HGETALL', key]
    case 'zset': return ['ZRANGE', key, '0', '-1', 'WITHSCORES']
    default: return null
  }
}

/** Fold a HGETALL reply into a plain object. ioredis returns an object for a
 *  pipelined HGETALL, but tolerate a flat `[field, value, …]` array too. */
function foldHash(reply: unknown): Record<string, unknown> {
  if (Array.isArray(reply)) {
    const obj: Record<string, unknown> = {}
    for (let i = 0; i + 1 < reply.length; i += 2) obj[String(reply[i])] = reply[i + 1]
    return obj
  }
  return (reply ?? {}) as Record<string, unknown>
}

export async function getTableData(
  adapter: DbAdapter,
  table: string,
  _schema?: string,
  options?: TableDataOptions,
): Promise<TableDataResult> {
  const redis = asRedisDispatcher(adapter)
  const pattern = `${escapeRedisGlob(table)}:*`

  // Enumerate keys with SCAN, never KEYS. The browse path passes a `limit`, so
  // we only need enough keys to fill the page (+1 to detect `hasMore`); the
  // export path (no limit) reads the whole prefix — still via non-blocking SCAN.
  const limit = options?.limit
  const offset = options?.offset ?? 0
  const scanMax = limit == null ? Infinity : offset + limit + 1
  const { keys: scanned } = await redis.scanKeys(pattern, { max: scanMax })
  // SCAN has no ordering guarantee and a cursor can revisit keys; sort so paging
  // (`offset`/`limit` across successive "load more" calls) is deterministic.
  scanned.sort()
  const page = limit == null ? scanned : scanned.slice(offset, offset + limit)
  const hasMore = limit != null && scanned.length > offset + limit

  // Read every key in the page in TWO pipeline round trips — one TYPE batch, one
  // type-specific read batch — instead of two sequential awaits per key. Key
  // names are passed as structured argument arrays, so a key literally named
  // "app\nFLUSHALL" cannot smuggle in a second command (issue #211).
  const typeReplies = await redis.pipeline(page.map(key => ['TYPE', key]))
  const types = page.map((_key, i) =>
    typeReplies[i]?.error ? 'unknown' : String(typeReplies[i]?.value ?? 'string'),
  )

  // Build the read batch and remember which reply slot each key maps to (keys of
  // an unrenderable type get no read and resolve to a null value).
  const readCommands: RedisArg[][] = []
  const readSlot: (number | null)[] = []
  page.forEach((key, i) => {
    const cmd = readCommandFor(types[i], key)
    if (cmd == null) {
      readSlot.push(null)
    } else {
      readSlot.push(readCommands.length)
      readCommands.push(cmd)
    }
  })
  const readReplies = await redis.pipeline(readCommands)

  const rows: Record<string, unknown>[] = page.map((key, i) => {
    const type = types[i]
    const slot = readSlot[i]
    if (slot == null) return { key, type, value: null }
    const reply = readReplies[slot]
    if (reply?.error) return { key, type: 'unknown', value: null }
    const value = type === 'hash' ? foldHash(reply?.value) : reply?.value ?? null
    return { key, type, value }
  })

  const columns: SchemaColumn[] = [
    { name: 'key', dataType: 'string', nullable: false, isPrimaryKey: true, isForeignKey: false, defaultValue: null },
    { name: 'type', dataType: 'string', nullable: false, isPrimaryKey: false, isForeignKey: false, defaultValue: null },
    { name: 'value', dataType: 'any', nullable: true, isPrimaryKey: false, isForeignKey: false, defaultValue: null }
  ]
  return { rows, columns, ...(limit == null ? {} : { hasMore }) }
}

export const jsonExporter: RegisteredExporter = {
  format: 'json',
  extension: 'json',
  displayName: 'JSON (Redis key/value)',
  appliesToTypes: ['redis'],
  execute(rows) {
    return JSON.stringify(rows, null, 2)
  }
}
