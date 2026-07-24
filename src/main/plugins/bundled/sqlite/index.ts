import type { PluginManifest } from '../../types'
import type { PluginContext } from '../../sdk/types'
import { sqliteErrorRules } from './error-rules'
import type { CompletionItem, CompletionContext } from '@shared/plugin-ui-types'
import { SqliteAdapter } from './sqlite-adapter'
import { sqlExporter, sqlImporter } from './sql-format'
import { createRelationalGetTableData } from '../../sdk/relational-helpers'
import { quoteIdentifier } from '../../sdk/identifier'
import { formatSql, createSampleQuery } from '../../sdk/sql-format'
import {
  PG_TO_SQLITE, pgToSqliteFallback,
  MYSQL_TO_SQLITE, mysqlToSqliteFallback,
  sqliteToMysqlFallback
} from './type-maps'

const SQLITE_QUOTE = '"' as const
const SQLITE_PAGINATION = { style: 'limit-offset' } as const

export const manifest: PluginManifest = {
  name: 'verql-plugin-sqlite',
  version: '1.0.0',
  displayName: 'SQLite',
  description: 'SQLite database driver',
  main: 'index.js',
  contributes: {
    drivers: [{ id: 'sqlite', name: 'SQLite' }],
    exporters: [{ id: 'sql', name: 'SQL (SQLite)', extension: 'sql' }],
    importers: [{ id: 'sql', name: 'SQL (SQLite)', extensions: ['sql'] }],
    formatters: [{ id: 'sql', name: 'SQL (SQLite)' }]
  }
}

// ─── Static keyword/function lists ───────────────────────────────────────────

const SQL_KEYWORDS = [
  'SELECT', 'FROM', 'WHERE', 'JOIN', 'INNER JOIN', 'LEFT JOIN', 'RIGHT JOIN',
  'CROSS JOIN', 'ON', 'AND', 'OR', 'NOT', 'IN', 'EXISTS',
  'BETWEEN', 'LIKE', 'GLOB', 'REGEXP', 'IS NULL', 'IS NOT NULL',
  'ORDER BY', 'GROUP BY', 'HAVING', 'LIMIT', 'OFFSET', 'DISTINCT', 'AS',
  'UNION', 'UNION ALL', 'INTERSECT', 'EXCEPT',
  'INSERT INTO', 'VALUES', 'UPDATE', 'SET', 'DELETE FROM',
  'CREATE TABLE', 'ALTER TABLE', 'DROP TABLE', 'CREATE INDEX', 'DROP INDEX',
  'CREATE VIEW', 'DROP VIEW', 'TRUNCATE', 'BEGIN', 'COMMIT', 'ROLLBACK',
  'SAVEPOINT', 'RELEASE SAVEPOINT', 'ROLLBACK TO SAVEPOINT',
  'CASE', 'WHEN', 'THEN', 'ELSE', 'END', 'CAST', 'COALESCE', 'NULLIF',
  'WITH', 'ASC', 'DESC',
]

const SQLITE_KEYWORDS = [
  'AUTOINCREMENT', 'WITHOUT ROWID', 'STRICT', 'VIRTUAL', 'UNINDEXED',
  'ON CONFLICT', 'REPLACE', 'IGNORE', 'FAIL', 'ABORT', 'IF NOT EXISTS',
  'IF EXISTS', 'TEMP', 'TEMPORARY', 'ATTACH DATABASE', 'DETACH DATABASE',
  'PRAGMA', 'VACUUM', 'ANALYZE', 'EXPLAIN QUERY PLAN', 'INDEXED BY',
  'NOT INDEXED', 'ROWID', 'OID', '_ROWID_',
]

const SQLITE_DATA_TYPES = [
  'INTEGER', 'TEXT', 'REAL', 'BLOB', 'NUMERIC',
  // Affinity-mapped aliases commonly used
  'INT', 'TINYINT', 'SMALLINT', 'MEDIUMINT', 'BIGINT',
  'UNSIGNED BIG INT', 'CHARACTER', 'VARCHAR', 'NCHAR', 'NVARCHAR',
  'DOUBLE', 'FLOAT', 'DECIMAL', 'BOOLEAN', 'DATE', 'DATETIME',
]

const SQLITE_FUNCTIONS: { label: string; detail: string }[] = [
  { label: 'abs()', detail: 'Absolute value' },
  { label: 'changes()', detail: 'Number of rows changed by last statement' },
  { label: 'char()', detail: 'Build a string from Unicode code points' },
  { label: 'coalesce()', detail: 'Returns first non-null argument' },
  { label: 'datetime()', detail: 'Format a date/time string' },
  { label: 'date()', detail: 'Return date portion of a datetime' },
  { label: 'time()', detail: 'Return time portion of a datetime' },
  { label: 'strftime()', detail: 'Format a date/time value with a format string' },
  { label: 'julianday()', detail: 'Convert date to Julian day number' },
  { label: 'unixepoch()', detail: 'Convert date to Unix timestamp' },
  { label: 'glob()', detail: 'Match a string against a glob pattern' },
  { label: 'hex()', detail: 'Convert blob to hexadecimal string' },
  { label: 'ifnull()', detail: 'Returns alternate value if expression is null' },
  { label: 'iif()', detail: 'Inline if (condition, true_val, false_val)' },
  { label: 'instr()', detail: 'Find position of substring within string' },
  { label: 'last_insert_rowid()', detail: 'ROWID of last successful INSERT' },
  { label: 'length()', detail: 'Length of string or blob' },
  { label: 'like()', detail: 'Case-insensitive pattern matching' },
  { label: 'likelihood()', detail: 'Hint to query planner about expression probability' },
  { label: 'lower()', detail: 'Convert string to lower case' },
  { label: 'ltrim()', detail: 'Remove leading characters' },
  { label: 'rtrim()', detail: 'Remove trailing characters' },
  { label: 'trim()', detail: 'Remove leading and trailing characters' },
  { label: 'max()', detail: 'Maximum value (aggregate or scalar)' },
  { label: 'min()', detail: 'Minimum value (aggregate or scalar)' },
  { label: 'nullif()', detail: 'Returns null if two arguments are equal' },
  { label: 'printf()', detail: 'Format a string (alias: format())' },
  { label: 'quote()', detail: 'SQL-quote a value' },
  { label: 'random()', detail: 'Random signed 64-bit integer' },
  { label: 'randomblob()', detail: 'Random blob of N bytes' },
  { label: 'replace()', detail: 'Replace occurrences of a substring' },
  { label: 'round()', detail: 'Round numeric value' },
  { label: 'sign()', detail: 'Sign of a numeric value (-1, 0, or 1)' },
  { label: 'soundex()', detail: 'Soundex encoding of a string' },
  { label: 'sqlite_version()', detail: 'SQLite library version string' },
  { label: 'substr()', detail: 'Extract substring (alias: substring())' },
  { label: 'total_changes()', detail: 'Total row changes since database opened' },
  { label: 'typeof()', detail: 'Storage class type of an expression' },
  { label: 'unicode()', detail: 'Unicode code point of first character' },
  { label: 'upper()', detail: 'Convert string to upper case' },
  { label: 'zeroblob()', detail: 'Blob of N zero bytes' },
  // Aggregate functions
  { label: 'count()', detail: 'Count rows or non-null values' },
  { label: 'sum()', detail: 'Sum of values' },
  { label: 'avg()', detail: 'Average of values' },
  { label: 'total()', detail: 'Sum of values (returns 0.0 instead of null)' },
  { label: 'group_concat()', detail: 'Concatenate group values into a string' },
  // JSON functions
  { label: 'json()', detail: 'Parse and return well-formed JSON' },
  { label: 'json_extract()', detail: 'Extract value from JSON document' },
  { label: 'json_object()', detail: 'Build a JSON object' },
  { label: 'json_array()', detail: 'Build a JSON array' },
  { label: 'json_each()', detail: 'Table-valued function over JSON array/object' },
  { label: 'json_tree()', detail: 'Recursively walk a JSON value' },
  { label: 'json_type()', detail: 'Return the type of a JSON value' },
  { label: 'json_valid()', detail: 'Returns 1 if argument is valid JSON' },
]

// ─── activate ────────────────────────────────────────────────────────────────

export function activate(ctx: PluginContext): void {
  ctx.exporters.register('sql', sqlExporter)
  ctx.importers.register('sql', sqlImporter)
  ctx.formatters.register('sql', {
    language: 'sql',
    displayName: 'SQL (SQLite)',
    appliesToTypes: ['sqlite'],
    format: (sql) => formatSql(sql, 'sqlite')
  })
  ctx.typeMappers.register('postgresql', 'sqlite', PG_TO_SQLITE, pgToSqliteFallback)
  ctx.typeMappers.register('mysql', 'sqlite', MYSQL_TO_SQLITE, mysqlToSqliteFallback)
  ctx.typeMappers.register('sqlite', 'mysql', {}, sqliteToMysqlFallback)

  ctx.drivers.register('sqlite', {
    createAdapter: (config) => new SqliteAdapter(config),
    sqlDialect: 'sqlite',
    quoteChar: SQLITE_QUOTE,
    placeholderStyle: 'positional',
    editorLanguage: 'sql',
    statementSyntax: 'sql',
    presentation: { abbreviation: 'SL', tone: 'info' },
    nouns: {
      object: { one: 'table', many: 'tables' },
      field: { one: 'column', many: 'columns' },
      record: { one: 'row', many: 'rows' },
    },
    errorRules: sqliteErrorRules,
    defaultSchemaCandidates: ['main'],
    connectionFields: [
      { key: 'database', label: 'Database File', type: 'file-path', accept: '.db,.sqlite,.sqlite3,.db3', required: true },
    ],
    sampleQuery: createSampleQuery(SQLITE_QUOTE, { qualifySchema: (s) => s !== 'main' }),
    getTableData: createRelationalGetTableData(SQLITE_QUOTE, { pagination: SQLITE_PAGINATION }),
    pagination: SQLITE_PAGINATION,
    explain: { supportsAnalyze: false, format: 'text', statement: 'EXPLAIN QUERY PLAN' },
    generateMigrationDdl: async (tableName, columns) => {
      // SQLite quirk: the rowid alias is only created when the column is
      // declared exactly as `INTEGER PRIMARY KEY` (no NOT NULL needed —
      // it's implied). Anything else needs an explicit PRIMARY KEY clause
      // and loses the rowid optimisation. We special-case it here because
      // generic DDL builders would emit the original column type.
      const colDefs = columns.map(c => {
        if (c.isPrimaryKey) {
          return `  ${quoteIdentifier(c.name, SQLITE_QUOTE)} INTEGER PRIMARY KEY`
        }
        let def = `  ${quoteIdentifier(c.name, SQLITE_QUOTE)} ${c.dataType}`
        if (!c.nullable) def += ' NOT NULL'
        if (c.defaultValue) def += ` DEFAULT ${c.defaultValue}`
        return def
      })
      return `CREATE TABLE ${quoteIdentifier(tableName, SQLITE_QUOTE)} (\n${colDefs.join(',\n')}\n);\n`
    },
    session: {
      autoCommit: true,
      manualTransactions: true,
      transactionLabel: 'Transaction',
      rollbackKind: 'full',
    },
  })

  ctx.completions.register(async (connectionId: string, context: CompletionContext): Promise<CompletionItem[]> => {
    const items: CompletionItem[] = []

    // Static: keywords
    for (const kw of SQL_KEYWORDS) {
      items.push({ label: kw, kind: 'keyword', sortText: '3a' })
    }
    for (const kw of SQLITE_KEYWORDS) {
      items.push({ label: kw, kind: 'keyword', detail: 'SQLite', sortText: '3b' })
    }

    // Static: data types (surfaced as keywords)
    for (const dt of SQLITE_DATA_TYPES) {
      items.push({ label: dt, kind: 'keyword', detail: 'data type', sortText: '3c' })
    }

    // Static: functions
    for (const fn of SQLITE_FUNCTIONS) {
      items.push({ label: fn.label, kind: 'function', detail: fn.detail, sortText: '2' })
    }

    // Dynamic: tables
    let tables: { name: string }[] = []
    try {
      tables = await ctx.schema.getTables(connectionId, context.schema)
      for (const table of tables) {
        items.push({ label: table.name, kind: 'table', detail: 'table', sortText: '0' })
      }
    } catch {
      // partial results — tables unavailable
    }

    // Dynamic: columns from each table
    for (const table of tables) {
      try {
        const columns = await ctx.schema.getColumns(connectionId, table.name, context.schema)
        for (const col of columns) {
          items.push({
            label: col.name,
            kind: 'column',
            detail: `${table.name}.${col.name} (${col.dataType})`,
            sortText: '1',
          })
        }
      } catch {
        // partial results — columns for this table unavailable
      }
    }

    return items
  })
}
