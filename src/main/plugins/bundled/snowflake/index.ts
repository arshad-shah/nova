import type { PluginContext } from '../../sdk/types'
import type { PluginManifest } from '../../types'
import type { CompletionItem } from '@shared/plugin-ui-types'
import { SnowflakeAdapter } from './snowflake-adapter'
import { sqlExporter, sqlImporter } from './sql-format'
import { createRelationalGetTableData } from '../../sdk/relational-helpers'
import { formatSql, createSampleQuery, createMigrationDdl } from '../../sdk/sql-format'
import { extractSnowflakeName } from './naming'

const SNOWFLAKE_QUOTE = '"' as const

export const manifest: PluginManifest = {
  name: 'verql-plugin-snowflake',
  version: '1.0.0',
  displayName: 'Snowflake',
  description: 'Snowflake data warehouse driver',
  main: 'index.js',
  contributes: {
    drivers: [{ id: 'snowflake', name: 'Snowflake' }],
    exporters: [{ id: 'sql', name: 'SQL (Snowflake)', extension: 'sql' }],
    importers: [{ id: 'sql', name: 'SQL (Snowflake)', extensions: ['sql'] }],
    formatters: [{ id: 'sql', name: 'SQL (Snowflake)' }],
    toolbar: [
      { id: 'snowflake-context', zone: 'right' }
    ],
    settings: [
      {
        key: 'queryTimeoutSec',
        title: 'Query timeout (seconds)',
        type: 'number',
        default: 120,
        min: 5,
        max: 3600,
        step: 5,
        description: 'STATEMENT_TIMEOUT_IN_SECONDS applied to queries from Verql.'
      },
      {
        key: 'defaultRole',
        title: 'Default role',
        type: 'text',
        description: 'Role assumed when a connection profile leaves it blank.'
      },
      {
        key: 'defaultWarehouse',
        title: 'Default warehouse',
        type: 'text',
        description: 'Warehouse used when a connection profile leaves it blank.'
      }
    ]
  }
}

// ─── Static completion data ──────────────────────────────────────────────────

const SQL_KEYWORDS: CompletionItem[] = [
  'SELECT', 'FROM', 'WHERE', 'JOIN', 'LEFT JOIN', 'RIGHT JOIN', 'INNER JOIN', 'FULL OUTER JOIN',
  'CROSS JOIN', 'ON', 'GROUP BY', 'ORDER BY', 'HAVING', 'LIMIT', 'OFFSET', 'UNION', 'UNION ALL',
  'INTERSECT', 'EXCEPT', 'INSERT INTO', 'VALUES', 'UPDATE', 'SET', 'DELETE FROM', 'CREATE TABLE',
  'CREATE VIEW', 'CREATE OR REPLACE VIEW', 'DROP TABLE', 'DROP VIEW', 'ALTER TABLE', 'ADD COLUMN',
  'RENAME COLUMN', 'TRUNCATE TABLE', 'WITH', 'AS', 'DISTINCT', 'ALL', 'EXISTS', 'IN', 'NOT IN',
  'BETWEEN', 'LIKE', 'ILIKE', 'IS NULL', 'IS NOT NULL', 'AND', 'OR', 'NOT', 'CASE', 'WHEN',
  'THEN', 'ELSE', 'END', 'CAST', 'COALESCE', 'NULLIF', 'ASC', 'DESC', 'NULLS FIRST', 'NULLS LAST',
].map((kw) => ({ label: kw, kind: 'keyword' as const, sortText: `0_kw_${kw}` }))

const SNOWFLAKE_KEYWORDS: CompletionItem[] = [
  { label: 'QUALIFY',          kind: 'keyword', detail: 'Snowflake: filter window function results',                  sortText: '1_sf_QUALIFY' },
  { label: 'PIVOT',            kind: 'keyword', detail: 'Snowflake: rotate rows to columns',                          sortText: '1_sf_PIVOT' },
  { label: 'UNPIVOT',          kind: 'keyword', detail: 'Snowflake: rotate columns to rows',                          sortText: '1_sf_UNPIVOT' },
  { label: 'SAMPLE',           kind: 'keyword', detail: 'Snowflake: return a random sample of rows',                  sortText: '1_sf_SAMPLE' },
  { label: 'MATCH_RECOGNIZE',  kind: 'keyword', detail: 'Snowflake: pattern matching over sequences of rows',         sortText: '1_sf_MATCH_RECOGNIZE' },
  { label: 'CONNECT BY',       kind: 'keyword', detail: 'Snowflake: hierarchical query clause',                       sortText: '1_sf_CONNECT_BY' },
  { label: 'FLATTEN',          kind: 'keyword', detail: 'Snowflake: table function to flatten semi-structured data',  sortText: '1_sf_FLATTEN' },
  { label: 'LATERAL',          kind: 'keyword', detail: 'Snowflake: lateral join to inline view',                     sortText: '1_sf_LATERAL' },
  { label: 'CHANGES',          kind: 'keyword', detail: 'Snowflake: query change tracking metadata',                  sortText: '1_sf_CHANGES' },
  { label: 'AT',               kind: 'keyword', detail: 'Snowflake: Time Travel — query data at a point in time',     sortText: '1_sf_AT' },
  { label: 'BEFORE',           kind: 'keyword', detail: 'Snowflake: Time Travel — query data before an event',        sortText: '1_sf_BEFORE' },
  { label: 'CLUSTER BY',       kind: 'keyword', detail: 'Snowflake: define clustering key for a table',               sortText: '1_sf_CLUSTER_BY' },
  { label: 'COPY INTO',        kind: 'keyword', detail: 'Snowflake: bulk load data from stage or file',               sortText: '1_sf_COPY_INTO' },
  { label: 'CREATE STAGE',     kind: 'keyword', detail: 'Snowflake: create a named internal or external stage',       sortText: '1_sf_CREATE_STAGE' },
  { label: 'CREATE STREAM',    kind: 'keyword', detail: 'Snowflake: create a change data capture stream',             sortText: '1_sf_CREATE_STREAM' },
  { label: 'CREATE TASK',      kind: 'keyword', detail: 'Snowflake: create a scheduled task',                         sortText: '1_sf_CREATE_TASK' },
  { label: 'SHOW',             kind: 'keyword', detail: 'Snowflake: list objects (SHOW TABLES, SHOW WAREHOUSES, …)',  sortText: '1_sf_SHOW' },
  { label: 'USE WAREHOUSE',    kind: 'keyword', detail: 'Snowflake: switch active warehouse',                         sortText: '1_sf_USE_WAREHOUSE' },
  { label: 'USE ROLE',         kind: 'keyword', detail: 'Snowflake: switch active role',                              sortText: '1_sf_USE_ROLE' },
  { label: 'USE DATABASE',     kind: 'keyword', detail: 'Snowflake: switch active database',                          sortText: '1_sf_USE_DATABASE' },
  { label: 'USE SCHEMA',       kind: 'keyword', detail: 'Snowflake: switch active schema',                            sortText: '1_sf_USE_SCHEMA' },
]

const SNOWFLAKE_FUNCTIONS: CompletionItem[] = [
  { label: 'FLATTEN',                kind: 'function', detail: 'Table function: expand semi-structured data',                      sortText: '2_fn_FLATTEN' },
  { label: 'PARSE_JSON',             kind: 'function', detail: 'Parse a string as JSON, returning a VARIANT',                      sortText: '2_fn_PARSE_JSON' },
  { label: 'TRY_PARSE_JSON',         kind: 'function', detail: 'Parse a string as JSON, returning NULL on failure',                sortText: '2_fn_TRY_PARSE_JSON' },
  { label: 'OBJECT_CONSTRUCT',       kind: 'function', detail: 'Build a VARIANT OBJECT from key-value pairs',                      sortText: '2_fn_OBJECT_CONSTRUCT' },
  { label: 'ARRAY_CONSTRUCT',        kind: 'function', detail: 'Build a VARIANT ARRAY from values',                                sortText: '2_fn_ARRAY_CONSTRUCT' },
  { label: 'ARRAY_AGG',              kind: 'function', detail: 'Aggregate values into an array',                                   sortText: '2_fn_ARRAY_AGG' },
  { label: 'OBJECT_KEYS',            kind: 'function', detail: 'Return array of keys from an OBJECT',                              sortText: '2_fn_OBJECT_KEYS' },
  { label: 'GET_PATH',               kind: 'function', detail: 'Extract a value from a semi-structured object by path',            sortText: '2_fn_GET_PATH' },
  { label: 'IFF',                    kind: 'function', detail: 'Single-condition IF expression',                                   sortText: '2_fn_IFF' },
  { label: 'IFNULL',                 kind: 'function', detail: 'Return second arg if first is NULL',                               sortText: '2_fn_IFNULL' },
  { label: 'NVL',                    kind: 'function', detail: 'Return second arg if first is NULL (alias for IFNULL)',            sortText: '2_fn_NVL' },
  { label: 'NVL2',                   kind: 'function', detail: 'Return second arg if first is not NULL, else third',               sortText: '2_fn_NVL2' },
  { label: 'ZEROIFNULL',             kind: 'function', detail: 'Return 0 if expression is NULL',                                   sortText: '2_fn_ZEROIFNULL' },
  { label: 'TO_VARIANT',             kind: 'function', detail: 'Cast a value to VARIANT',                                          sortText: '2_fn_TO_VARIANT' },
  { label: 'TO_TIMESTAMP_NTZ',       kind: 'function', detail: 'Convert to TIMESTAMP_NTZ (no timezone)',                           sortText: '2_fn_TO_TIMESTAMP_NTZ' },
  { label: 'TO_DATE',                kind: 'function', detail: 'Convert to DATE',                                                  sortText: '2_fn_TO_DATE' },
  { label: 'TO_NUMBER',              kind: 'function', detail: 'Convert to NUMBER',                                                sortText: '2_fn_TO_NUMBER' },
  { label: 'TO_VARCHAR',             kind: 'function', detail: 'Convert to VARCHAR',                                               sortText: '2_fn_TO_VARCHAR' },
  { label: 'DATEADD',                kind: 'function', detail: 'Add an interval to a date/timestamp',                              sortText: '2_fn_DATEADD' },
  { label: 'DATEDIFF',               kind: 'function', detail: 'Difference between two dates in the specified part',               sortText: '2_fn_DATEDIFF' },
  { label: 'DATE_TRUNC',             kind: 'function', detail: 'Truncate a date/timestamp to a specified part',                    sortText: '2_fn_DATE_TRUNC' },
  { label: 'CURRENT_TIMESTAMP',      kind: 'function', detail: 'Current date and time',                                            sortText: '2_fn_CURRENT_TIMESTAMP' },
  { label: 'CURRENT_DATE',           kind: 'function', detail: 'Current date',                                                     sortText: '2_fn_CURRENT_DATE' },
  { label: 'CURRENT_WAREHOUSE',      kind: 'function', detail: 'Returns the name of the active warehouse',                         sortText: '2_fn_CURRENT_WAREHOUSE' },
  { label: 'CURRENT_ROLE',           kind: 'function', detail: 'Returns the name of the active role',                              sortText: '2_fn_CURRENT_ROLE' },
  { label: 'CURRENT_DATABASE',       kind: 'function', detail: 'Returns the name of the active database',                          sortText: '2_fn_CURRENT_DATABASE' },
  { label: 'CURRENT_SCHEMA',         kind: 'function', detail: 'Returns the name of the active schema',                            sortText: '2_fn_CURRENT_SCHEMA' },
  { label: 'CURRENT_USER',           kind: 'function', detail: 'Returns the name of the current user',                             sortText: '2_fn_CURRENT_USER' },
  { label: 'SYSTEM$TYPEOF',          kind: 'function', detail: 'Return the Snowflake data type of an expression',                  sortText: '2_fn_SYSTEM_TYPEOF' },
  { label: 'HASH_AGG',               kind: 'function', detail: 'Aggregate hash of unordered set of rows',                          sortText: '2_fn_HASH_AGG' },
  { label: 'HASH',                   kind: 'function', detail: 'Return a hash value for expressions',                              sortText: '2_fn_HASH' },
  { label: 'LISTAGG',                kind: 'function', detail: 'Aggregate string values with separator',                           sortText: '2_fn_LISTAGG' },
  { label: 'MEDIAN',                 kind: 'function', detail: 'Compute the median of a set of values',                            sortText: '2_fn_MEDIAN' },
  { label: 'APPROX_COUNT_DISTINCT',  kind: 'function', detail: 'Approximate count of distinct values (HyperLogLog)',               sortText: '2_fn_APPROX_COUNT_DISTINCT' },
  { label: 'APPROX_PERCENTILE',      kind: 'function', detail: 'Approximate percentile value',                                     sortText: '2_fn_APPROX_PERCENTILE' },
  { label: 'REGEXP_LIKE',            kind: 'function', detail: 'Test if string matches a regular expression',                      sortText: '2_fn_REGEXP_LIKE' },
  { label: 'REGEXP_REPLACE',         kind: 'function', detail: 'Replace substrings that match a regex',                            sortText: '2_fn_REGEXP_REPLACE' },
  { label: 'SPLIT',                  kind: 'function', detail: 'Split string on delimiter into an array',                          sortText: '2_fn_SPLIT' },
  { label: 'SPLIT_PART',             kind: 'function', detail: 'Split string and return the nth part',                             sortText: '2_fn_SPLIT_PART' },
  { label: 'TRIM',                   kind: 'function', detail: 'Remove leading and trailing characters',                           sortText: '2_fn_TRIM' },
  { label: 'UPPER',                  kind: 'function', detail: 'Convert string to upper case',                                     sortText: '2_fn_UPPER' },
  { label: 'LOWER',                  kind: 'function', detail: 'Convert string to lower case',                                     sortText: '2_fn_LOWER' },
  { label: 'CONCAT',                 kind: 'function', detail: 'Concatenate strings',                                              sortText: '2_fn_CONCAT' },
  { label: 'LENGTH',                 kind: 'function', detail: 'Return the number of characters in a string',                      sortText: '2_fn_LENGTH' },
  { label: 'SUBSTR',                 kind: 'function', detail: 'Return a substring',                                               sortText: '2_fn_SUBSTR' },
  { label: 'ROUND',                  kind: 'function', detail: 'Round a numeric value',                                            sortText: '2_fn_ROUND' },
  { label: 'CEIL',                   kind: 'function', detail: 'Round up to the nearest integer',                                  sortText: '2_fn_CEIL' },
  { label: 'FLOOR',                  kind: 'function', detail: 'Round down to the nearest integer',                                sortText: '2_fn_FLOOR' },
  { label: 'ABS',                    kind: 'function', detail: 'Absolute value',                                                   sortText: '2_fn_ABS' },
  { label: 'MOD',                    kind: 'function', detail: 'Modulo',                                                           sortText: '2_fn_MOD' },
  { label: 'ROW_NUMBER',             kind: 'function', detail: 'Window function: sequential row number',                           sortText: '2_fn_ROW_NUMBER' },
  { label: 'RANK',                   kind: 'function', detail: 'Window function: rank with gaps',                                  sortText: '2_fn_RANK' },
  { label: 'DENSE_RANK',             kind: 'function', detail: 'Window function: rank without gaps',                               sortText: '2_fn_DENSE_RANK' },
  { label: 'LAG',                    kind: 'function', detail: 'Window function: access a previous row value',                     sortText: '2_fn_LAG' },
  { label: 'LEAD',                   kind: 'function', detail: 'Window function: access a following row value',                    sortText: '2_fn_LEAD' },
  { label: 'FIRST_VALUE',            kind: 'function', detail: 'Window function: first value in a window frame',                   sortText: '2_fn_FIRST_VALUE' },
  { label: 'LAST_VALUE',             kind: 'function', detail: 'Window function: last value in a window frame',                    sortText: '2_fn_LAST_VALUE' },
  { label: 'COUNT',                  kind: 'function', detail: 'Count rows or non-NULL values',                                    sortText: '2_fn_COUNT' },
  { label: 'SUM',                    kind: 'function', detail: 'Sum of values',                                                    sortText: '2_fn_SUM' },
  { label: 'AVG',                    kind: 'function', detail: 'Average of values',                                                sortText: '2_fn_AVG' },
  { label: 'MIN',                    kind: 'function', detail: 'Minimum value',                                                    sortText: '2_fn_MIN' },
  { label: 'MAX',                    kind: 'function', detail: 'Maximum value',                                                    sortText: '2_fn_MAX' },
]

const SNOWFLAKE_TYPES: CompletionItem[] = [
  { label: 'VARIANT',        kind: 'field', detail: 'Snowflake semi-structured type — stores any JSON/XML/Parquet value', sortText: '3_tp_VARIANT' },
  { label: 'OBJECT',         kind: 'field', detail: 'Snowflake semi-structured OBJECT type',                              sortText: '3_tp_OBJECT' },
  { label: 'ARRAY',          kind: 'field', detail: 'Snowflake semi-structured ARRAY type',                               sortText: '3_tp_ARRAY' },
  { label: 'NUMBER',         kind: 'field', detail: 'Fixed-point number',                                                 sortText: '3_tp_NUMBER' },
  { label: 'FLOAT',          kind: 'field', detail: 'Double-precision floating-point number',                             sortText: '3_tp_FLOAT' },
  { label: 'VARCHAR',        kind: 'field', detail: 'Variable-length string up to 16 MB',                                 sortText: '3_tp_VARCHAR' },
  { label: 'BOOLEAN',        kind: 'field', detail: 'TRUE or FALSE',                                                     sortText: '3_tp_BOOLEAN' },
  { label: 'DATE',           kind: 'field', detail: 'Calendar date (YYYY-MM-DD)',                                         sortText: '3_tp_DATE' },
  { label: 'TIME',           kind: 'field', detail: 'Time of day (HH:MM:SS)',                                             sortText: '3_tp_TIME' },
  { label: 'TIMESTAMP_NTZ',  kind: 'field', detail: 'Timestamp with no timezone',                                        sortText: '3_tp_TIMESTAMP_NTZ' },
  { label: 'TIMESTAMP_LTZ',  kind: 'field', detail: 'Timestamp with local timezone',                                     sortText: '3_tp_TIMESTAMP_LTZ' },
  { label: 'TIMESTAMP_TZ',   kind: 'field', detail: 'Timestamp with timezone offset stored',                             sortText: '3_tp_TIMESTAMP_TZ' },
  { label: 'BINARY',         kind: 'field', detail: 'Variable-length binary data',                                       sortText: '3_tp_BINARY' },
  { label: 'INTEGER',        kind: 'field', detail: 'Alias for NUMBER(38,0)',                                             sortText: '3_tp_INTEGER' },
  { label: 'BIGINT',         kind: 'field', detail: 'Alias for NUMBER(38,0)',                                             sortText: '3_tp_BIGINT' },
  { label: 'TEXT',           kind: 'field', detail: 'Alias for VARCHAR',                                                  sortText: '3_tp_TEXT' },
]

const STATIC_COMPLETIONS: CompletionItem[] = [
  ...SQL_KEYWORDS,
  ...SNOWFLAKE_KEYWORDS,
  ...SNOWFLAKE_FUNCTIONS,
  ...SNOWFLAKE_TYPES,
]

// ─── Plugin ──────────────────────────────────────────────────────────────────

export function activate(ctx: PluginContext): void {
  ctx.exporters.register('sql', sqlExporter)
  ctx.importers.register('sql', sqlImporter)
  ctx.formatters.register('sql', {
    language: 'sql',
    displayName: 'SQL (Snowflake)',
    appliesToTypes: ['snowflake'],
    format: (sql) => formatSql(sql, 'snowflake')
  })

  ctx.drivers.register('snowflake', {
    createAdapter: (config) => new SnowflakeAdapter(config),
    sqlDialect: 'snowflake',
    quoteChar: SNOWFLAKE_QUOTE,
    placeholderStyle: 'positional',
    editorLanguage: 'sql',
    statementSyntax: 'sql',
    presentation: { abbreviation: 'SF', tone: 'info' },
    nouns: {
      object: { one: 'table', many: 'tables' },
      field: { one: 'column', many: 'columns' },
      record: { one: 'row', many: 'rows' },
    },
    defaultSchemaCandidates: ['PUBLIC', 'public'],
    connectionFields: [
      { key: 'account', label: 'Account Identifier', type: 'text', required: true },
      { key: 'host', label: 'Host Override', type: 'text' },
      { key: 'username', label: 'Username', type: 'text' },
      { key: 'password', label: 'Password', type: 'password' },
      {
        key: 'authenticator', label: 'Authenticator', type: 'select', default: 'externalbrowser',
        options: [
          { value: 'externalbrowser', label: 'SSO (Browser)' },
          { value: 'snowflake', label: 'Username / Password' },
          { value: 'SNOWFLAKE_JWT', label: 'Key Pair (JWT)' },
          { value: 'oauth', label: 'OAuth' },
          { value: 'https://okta.example.com', label: 'Okta (enter URL)' },
        ],
      },
      { key: 'privateKeyPath', label: 'Private Key File', type: 'file-path', accept: '.pem,.p8,.key' },
      { key: 'passphrase', label: 'Key Passphrase', type: 'password' },
      { key: 'role', label: 'Role', type: 'select', fetchable: true, step: 1 },
      { key: 'warehouse', label: 'Warehouse', type: 'select', fetchable: true, step: 1 },
      { key: 'database', label: 'Database', type: 'select', fetchable: true, step: 2 },
      { key: 'schema', label: 'Schema', type: 'select', fetchable: true, step: 2, default: 'PUBLIC' },
    ],
    sampleQuery: createSampleQuery(SNOWFLAKE_QUOTE),
    getTableData: createRelationalGetTableData(SNOWFLAKE_QUOTE),
    explain: { supportsAnalyze: false, format: 'text', statement: 'EXPLAIN' },
    generateMigrationDdl: createMigrationDdl(SNOWFLAKE_QUOTE),
    databaseSwitch: { supported: true },
  })

  // ── Declarative UI: Toolbar selectors (Snowsight-style Role + Warehouse) ──

  ctx.ui.registerToolbar('snowflake-context', [
    { type: 'selector', id: 'sf-role', label: 'Role', resolver: 'sf-roles', onChange: 'verql-plugin-snowflake:use-role', searchable: true },
    { type: 'selector', id: 'sf-warehouse', label: 'Warehouse', resolver: 'sf-warehouses', onChange: 'verql-plugin-snowflake:use-warehouse', searchable: true },
  ])

  // ── Dynamic resolvers ─────────────────────────────────────────────────────

  const extractName = (r: Record<string, unknown>) => {
    const name = extractSnowflakeName(r)
    return { value: name, label: name }
  }
  const filterEmpty = (o: { value: string }) => o.value !== ''

  ctx.ui.registerResolver('sf-roles', async ({ connectionId }) => {
    const result = await ctx.connections.query(connectionId, 'SHOW ROLES')
    return result.rows.map(extractName).filter(filterEmpty)
  })

  ctx.ui.registerResolver('sf-warehouses', async ({ connectionId }) => {
    const result = await ctx.connections.query(connectionId, 'SHOW WAREHOUSES')
    return result.rows.map(extractName).filter(filterEmpty)
  })

  // ── Commands for selector onChange ─────────────────────────────────────────

  ctx.commands.register('use-role', async (payload) => {
    if (payload?.value && payload?.connectionId) {
      await ctx.connections.query(payload.connectionId as string, `USE ROLE "${payload.value}"`)
      ctx.ui.invalidate('sf-warehouses')
    }
  })

  ctx.commands.register('use-warehouse', async (payload) => {
    if (payload?.value && payload?.connectionId) {
      await ctx.connections.query(payload.connectionId as string, `USE WAREHOUSE "${payload.value}"`)
    }
  })

  // ── Completion provider ────────────────────────────────────────────────────

  ctx.completions.register(async (connectionId, context) => {
    const items: CompletionItem[] = [...STATIC_COMPLETIONS]

    try {
      const tables = await ctx.schema.getTables(connectionId, context.schema)
      for (const t of tables) {
        items.push({
          label: t.name,
          kind: 'table',
          detail: context.schema ? `${context.schema}.${t.name}` : t.name,
          sortText: `4_tbl_${t.name}`,
        })

        try {
          const columns = await ctx.schema.getColumns(connectionId, t.name, context.schema)
          for (const col of columns) {
            items.push({
              label: col.name,
              kind: 'column',
              detail: `${t.name}.${col.name} — ${col.dataType}`,
              sortText: `5_col_${t.name}_${col.name}`,
            })
          }
        } catch {
          // columns unavailable for this table — continue
        }
      }
    } catch {
      // schema unavailable — return static completions only
    }

    return items
  })
}
