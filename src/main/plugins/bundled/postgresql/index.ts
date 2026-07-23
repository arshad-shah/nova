import type { PluginManifest } from '../../types'
import type { PluginContext } from '../../sdk/types'
import { postgresErrorRules } from './error-rules'
import type { CompletionItem } from '@shared/plugin-ui-types'
import { createSchemaCompletionProvider } from '../../sdk/completion-helpers'
import { PostgresAdapter } from './postgres-adapter'
import { sqlExporter, sqlImporter } from './sql-format'
import { createRelationalGetTableData } from '../../sdk/relational-helpers'
import { formatSql, createSampleQuery, createMigrationDdl } from '../../sdk/sql-format'
import { MYSQL_TO_PG, mysqlToPgFallback, sqliteToPgFallback } from './type-maps'

const PG_QUOTE = '"' as const

export const manifest: PluginManifest = {
  name: 'verql-plugin-postgresql',
  version: '1.0.0',
  displayName: 'PostgreSQL',
  description: 'PostgreSQL database driver',
  main: 'index.js',
  contributes: {
    drivers: [{ id: 'postgresql', name: 'PostgreSQL' }],
    exporters: [{ id: 'sql', name: 'SQL (PostgreSQL)', extension: 'sql' }],
    importers: [{ id: 'sql', name: 'SQL (PostgreSQL)', extensions: ['sql'] }],
    formatters: [{ id: 'sql', name: 'SQL (PostgreSQL)' }]
  }
}

// ─── Static keyword/function lists ───────────────────────────────────────────

const SQL_KEYWORDS = [
  'SELECT', 'FROM', 'WHERE', 'JOIN', 'INNER JOIN', 'LEFT JOIN', 'RIGHT JOIN',
  'FULL JOIN', 'CROSS JOIN', 'ON', 'AND', 'OR', 'NOT', 'IN', 'EXISTS',
  'BETWEEN', 'LIKE', 'IS NULL', 'IS NOT NULL', 'ORDER BY', 'GROUP BY',
  'HAVING', 'LIMIT', 'OFFSET', 'DISTINCT', 'AS', 'UNION', 'UNION ALL',
  'INTERSECT', 'EXCEPT', 'INSERT INTO', 'VALUES', 'UPDATE', 'SET',
  'DELETE FROM', 'CREATE TABLE', 'ALTER TABLE', 'DROP TABLE', 'CREATE INDEX',
  'DROP INDEX', 'CREATE VIEW', 'DROP VIEW', 'TRUNCATE', 'BEGIN', 'COMMIT',
  'ROLLBACK', 'CASE', 'WHEN', 'THEN', 'ELSE', 'END', 'CAST', 'COALESCE',
  'NULLIF', 'WITH', 'ASC', 'DESC', 'NULLS FIRST', 'NULLS LAST',
]

const PG_KEYWORDS = [
  'RETURNING', 'ILIKE', 'LATERAL', 'MATERIALIZED', 'REFRESH', 'CONCURRENTLY',
  'ON CONFLICT', 'DO NOTHING', 'DO UPDATE', 'EXCLUDED', 'GENERATED',
  'ALWAYS', 'BY DEFAULT', 'IDENTITY', 'INHERITS', 'PARTITION BY',
  'RANGE', 'LIST', 'HASH', 'ATTACH PARTITION', 'DETACH PARTITION',
  'EXPLAIN', 'ANALYZE', 'VERBOSE', 'BUFFERS', 'VACUUM', 'REINDEX',
  'LISTEN', 'NOTIFY', 'COPY', 'TABLESAMPLE', 'FILTER', 'WITHIN GROUP',
  'OVER', 'WINDOW', 'ROWS BETWEEN', 'UNBOUNDED PRECEDING', 'CURRENT ROW',
  'UNBOUNDED FOLLOWING',
]

const PG_DATA_TYPES = [
  'INTEGER', 'BIGINT', 'SMALLINT', 'SERIAL', 'BIGSERIAL', 'NUMERIC',
  'DECIMAL', 'REAL', 'DOUBLE PRECISION', 'BOOLEAN', 'TEXT', 'VARCHAR',
  'CHAR', 'BYTEA', 'TIMESTAMP', 'TIMESTAMPTZ', 'DATE', 'TIME', 'TIMETZ',
  'INTERVAL', 'JSON', 'JSONB', 'UUID', 'ARRAY', 'HSTORE', 'CIDR', 'INET',
  'MACADDR', 'POINT', 'LINE', 'POLYGON', 'OID',
]

const PG_FUNCTIONS: { label: string; detail: string }[] = [
  { label: 'NOW()', detail: 'Returns current date and time (timestamptz)' },
  { label: 'CURRENT_TIMESTAMP', detail: 'Current date and time (timestamptz)' },
  { label: 'CURRENT_DATE', detail: 'Current date' },
  { label: 'CURRENT_TIME', detail: 'Current time with time zone' },
  { label: 'COALESCE()', detail: 'Returns first non-null argument' },
  { label: 'NULLIF()', detail: 'Returns null if two arguments are equal' },
  { label: 'GREATEST()', detail: 'Returns largest value from a list' },
  { label: 'LEAST()', detail: 'Returns smallest value from a list' },
  { label: 'ARRAY_AGG()', detail: 'Aggregate values into an array' },
  { label: 'STRING_AGG()', detail: 'Concatenate values into a string' },
  { label: 'COUNT()', detail: 'Count rows or non-null values' },
  { label: 'SUM()', detail: 'Sum of values' },
  { label: 'AVG()', detail: 'Average of values' },
  { label: 'MIN()', detail: 'Minimum value' },
  { label: 'MAX()', detail: 'Maximum value' },
  { label: 'JSONB_BUILD_OBJECT()', detail: 'Build a JSONB object from key/value pairs' },
  { label: 'JSONB_AGG()', detail: 'Aggregate values into a JSONB array' },
  { label: 'JSON_BUILD_OBJECT()', detail: 'Build a JSON object from key/value pairs' },
  { label: 'TO_CHAR()', detail: 'Convert value to formatted string' },
  { label: 'TO_DATE()', detail: 'Convert string to date' },
  { label: 'TO_TIMESTAMP()', detail: 'Convert string/number to timestamp' },
  { label: 'DATE_TRUNC()', detail: 'Truncate timestamp to specified precision' },
  { label: 'DATE_PART()', detail: 'Extract subfield from date/time value' },
  { label: 'EXTRACT()', detail: 'Extract subfield from date/time value' },
  { label: 'AGE()', detail: 'Compute the interval between two timestamps' },
  { label: 'CONCAT()', detail: 'Concatenate strings' },
  { label: 'CONCAT_WS()', detail: 'Concatenate strings with separator' },
  { label: 'LOWER()', detail: 'Convert string to lower case' },
  { label: 'UPPER()', detail: 'Convert string to upper case' },
  { label: 'TRIM()', detail: 'Remove leading and trailing spaces' },
  { label: 'LENGTH()', detail: 'Length of string' },
  { label: 'SUBSTRING()', detail: 'Extract substring' },
  { label: 'REPLACE()', detail: 'Replace occurrences of a substring' },
  { label: 'REGEXP_REPLACE()', detail: 'Replace substrings matching a POSIX regex' },
  { label: 'SPLIT_PART()', detail: 'Split string and return nth field' },
  { label: 'ARRAY_LENGTH()', detail: 'Return length of an array dimension' },
  { label: 'UNNEST()', detail: 'Expand an array to a set of rows' },
  { label: 'GENERATE_SERIES()', detail: 'Generate a series of values' },
  { label: 'ROW_NUMBER()', detail: 'Row number within window partition' },
  { label: 'RANK()', detail: 'Rank within window partition, with gaps' },
  { label: 'DENSE_RANK()', detail: 'Rank within window partition, without gaps' },
  { label: 'LAG()', detail: 'Access prior row in window partition' },
  { label: 'LEAD()', detail: 'Access subsequent row in window partition' },
]

// ─── activate ────────────────────────────────────────────────────────────────

export function activate(ctx: PluginContext): void {
  ctx.exporters.register('sql', sqlExporter)
  ctx.importers.register('sql', sqlImporter)
  ctx.formatters.register('sql', {
    language: 'sql',
    displayName: 'SQL (PostgreSQL)',
    appliesToTypes: ['postgresql'],
    format: (sql) => formatSql(sql, 'postgresql')
  })
  ctx.typeMappers.register('mysql', 'postgresql', MYSQL_TO_PG, mysqlToPgFallback)
  ctx.typeMappers.register('sqlite', 'postgresql', {}, sqliteToPgFallback)

  ctx.drivers.register('postgresql', {
    createAdapter: (config) => new PostgresAdapter(config),
    sqlDialect: 'postgresql',
    quoteChar: PG_QUOTE,
    placeholderStyle: 'numbered',
    editorLanguage: 'sql',
    statementSyntax: 'sql',
    supportsDollarQuoting: true,
    presentation: { abbreviation: 'PG', tone: 'accent' },
    nouns: {
      object: { one: 'table', many: 'tables' },
      field: { one: 'column', many: 'columns' },
      record: { one: 'row', many: 'rows' },
    },
    errorRules: postgresErrorRules,
    defaultSchemaCandidates: ['public'],
    connectionFields: [
      { key: 'host', label: 'Host', type: 'text', required: true, default: 'localhost' },
      { key: 'port', label: 'Port', type: 'number', required: true, default: 5432 },
      { key: 'database', label: 'Database', type: 'text', required: true },
      { key: 'username', label: 'Username', type: 'text' },
      { key: 'password', label: 'Password', type: 'password' },
      { key: 'ssl', label: 'SSL', type: 'boolean', default: false },
      { key: 'sslMode', label: 'SSL Mode', type: 'select', default: 'verify-full', options: [
        { value: 'verify-full', label: 'Verify (recommended)' },
        { value: 'no-verify', label: 'Skip verification (insecure)' },
      ]},
    ],
    sampleQuery: createSampleQuery(PG_QUOTE),
    getTableData: createRelationalGetTableData(PG_QUOTE),
    explain: { supportsAnalyze: true, format: 'tree', statement: 'EXPLAIN ANALYZE' },
    generateMigrationDdl: createMigrationDdl(PG_QUOTE),
    session: {
      autoCommit: true,
      manualTransactions: true,
      isolationLevels: ['READ COMMITTED', 'REPEATABLE READ', 'SERIALIZABLE'],
      readOnly: true,
      transactionLabel: 'Transaction',
      rollbackKind: 'full',
    },
    databaseSwitch: { supported: true },
  })

  // The dynamic table/column half is shared; only these static items differ.
  ctx.completions.register(createSchemaCompletionProvider(ctx.schema, () => {
    const items: CompletionItem[] = []
    for (const kw of SQL_KEYWORDS) {
      items.push({ label: kw, kind: 'keyword', sortText: '3a' })
    }
    for (const kw of PG_KEYWORDS) {
      items.push({ label: kw, kind: 'keyword', detail: 'PostgreSQL', sortText: '3b' })
    }
    for (const dt of PG_DATA_TYPES) {
      items.push({ label: dt, kind: 'keyword', detail: 'data type', sortText: '3c' })
    }
    for (const fn of PG_FUNCTIONS) {
      items.push({ label: fn.label, kind: 'function', detail: fn.detail, sortText: '2' })
    }
    return items
  }))
}
