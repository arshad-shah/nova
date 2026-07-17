import Database from 'better-sqlite3'
import type { DbAdapter } from '../../../db/adapter'
import { quoteIdentifier } from '../../sdk/identifier'
import { assertConnected } from '../../../db/assert-connected'
import { makeQueryResult } from '../../../db/result-shape'
import type { QueryResult, SchemaTable, SchemaColumn, SchemaIndex, FieldInfo, TestConnectionResult } from '@shared/types'

const SQLITE_QUOTE = '"' as const

/** The subset of a better-sqlite3 prepared statement we depend on. */
export interface PreparedStatementLike {
  /** True when the statement yields rows (SELECT, PRAGMA-that-returns,
   *  WITH…SELECT, and crucially INSERT/UPDATE/DELETE … RETURNING). */
  reader: boolean
  all(...params: unknown[]): unknown[]
  run(...params: unknown[]): { changes: number }
  columns(): { name: string; type?: string | null }[]
}

/**
 * Execute a prepared statement and shape the result.
 *
 * Branching on `stmt.reader` (not a leading-keyword guess) is required for
 * correctness: `INSERT/UPDATE/DELETE … RETURNING` returns rows but doesn't
 * start with SELECT/WITH/PRAGMA, so the old heuristic sent it down the
 * `.run()` path — which discards the RETURNING result the user asked for
 * (and, on better-sqlite3, throws "This statement returns data"). Conversely
 * a non-returning `PRAGMA foreign_keys = ON` must use `.run()`, not `.all()`.
 */
export function runPreparedStatement(
  stmt: PreparedStatementLike,
  params: unknown[] | undefined,
  start: number,
): QueryResult {
  if (stmt.reader) {
    const rows = (params ? stmt.all(...params) : stmt.all()) as Record<string, unknown>[]
    const fields: FieldInfo[] = stmt.columns().map((c) => ({
      name: c.name,
      dataType: c.type ?? 'unknown',
      nullable: true,
    }))
    return makeQueryResult({ rows, fields, start })
  }
  const info = params ? stmt.run(...params) : stmt.run()
  return makeQueryResult({ rows: [], fields: [], affectedRows: info.changes, start })
}

export class SqliteAdapter implements DbAdapter {
  private db: Database.Database | null = null
  private dbPath: string
  private sessions = new Map<string, { autoCommit: boolean; inTxn: boolean }>()

  constructor(config: Record<string, unknown>) {
    this.dbPath = config.database as string
  }

  async connect(): Promise<void> {
    this.db = new Database(this.dbPath)
    this.db.pragma('journal_mode = WAL')
    this.db.pragma('foreign_keys = ON')
  }

  async testConnection(): Promise<TestConnectionResult> {
    const db = assertConnected(this.db)
    const row = db.prepare('SELECT sqlite_version() as version').get() as { version: string }
    return { version: row.version }
  }

  async disconnect(): Promise<void> {
    for (const [, s] of this.sessions) { if (s.inTxn && this.db) this.db.prepare('ROLLBACK').run() }
    this.sessions.clear()
    this.db?.close()
    this.db = null
  }

  async isConnected(): Promise<boolean> {
    return this.db !== null
  }

  async query(sql: string, params?: unknown[], opts?: { sessionId?: string; timeoutMs?: number }): Promise<QueryResult> {
    const db = assertConnected(this.db)
    const session = opts?.sessionId ? this.sessions.get(opts.sessionId) : undefined
    if (opts?.sessionId && !session) throw new Error(`No open session '${opts.sessionId}'`)
    if (session && !session.autoCommit && !session.inTxn) {
      this.assertExclusiveTxn(opts!.sessionId!)
      db.prepare('BEGIN').run()
      session.inTxn = true
    }

    const start = performance.now()
    const stmt = db.prepare(sql)
    return runPreparedStatement(stmt as unknown as PreparedStatementLike, params, start)
  }

  async openSession(sessionId: string, opts?: { autoCommit?: boolean }): Promise<void> {
    if (!this.db) throw new Error('Not connected')
    if (this.sessions.has(sessionId)) return
    this.sessions.set(sessionId, { autoCommit: opts?.autoCommit ?? true, inTxn: false })
  }

  async closeSession(sessionId: string): Promise<void> {
    const s = this.sessions.get(sessionId)
    if (s?.inTxn && this.db) this.db.prepare('ROLLBACK').run()
    this.sessions.delete(sessionId)
  }

  async setAutoCommit(sessionId: string, enabled: boolean): Promise<void> {
    const s = this.sessions.get(sessionId)
    if (!s) return
    if (enabled && s.inTxn && this.db) { this.db.prepare('COMMIT').run(); s.inTxn = false }
    s.autoCommit = enabled
  }

  async beginTransaction(sessionId: string): Promise<void> {
    const s = this.requireSession(sessionId)
    if (s.inTxn || !this.db) return
    this.assertExclusiveTxn(sessionId)
    this.db.prepare('BEGIN').run()
    s.inTxn = true
  }

  async commit(sessionId: string): Promise<void> {
    const s = this.sessions.get(sessionId)
    if (s?.inTxn && this.db) { this.db.prepare('COMMIT').run(); s.inTxn = false }
  }

  async rollback(sessionId: string): Promise<void> {
    const s = this.sessions.get(sessionId)
    if (s?.inTxn && this.db) { this.db.prepare('ROLLBACK').run(); s.inTxn = false }
  }

  private requireSession(sessionId: string): { autoCommit: boolean; inTxn: boolean } {
    const s = this.sessions.get(sessionId)
    if (!s) throw new Error(`No open session '${sessionId}'`)
    return s
  }

  /** SQLite shares one connection — only one transaction can be open at a time.
   *  Surfaces a legible error instead of an opaque "cannot start a transaction
   *  within a transaction" when another session/tab already holds one. */
  private assertExclusiveTxn(sessionId: string): void {
    for (const [id, s] of this.sessions) {
      if (id !== sessionId && s.inTxn) {
        throw new Error('SQLite allows only one active transaction at a time; another session has an open transaction. Commit or roll it back first.')
      }
    }
  }

  async getTables(schema?: string): Promise<SchemaTable[]> {
    const db = assertConnected(this.db)
    const rows = db.prepare(
      "SELECT name, type FROM sqlite_master WHERE type IN ('table', 'view') AND name NOT LIKE 'sqlite_%' ORDER BY name"
    ).all() as { name: string; type: string }[]
    return rows.map(r => ({
      name: r.name,
      schema: schema ?? 'main',
      type: r.type as 'table' | 'view'
    }))
  }

  async getColumns(table: string, _schema?: string): Promise<SchemaColumn[]> {
    const db = assertConnected(this.db)
    const qt = quoteIdentifier(table, SQLITE_QUOTE)
    const rows = db.prepare(`PRAGMA table_info(${qt})`).all() as {
      cid: number; name: string; type: string; notnull: number; dflt_value: string | null; pk: number
    }[]
    const fkRows = db.prepare(`PRAGMA foreign_key_list(${qt})`).all() as {
      from: string; table: string; to: string
    }[]
    const fkMap = new Map(fkRows.map(fk => [fk.from, { table: fk.table, column: fk.to }]))
    return rows.map(r => ({
      name: r.name,
      dataType: r.type || 'TEXT',
      nullable: r.notnull === 0,
      defaultValue: r.dflt_value,
      isPrimaryKey: r.pk > 0,
      isForeignKey: fkMap.has(r.name),
      references: fkMap.get(r.name)
    }))
  }

  async getIndexes(table: string, _schema?: string): Promise<SchemaIndex[]> {
    const db = assertConnected(this.db)
    const idxRows = db.prepare(`PRAGMA index_list(${quoteIdentifier(table, SQLITE_QUOTE)})`).all() as {
      name: string; unique: number
    }[]
    return idxRows.map(idx => {
      const cols = db.prepare(`PRAGMA index_info(${quoteIdentifier(idx.name, SQLITE_QUOTE)})`).all() as { name: string }[]
      return {
        name: idx.name,
        columns: cols.map(c => c.name),
        unique: idx.unique === 1
      }
    })
  }

  async getRowCount(table: string, _schema?: string): Promise<number> {
    const db = assertConnected(this.db)
    const row = db.prepare(`SELECT count(*) as cnt FROM ${quoteIdentifier(table, SQLITE_QUOTE)}`).get() as { cnt: number }
    return row.cnt
  }

  async getSchemas(): Promise<string[]> {
    const db = assertConnected(this.db)
    const rows = db.prepare('PRAGMA database_list').all() as { name: string }[]
    return rows.map(r => r.name)
  }

  async getDatabases(): Promise<string[]> {
    return [this.dbPath.split('/').pop() ?? this.dbPath]
  }

  async switchDatabase(_database: string): Promise<void> {
    throw new Error('SQLite does not support switching databases')
  }
}
