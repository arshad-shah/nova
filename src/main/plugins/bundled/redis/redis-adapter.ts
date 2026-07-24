import Redis, { type RedisOptions } from 'ioredis'
import type { DbAdapter } from '../../../db/adapter'
import type { QueryResult, SchemaTable, SchemaColumn, SchemaIndex, FieldInfo, TestConnectionResult } from '@shared/types'

export interface CommandResult {
  command: string
  value: unknown
}

/** A single Redis command argument. Numbers are stringified at dispatch. */
export type RedisArg = string | number

/** One reply from a pipelined command: either an error or a value, never both. */
export interface RedisPipelineReply {
  error: Error | null
  value: unknown
}

/** Runtime limits for the key-scanning paths, sourced from plugin settings. */
export interface RedisScanLimits {
  /** `COUNT` hint handed to every `SCAN` (batch size, not a result cap). */
  scanCount?: number
  /** Upper bound on keys collected by an unbounded scan (getTables/getRowCount),
   *  so deriving prefixes or a count can never walk an entire huge keyspace. */
  maxKeys?: number
}

/**
 * The structured-command escape hatch driver code (getTableData, …) uses to run
 * Redis commands without going through the string-parsing `query()`. Arguments
 * are handed to ioredis as an array and never re-tokenised, so a server-supplied
 * value (a key name) containing spaces or newlines cannot smuggle in a second
 * command. `RedisAdapter` implements it; internal callers narrow to it.
 */
export interface RedisCommandDispatcher {
  command(args: RedisArg[]): Promise<QueryResult>
  /**
   * Non-blocking, bounded key enumeration via `SCAN` (`scanStream`) — never
   * `KEYS`, which is O(N) over the whole keyspace and blocks the server for its
   * duration. Honours the `scanCount` setting as the `COUNT` hint, de-duplicates
   * keys a cursor may revisit, and stops at `max` (default: the `maxKeys` limit),
   * reporting `truncated` when it hit the bound instead of exhausting the scan.
   */
  scanKeys(match: string, opts?: { max?: number }): Promise<{ keys: string[]; truncated: boolean }>
  /**
   * Run many commands in a single round trip via an ioredis pipeline. Each
   * argument array is sent verbatim (never re-parsed), so a server-supplied key
   * name is injection-safe here exactly as it is through `command()`. Returns one
   * reply per command, in order, so the caller can handle per-command errors
   * without one bad key failing the whole batch.
   */
  pipeline(commands: RedisArg[][]): Promise<RedisPipelineReply[]>
}

/**
 * Map a stored connection profile to ioredis options + a target database.
 *
 * The previous factory passed the whole profile straight to ioredis as
 * `RedisOptions` with no second arg, which (a) dropped the `database` field
 * — every connection silently landed on db0 — and (b) never translated the
 * `ssl` checkbox into ioredis's `tls` option, so a user who enabled "SSL"
 * got a plaintext connection while the UI claimed otherwise. Profile-only
 * keys (`id`, `name`, `type`, `ssl`, `database`, …) also leaked in as bogus
 * ioredis options. This maps each declared field explicitly instead.
 */
export function buildRedisConnection(
  config: Record<string, unknown>
): { options: RedisOptions; database: number } {
  const options: RedisOptions = {
    host: (typeof config.host === 'string' && config.host) || 'localhost',
    port: Number(config.port) || 6379,
  }
  if (typeof config.username === 'string' && config.username) options.username = config.username
  if (typeof config.password === 'string' && config.password) options.password = config.password
  // ioredis enables TLS only when `tls` is set; the profile uses an `ssl` flag.
  if (config.ssl) options.tls = {}
  return { options, database: Number(config.database) || 0 }
}

const HEX = /[0-9a-fA-F]/

function unescapeDoubleQuoted(ch: string): string {
  switch (ch) {
    case 'n': return '\n'
    case 'r': return '\r'
    case 't': return '\t'
    case 'b': return '\b'
    case 'a': return '\x07'
    default: return ch // \" → " , \\ → \ , everything else is literal
  }
}

/**
 * Tokenise one line of the Redis console the way `redis-cli` does
 * (`sdssplitargs`): whitespace separates arguments, double quotes support
 * `\xHH` hex and `\n \r \t \b \a \" \\` escapes, single quotes are literal
 * except for `\'`, and adjacent quoted/unquoted runs concatenate into one
 * argument. This is what lets `SET k "hello world"` be three arguments instead
 * of four — a value containing a space was previously unwritable.
 */
function tokenizeRedisLine(line: string): string[] {
  const args: string[] = []
  let i = 0
  const n = line.length
  while (i < n) {
    while (i < n && /\s/.test(line[i])) i++
    if (i >= n) break
    let current = ''
    let building = true
    while (i < n && building) {
      const c = line[i]
      if (c === '"') {
        i++
        while (i < n && line[i] !== '"') {
          if (line[i] === '\\' && i + 1 < n) {
            const next = line[i + 1]
            if (next === 'x' && i + 3 < n && HEX.test(line[i + 2]) && HEX.test(line[i + 3])) {
              current += String.fromCharCode(parseInt(line.slice(i + 2, i + 4), 16))
              i += 4
            } else {
              current += unescapeDoubleQuoted(next)
              i += 2
            }
          } else {
            current += line[i]
            i++
          }
        }
        i++ // consume closing quote (or fall off the end on an unterminated string)
      } else if (c === "'") {
        i++
        while (i < n && line[i] !== "'") {
          if (line[i] === '\\' && line[i + 1] === "'") {
            current += "'"
            i += 2
          } else {
            current += line[i]
            i++
          }
        }
        i++ // consume closing quote
      } else if (/\s/.test(c)) {
        building = false
      } else {
        current += c
        i++
      }
    }
    args.push(current)
  }
  return args
}

/**
 * Split a Redis console buffer into commands: one per line, each tokenised with
 * `redis-cli`-style quoting (see {@link tokenizeRedisLine}). This is the parser
 * for **user-typed** console input only. Driver code that reads server-supplied
 * values (key names) must never round-trip through here — it would let a key
 * name containing a newline become a second command — and instead dispatches
 * structured arrays via {@link RedisCommandDispatcher.command}.
 */
export function parseRedisCommands(input: string): string[][] {
  return input
    .split('\n')
    .map(line => tokenizeRedisLine(line))
    .filter(args => args.length > 0)
}

function formatSingleValue(value: unknown): Record<string, unknown>[] {
  if (value === null) {
    return [{ value: '(nil)' }]
  }

  if (Array.isArray(value)) {
    return value.map((item, index) => ({ index, value: item }))
  }

  if (typeof value === 'object' && value !== null) {
    return Object.entries(value as Record<string, unknown>).map(([field, val]) => ({ field, value: val }))
  }

  return [{ value }]
}

export function formatRedisResult(results: CommandResult[]): QueryResult {
  const duration = 0
  const affectedRows = 0

  if (results.length === 1) {
    const rows = formatSingleValue(results[0].value)
    const fieldNames = rows.length > 0 ? Object.keys(rows[0]) : ['value']
    const fields: FieldInfo[] = fieldNames.map(name => ({ name, dataType: 'unknown', nullable: true }))
    return { rows, fields, rowCount: rows.length, duration, affectedRows }
  }

  // Multiple commands: include command column, separate with delimiter rows
  const rows: Record<string, unknown>[] = []

  for (let i = 0; i < results.length; i++) {
    const { command, value } = results[i]
    const valueRows = formatSingleValue(value)

    for (const row of valueRows) {
      rows.push({ command, ...row })
    }

    if (i < results.length - 1) {
      rows.push({ command: '---', value: '---' })
    }
  }

  const fieldNames = rows.length > 0 ? Object.keys(rows[0]) : ['command', 'value']
  const fields: FieldInfo[] = fieldNames.map(name => ({ name, dataType: 'unknown', nullable: true }))

  return { rows, fields, rowCount: rows.length, duration, affectedRows }
}

/** Default `COUNT` hint for `SCAN` when the plugin setting is absent. */
const DEFAULT_SCAN_COUNT = 200
/** Default ceiling for an unbounded scan (getTables/getRowCount) when unset. */
const DEFAULT_MAX_KEYS = 10000

export class RedisAdapter implements DbAdapter, RedisCommandDispatcher {
  private client: Redis | null = null
  private readonly connectionOptions: RedisOptions | string
  private currentDatabase: number
  private readonly scanCount: number
  private readonly maxKeys: number

  constructor(options: RedisOptions | string, database = 0, limits: RedisScanLimits = {}) {
    this.connectionOptions = options
    this.currentDatabase = database
    this.scanCount = limits.scanCount ?? DEFAULT_SCAN_COUNT
    this.maxKeys = limits.maxKeys ?? DEFAULT_MAX_KEYS
  }

  async connect(): Promise<void> {
    this.client = typeof this.connectionOptions === 'string'
      ? new Redis(this.connectionOptions)
      : new Redis(this.connectionOptions)
    if (this.currentDatabase !== 0) {
      await this.client.select(this.currentDatabase)
    }
    // Ping to verify connection
    await this.client.ping()
  }

  async testConnection(): Promise<TestConnectionResult> {
    if (!this.client) throw new Error('Not connected')
    const info = await this.client.info('server')
    const versionMatch = info.match(/redis_version:(.+)/)
    const version = versionMatch ? versionMatch[1].trim() : 'unknown'
    return { version: `Redis ${version}` }
  }

  async disconnect(): Promise<void> {
    await this.client?.quit()
    this.client = null
  }

  async isConnected(): Promise<boolean> {
    return this.client !== null && this.client.status === 'ready'
  }

  /**
   * Run one command from its already-split argument array. Dispatches through
   * ioredis's `client.call(cmd, ...args)` so the array is sent as-is (never
   * re-parsed) and unknown commands — plus Object.prototype-inherited methods
   * like `toString` — surface as proper Redis ERR replies instead of being
   * reachable through raw bracket access on the client instance.
   */
  private async callCommand(args: RedisArg[]): Promise<CommandResult> {
    if (!this.client) throw new Error('Not connected')
    const stringArgs = args.map(a => String(a))
    const [cmd, ...cmdArgs] = stringArgs
    if (cmd === undefined) throw new Error('Empty Redis command')
    const value = await this.client.call(cmd, ...cmdArgs)
    return { command: stringArgs.join(' '), value }
  }

  async query(input: string, _params?: unknown[]): Promise<QueryResult> {
    if (!this.client) throw new Error('Not connected')

    const start = performance.now()
    const commands = parseRedisCommands(input)

    const results: CommandResult[] = []
    for (const args of commands) {
      results.push(await this.callCommand(args))
    }

    const duration = Math.round(performance.now() - start)
    const result = formatRedisResult(results)
    return { ...result, duration }
  }

  /**
   * Structured-command dispatch for internal driver code — see
   * {@link RedisCommandDispatcher}. The argument array is handed straight to
   * ioredis and never tokenised, so a server-supplied value (e.g. a key name
   * containing a newline or a space) cannot inject an extra command the way
   * interpolating it into a `query()` string would.
   */
  async command(args: RedisArg[]): Promise<QueryResult> {
    return formatRedisResult([await this.callCommand(args)])
  }

  /**
   * Enumerate keys matching `match` with `SCAN` (never `KEYS`). `scanStream`
   * iterates the keyspace in `scanCount`-sized batches without blocking the
   * server; we de-duplicate keys a cursor can legitimately return more than once
   * and stop at `max`, tearing the stream down early rather than draining a
   * multi-million-key keyspace. `truncated` tells the caller the bound was hit.
   */
  async scanKeys(match: string, opts: { max?: number } = {}): Promise<{ keys: string[]; truncated: boolean }> {
    if (!this.client) throw new Error('Not connected')
    const max = opts.max ?? this.maxKeys
    const stream = this.client.scanStream({ match, count: this.scanCount })
    const seen = new Set<string>()
    let truncated = false
    try {
      for await (const batch of stream as AsyncIterable<string[]>) {
        for (const key of batch) {
          seen.add(key)
          if (seen.size >= max) { truncated = true; break }
        }
        if (truncated) break
      }
    } finally {
      stream.destroy()
    }
    return { keys: Array.from(seen), truncated }
  }

  /**
   * Dispatch many commands in one pipeline round trip. Argument arrays are sent
   * to ioredis verbatim (never tokenised), so server-supplied key names stay
   * injection-safe. Returns one `{ error, value }` per command so a single bad
   * key surfaces as its own error instead of aborting the whole batch.
   */
  async pipeline(commands: RedisArg[][]): Promise<RedisPipelineReply[]> {
    if (!this.client) throw new Error('Not connected')
    if (commands.length === 0) return []
    const stringified = commands.map(args => args.map(a => String(a)))
    const replies = await this.client.pipeline(stringified).exec()
    // exec() resolves to null only when the pipeline itself could not run.
    if (!replies) return commands.map(() => ({ error: new Error('Pipeline execution failed'), value: null }))
    return replies.map(([error, value]) => ({ error: (error as Error | null) ?? null, value }))
  }

  async getTables(_schema?: string): Promise<SchemaTable[]> {
    if (!this.client) throw new Error('Not connected')
    // Redis doesn't have tables — derive pseudo-tables from key prefixes. Sample
    // the keyspace with a bounded SCAN (never KEYS *): enough to surface the
    // prefixes in use without walking every key on a huge instance.
    const { keys } = await this.scanKeys('*')
    const prefixes = new Set<string>()
    for (const key of keys) {
      const parts = key.split(':')
      if (parts.length > 1) {
        prefixes.add(parts[0])
      } else {
        prefixes.add(key)
      }
    }
    return Array.from(prefixes).map(name => ({
      name,
      schema: `db${this.currentDatabase}`,
      type: 'table' as const,
    }))
  }

  async getColumns(_table: string, _schema?: string): Promise<SchemaColumn[]> {
    // Redis is schema-less — no columns to introspect
    return []
  }

  async getIndexes(_table: string, _schema?: string): Promise<SchemaIndex[]> {
    // Redis has no indexes in the relational sense
    return []
  }

  async getRowCount(table: string, _schema?: string): Promise<number> {
    if (!this.client) throw new Error('Not connected')
    // Count keys under the prefix with a bounded, non-blocking SCAN instead of
    // `KEYS prefix:*` (which blocks the server, and fired once per explorer node).
    // The count is capped at `maxKeys`: on a prefix larger than the cap this is a
    // lower bound, not an exact total — the alternative is a full keyspace walk
    // per node, which is exactly the DoS this removes.
    const escaped = table.replace(/[*?[\]\\]/g, '\\$&')
    const { keys } = await this.scanKeys(`${escaped}:*`)
    return keys.length
  }

  async getSchemas(): Promise<string[]> {
    return [`db${this.currentDatabase}`]
  }

  async getDatabases(): Promise<string[]> {
    if (!this.client) throw new Error('Not connected')
    const info = await this.client.info('keyspace')
    const dbPattern = /^db(\d+):/gm
    const dbs: string[] = []
    let match: RegExpExecArray | null
    while ((match = dbPattern.exec(info)) !== null) {
      dbs.push(`db${match[1]}`)
    }
    // Always include db0
    if (!dbs.includes('db0')) dbs.unshift('db0')
    return dbs
  }

  async switchDatabase(database: string): Promise<void> {
    if (!this.client) throw new Error('Not connected')
    const dbNum = parseInt(database.replace(/^db/, ''), 10)
    if (isNaN(dbNum)) throw new Error(`Invalid database: ${database}`)
    await this.client.select(dbNum)
    this.currentDatabase = dbNum
  }

  async cancelQuery(): Promise<void> {
    // Redis does not support query cancellation
  }
}
