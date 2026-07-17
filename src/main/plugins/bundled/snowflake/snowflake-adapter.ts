import snowflake from 'snowflake-sdk'
import fs from 'fs/promises'
import type { DbAdapter } from '../../../db/adapter'
import { quoteIdentifier } from '../../sdk/identifier'
import { extractSnowflakeName } from './naming'
import type { QueryResult, SchemaTable, SchemaColumn, SchemaIndex, FieldInfo, TestConnectionResult } from '@shared/types'

const SNOWFLAKE_QUOTE = '"' as const

// Suppress SDK precision-loss warnings — we handle large numbers via fetchAsString on execute()
snowflake.configure({ logLevel: 'ERROR' })

export class SnowflakeAdapter implements DbAdapter {
  private connection: snowflake.Connection | null = null
  private connected = false
  /** The statement currently executing, so cancelQuery() can cancel exactly
   *  that one instead of every query on the session. */
  private activeStatement: snowflake.RowStatement | null = null
  private readonly config: Record<string, unknown>

  constructor(config: Record<string, unknown>) {
    this.config = config
  }

  async connect(): Promise<void> {
    const opts: snowflake.ConnectionOptions = {
      account: this.config.account as string,
    }

    // Only set these if provided — allows auth-only connections for fetching options
    if (this.config.database) opts.database = this.config.database as string
    if (this.config.schema) opts.schema = this.config.schema as string
    if (this.config.warehouse) opts.warehouse = this.config.warehouse as string
    if (this.config.role) opts.role = this.config.role as string

    if (this.config.host) {
      opts.accessUrl = `https://${this.config.host}`
    }

    if (this.config.privateKeyPath) {
      // Key-pair authentication
      opts.username = this.config.username as string
      opts.authenticator = 'SNOWFLAKE_JWT'
      opts.privateKey = await fs.readFile(this.config.privateKeyPath as string, 'utf-8')
      if (this.config.passphrase) {
        opts.privateKeyPass = this.config.passphrase as string
      }
    } else if (this.config.authenticator && !this.config.password) {
      // SSO / OAuth authentication
      opts.username = this.config.username as string
      opts.authenticator = this.config.authenticator as string
      // Cache the SSO token so the browser doesn't re-open on every connection
      opts.clientStoreTemporaryCredential = true
    } else {
      // Username / password authentication
      opts.username = this.config.username as string
      opts.password = this.config.password as string
    }

    this.connection = snowflake.createConnection(opts)

    await new Promise<void>((resolve, reject) => {
      this.connection!.connect((err) => {
        if (err) reject(err)
        else resolve()
      })
    })

    this.connected = true
  }

  async testConnection(): Promise<TestConnectionResult> {
    const result = await this.query('SELECT CURRENT_VERSION() as version')
    return { version: String(result.rows[0]?.version ?? 'unknown') }
  }

  async getConnectionOptions(field: string): Promise<string[]> {
    const extractName = extractSnowflakeName

    switch (field) {
      case 'warehouse': {
        const result = await this.query('SHOW WAREHOUSES')
        return result.rows.map(extractName).filter(Boolean)
      }
      case 'role': {
        const result = await this.query('SHOW ROLES')
        return result.rows.map(extractName).filter(Boolean)
      }
      case 'database': {
        const result = await this.query('SHOW DATABASES')
        return result.rows.map(extractName).filter(Boolean)
      }
      case 'schema': {
        const result = await this.query('SHOW SCHEMAS')
        return result.rows.map(extractName).filter(Boolean)
      }
      default:
        return []
    }
  }

  async disconnect(): Promise<void> {
    if (this.connection) {
      await new Promise<void>((resolve) => {
        this.connection!.destroy((err) => {
          if (err) console.error('[snowflake] disconnect error:', err)
          resolve()
        })
      })
      this.connection = null
      this.connected = false
    }
  }

  async isConnected(): Promise<boolean> {
    return this.connected && this.connection !== null
  }

  async query(sql: string, params?: unknown[]): Promise<QueryResult> {
    if (!this.connection) throw new Error('Not connected')

    const start = performance.now()

    const { rows, columns } = await new Promise<{
      rows: Record<string, unknown>[]
      columns: snowflake.Column[]
    }>((resolve, reject) => {
      const stmt = this.connection!.execute({
        sqlText: sql,
        binds: params as snowflake.Binds | undefined,
        fetchAsString: ['Number'] as unknown as snowflake.DataType[],
        complete: (err, stmt, rows) => {
          this.activeStatement = null
          if (err) reject(err)
          else resolve({
            rows: (rows ?? []) as Record<string, unknown>[],
            columns: stmt.getColumns() ?? [],
          })
        },
      })
      this.activeStatement = stmt
    })

    const duration = Math.round(performance.now() - start)

    const fields: FieldInfo[] = columns.map((col) => ({
      name: col.getName(),
      dataType: col.getType(),
      nullable: col.isNullable(),
    }))

    return {
      rows,
      fields,
      rowCount: rows.length,
      duration,
      affectedRows: rows.length,
    }
  }

  private escapeIdentifier(name: string): string {
    return quoteIdentifier(name, SNOWFLAKE_QUOTE)
  }

  async cancelQuery(): Promise<void> {
    // Cancel only the statement the user is running. The previous
    // SYSTEM$CANCEL_ALL_QUERIES(CURRENT_SESSION()) killed every in-flight
    // statement on the session, so cancelling an editor query would also
    // abort concurrent background introspection queries.
    const stmt = this.activeStatement
    if (!stmt) return
    await new Promise<void>((resolve) => {
      stmt.cancel((err) => {
        if (err) console.error('[snowflake] cancel error:', err)
        resolve()
      })
    })
  }

  async getTables(schema?: string): Promise<SchemaTable[]> {
    if (!this.connection) throw new Error('Not connected')
    const s = schema ?? 'PUBLIC'
    const result = await this.query(
      `SELECT TABLE_NAME, TABLE_TYPE FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = ? ORDER BY TABLE_NAME`,
      [s]
    )
    return result.rows.map((r) => ({
      name: r.TABLE_NAME as string,
      schema: s,
      type: (r.TABLE_TYPE as string) === 'VIEW' ? 'view' as const : 'table' as const,
    }))
  }

  async getColumns(table: string, schema?: string): Promise<SchemaColumn[]> {
    if (!this.connection) throw new Error('Not connected')
    const s = schema ?? 'PUBLIC'
    const result = await this.query(
      `SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_DEFAULT
       FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
       ORDER BY ORDINAL_POSITION`,
      [s, table]
    )
    const pkResult = await this.query(
      `SHOW PRIMARY KEYS IN TABLE ${this.escapeIdentifier(s)}.${this.escapeIdentifier(table)}`
    )
    const pkCols = new Set(pkResult.rows.map((r) => r['"column_name"'] as string))

    const fkResult = await this.query(
      `SHOW IMPORTED KEYS IN TABLE ${this.escapeIdentifier(s)}.${this.escapeIdentifier(table)}`
    )
    const fkMap = new Map<string, { table: string; column: string }>()
    for (const r of fkResult.rows) {
      fkMap.set(
        r['"fk_column_name"'] as string,
        { table: r['"pk_table_name"'] as string, column: r['"pk_column_name"'] as string }
      )
    }

    return result.rows.map((r) => ({
      name: r.COLUMN_NAME as string,
      dataType: r.DATA_TYPE as string,
      nullable: (r.IS_NULLABLE as string) === 'YES',
      defaultValue: r.COLUMN_DEFAULT as string | null,
      isPrimaryKey: pkCols.has(r.COLUMN_NAME as string),
      isForeignKey: fkMap.has(r.COLUMN_NAME as string),
      references: fkMap.get(r.COLUMN_NAME as string),
    }))
  }

  async getIndexes(_table: string, _schema?: string): Promise<SchemaIndex[]> {
    // Snowflake uses micro-partitions instead of traditional indexes
    return []
  }

  async getRowCount(table: string, schema?: string): Promise<number> {
    if (!this.connection) throw new Error('Not connected')
    const s = schema ?? 'PUBLIC'
    const result = await this.query(`SELECT COUNT(*) AS CNT FROM ${this.escapeIdentifier(s)}.${this.escapeIdentifier(table)}`)
    return Number(result.rows[0]?.CNT ?? 0)
  }

  async getSchemas(): Promise<string[]> {
    if (!this.connection) throw new Error('Not connected')
    const result = await this.query(
      `SELECT SCHEMA_NAME FROM INFORMATION_SCHEMA.SCHEMATA
       WHERE SCHEMA_NAME NOT IN ('INFORMATION_SCHEMA')
       ORDER BY SCHEMA_NAME`
    )
    return result.rows.map((r) => r.SCHEMA_NAME as string)
  }

  async getDatabases(): Promise<string[]> {
    if (!this.connection) throw new Error('Not connected')
    const result = await this.query(`SHOW DATABASES`)
    return result.rows
      .map(extractSnowflakeName)
      .filter(Boolean)
  }

  async switchDatabase(database: string): Promise<void> {
    if (!this.connection) throw new Error('Not connected')
    await this.query(`USE DATABASE ${this.escapeIdentifier(database)}`)
  }

  async setSchema(schema: string): Promise<void> {
    if (!this.connection) throw new Error('Not connected')
    await this.query(`USE SCHEMA ${this.escapeIdentifier(schema)}`)
  }

  async switchWarehouse(warehouse: string): Promise<void> {
    if (!this.connection) throw new Error('Not connected')
    await this.query(`USE WAREHOUSE ${this.escapeIdentifier(warehouse)}`)
  }

  async switchRole(role: string): Promise<void> {
    if (!this.connection) throw new Error('Not connected')
    await this.query(`USE ROLE ${this.escapeIdentifier(role)}`)
  }
}
