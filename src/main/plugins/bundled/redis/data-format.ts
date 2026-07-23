import type { DbAdapter } from '../../../db/adapter'
import type { SchemaColumn } from '@shared/types'
import type { RedisCommandDispatcher } from './redis-adapter'
import type { RegisteredExporter } from '../../sdk/exporter-registry'
import type { RegisteredImporter } from '../../sdk/importer-registry'

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
  if (typeof candidate.command !== 'function') {
    throw new Error('Redis getTableData requires the RedisAdapter command dispatcher')
  }
  return candidate as RedisCommandDispatcher
}

export async function getTableData(
  adapter: DbAdapter,
  table: string,
  _schema?: string
): Promise<{ rows: Record<string, unknown>[]; columns: SchemaColumn[] }> {
  const redis = asRedisDispatcher(adapter)
  const escaped = escapeRedisGlob(table)
  // Dispatch structured argument arrays, NOT interpolated command strings. Key
  // names come back from the server and are binary-safe — a key literally named
  // "app\nFLUSHALL" would, if spliced into a `query()` string, be re-tokenised
  // into a second command (stored command injection). Passing each argument as
  // its own array element closes that hole: ioredis sends it verbatim and never
  // re-parses it.
  const keysResult = await redis.command(['KEYS', `${escaped}:*`])
  const keys = keysResult.rows.map(r => String(r.value ?? r['0'] ?? ''))
    .filter(k => k.length > 0)
  const rows: Record<string, unknown>[] = []
  for (const key of keys) {
    try {
      const typeRes = await redis.command(['TYPE', key])
      const type = String(typeRes.rows[0]?.value ?? 'string')
      let value: unknown
      switch (type) {
        case 'string':
          value = (await redis.command(['GET', key])).rows[0]?.value
          break
        case 'list':
          value = (await redis.command(['LRANGE', key, '0', '-1'])).rows.map(r => r.value)
          break
        case 'set':
          value = (await redis.command(['SMEMBERS', key])).rows.map(r => r.value)
          break
        case 'hash':
          value = (await redis.command(['HGETALL', key])).rows.reduce(
            (acc, r) => ({ ...acc, [String(r.field)]: r.value }), {})
          break
        case 'zset':
          value = (await redis.command(['ZRANGE', key, '0', '-1', 'WITHSCORES'])).rows.map(r => r.value)
          break
        default:
          value = null
      }
      rows.push({ key, type, value })
    } catch {
      rows.push({ key, type: 'unknown', value: null })
    }
  }
  const columns: SchemaColumn[] = [
    { name: 'key', dataType: 'string', nullable: false, isPrimaryKey: true, isForeignKey: false, defaultValue: null },
    { name: 'type', dataType: 'string', nullable: false, isPrimaryKey: false, isForeignKey: false, defaultValue: null },
    { name: 'value', dataType: 'any', nullable: true, isPrimaryKey: false, isForeignKey: false, defaultValue: null }
  ]
  return { rows, columns }
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
