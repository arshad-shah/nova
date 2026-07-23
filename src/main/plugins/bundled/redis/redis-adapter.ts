import Redis, { type RedisOptions } from 'ioredis'
import type { DbAdapter } from '../../../db/adapter'
import type { QueryResult, SchemaTable, SchemaColumn, SchemaIndex, FieldInfo, TestConnectionResult } from '@shared/types'

export interface CommandResult {
  command: string
  value: unknown
}

/** A single Redis command argument. Numbers are stringified at dispatch. */
export type RedisArg = string | number

/**
 * The structured-command escape hatch driver code (getTableData, …) uses to run
 * Redis commands without going through the string-parsing `query()`. Arguments
 * are handed to ioredis as an array and never re-tokenised, so a server-supplied
 * value (a key name) containing spaces or newlines cannot smuggle in a second
 * command. `RedisAdapter` implements it; internal callers narrow to it.
 */
export interface RedisCommandDispatcher {
  command(args: RedisArg[]): Promise<QueryResult>
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

export class RedisAdapter implements DbAdapter, RedisCommandDispatcher {
  private client: Redis | null = null
  private readonly connectionOptions: RedisOptions | string
  private currentDatabase: number

  constructor(options: RedisOptions | string, database = 0) {
    this.connectionOptions = options
    this.currentDatabase = database
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

  async getTables(_schema?: string): Promise<SchemaTable[]> {
    if (!this.client) throw new Error('Not connected')
    // Redis doesn't have tables — return key patterns as pseudo-tables
    const keys = await this.client.keys('*')
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
    const keys = await this.client.keys(`${table}:*`)
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
