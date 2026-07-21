// Generic SQL DDL/DML emission helpers for plugin authors.
//
// Everything here is parameterised on the driver's `quoteChar`; the SDK has
// no dialect map of its own. A driver builds its exporter on top of these
// helpers and supplies its own dialect-specific quoting / value formatting
// only when the defaults don't fit (e.g. dialect-specific BLOB literals).

import { format as prettyFormatSql, type SqlLanguage } from 'sql-formatter'
import type { SchemaColumn } from '@shared/types'
import { errorMessage } from '@shared/errors'
import { quoteIdentifier } from './identifier'
import { splitSqlStatements } from './sql-statements'
import type { RegisteredExporter } from './exporter-registry'
import type { RegisteredImporter } from './importer-registry'

/**
 * Pretty-print SQL for a given dialect. A shared helper so each SQL driver
 * plugin contributes a formatter in one line (passing its own dialect) instead
 * of duplicating the wiring. Returns the input unchanged if the source can't be
 * parsed, so formatting never destroys the user's buffer.
 *
 * `language` is the sql-formatter dialect id ('postgresql', 'mysql', 'sqlite',
 * 'snowflake', or the generic 'sql').
 */
export function formatSql(sql: string, language: SqlLanguage = 'sql'): string {
  try {
    return prettyFormatSql(sql, { language })
  } catch {
    return sql
  }
}

/**
 * Render a value as a SQL literal — quoted strings get their single quotes
 * doubled, numbers and booleans go in unquoted, objects are JSON-encoded
 * and then string-escaped. Drivers that need richer rendering (e.g.
 * Postgres bytea hex literals) should compose around or replace this
 * function in their own exporter.
 */
export function formatSqlValue(value: unknown): string {
  if (value === null || value === undefined) return 'NULL'
  if (typeof value === 'number') return String(value)
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE'
  if (typeof value === 'object') return `'${JSON.stringify(value).replace(/'/g, "''")}'`
  return `'${String(value).replace(/'/g, "''")}'`
}

/**
 * Emit a basic `CREATE TABLE` for the given columns. Columns marked
 * `isPrimaryKey` get `PRIMARY KEY`; non-nullable non-PK columns get
 * `NOT NULL`; columns with a default value carry it through. Anything
 * fancier (per-dialect type quirks, computed columns, etc.) is the
 * driver's responsibility — call this for the common case, override
 * for the rest.
 */
export function generateCreateTable(
  tableName: string,
  columns: SchemaColumn[],
  quoteChar: string,
): string {
  const colDefs = columns.map(c => {
    let def = `  ${quoteIdentifier(c.name, quoteChar)} ${c.dataType}`
    if (c.isPrimaryKey) def += ' PRIMARY KEY'
    if (!c.nullable && !c.isPrimaryKey) def += ' NOT NULL'
    if (c.defaultValue) def += ` DEFAULT ${c.defaultValue}`
    return def
  })
  return `CREATE TABLE ${quoteIdentifier(tableName, quoteChar)} (\n${colDefs.join(',\n')}\n);\n`
}

/**
 * Emit a sequence of single-row INSERT statements. Empty `rows`
 * produces a `-- No data` marker so the resulting SQL file makes
 * the situation explicit instead of dropping the table silently.
 */
export function generateInsertStatements(
  tableName: string,
  columns: SchemaColumn[],
  rows: Record<string, unknown>[],
  quoteChar: string,
): string {
  if (rows.length === 0) return `-- No data in ${tableName}\n`
  const colNames = columns.map(c => quoteIdentifier(c.name, quoteChar)).join(', ')
  const qTable = quoteIdentifier(tableName, quoteChar)
  const lines = rows.map(row => {
    const values = columns.map(c => formatSqlValue(row[c.name])).join(', ')
    return `INSERT INTO ${qTable} (${colNames}) VALUES (${values});`
  })
  return lines.join('\n') + '\n'
}

/**
 * Build a `sql`-format exporter for a SQL dialect. Every SQL driver's exporter
 * is the same `generateCreateTable` + `generateInsertStatements` composition;
 * only the quote char and the descriptor labels differ, so drivers call this
 * instead of re-implementing the row loop.
 */
export function createSqlExporter(config: {
  quoteChar: string
  displayName: string
  appliesToTypes: string[]
}): RegisteredExporter {
  return {
    format: 'sql',
    extension: 'sql',
    displayName: config.displayName,
    appliesToTypes: config.appliesToTypes,
    supportsSchema: true,
    execute(rows, columns, options) {
      const schema = options.includeSchema
        ? generateCreateTable(options.tableName, columns, config.quoteChar) + '\n'
        : ''
      return schema + generateInsertStatements(options.tableName, columns, rows, config.quoteChar)
    },
  }
}

/**
 * Build the default `generateMigrationDdl` for a relational driver — a
 * `generateCreateTable` that drops FK metadata (a fresh table's columns carry
 * no cross-table references). Identical across Postgres/MySQL/Snowflake; drivers
 * with dialect quirks (e.g. SQLite's `INTEGER PRIMARY KEY` rowid alias) keep a
 * custom implementation instead.
 */
export function createMigrationDdl(
  quoteChar: string,
): (tableName: string, columns: SchemaColumn[]) => Promise<string> {
  return async (tableName, columns) =>
    generateCreateTable(
      tableName,
      columns.map(c => ({ ...c, isForeignKey: false, references: undefined })),
      quoteChar,
    )
}

/**
 * Build a `sampleQuery` that emits `SELECT * FROM <qualified> LIMIT <n>`. The
 * schema is included in the qualified name when present and `qualifySchema`
 * accepts it (SQLite passes `(s) => s !== 'main'` to skip its implicit schema).
 */
export function createSampleQuery(
  quoteChar: string,
  options?: { limit?: number; qualifySchema?: (schema: string) => boolean },
): (table: string, schema?: string) => Promise<string> {
  const limit = options?.limit ?? 100
  const qualifySchema = options?.qualifySchema ?? (() => true)
  return async (table, schema) => {
    const qualified =
      schema && qualifySchema(schema)
        ? quoteIdentifier([schema, table], quoteChar)
        : quoteIdentifier(table, quoteChar)
    return `SELECT * FROM ${qualified} LIMIT ${limit};`
  }
}

/**
 * Build a `sql`-format importer that runs each statement through the active
 * adapter. Identical across every SQL dialect (split → execute → collect
 * per-statement errors), so drivers supply only the descriptor labels.
 */
export function createSqlImporter(config: {
  displayName: string
  appliesToTypes: string[]
}): RegisteredImporter {
  return {
    format: 'sql',
    extensions: ['sql'],
    displayName: config.displayName,
    appliesToTypes: config.appliesToTypes,
    driverExecutes: true,
    async parse(content, options) {
      const text = typeof content === 'string' ? content : content.toString('utf-8')
      const statements = splitSqlStatements(text)
      const adapter = options.adapter
      if (!adapter) throw new Error('SQL importer requires an active adapter')
      let executed = 0
      const errors: string[] = []
      for (let i = 0; i < statements.length; i++) {
        try {
          await adapter.query(statements[i])
          executed++
        } catch (err) {
          errors.push(`Statement ${i + 1}: ${errorMessage(err)}`)
        }
      }
      return { rows: [], executed, errors }
    },
  }
}
