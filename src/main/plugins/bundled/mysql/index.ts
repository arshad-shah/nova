import type { PluginManifest } from '../../types'
import type { PluginContext } from '../../sdk/types'
import { mysqlErrorRules } from './error-rules'
import type { CompletionItem } from '@shared/plugin-ui-types'
import { createSchemaCompletionProvider } from '../../sdk/completion-helpers'
import { MysqlAdapter } from './mysql-adapter'
import { sqlExporter, sqlImporter } from './sql-format'
import { createRelationalGetTableData } from '../../sdk/relational-helpers'
import { formatSql, createSampleQuery, createMigrationDdl } from '../../sdk/sql-format'
import { PG_TO_MYSQL, pgToMysqlFallback } from './type-maps'

const MY_QUOTE = '`' as const

export const manifest: PluginManifest = {
  name: 'verql-plugin-mysql',
  version: '1.0.0',
  displayName: 'MySQL',
  description: 'MySQL database driver',
  main: 'index.js',
  contributes: {
    drivers: [{ id: 'mysql', name: 'MySQL' }],
    exporters: [{ id: 'sql', name: 'SQL (MySQL)', extension: 'sql' }],
    importers: [{ id: 'sql', name: 'SQL (MySQL)', extensions: ['sql'] }],
    formatters: [{ id: 'sql', name: 'SQL (MySQL)' }]
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
  'NULLIF', 'WITH', 'ASC', 'DESC',
]

const MYSQL_KEYWORDS = [
  'ENGINE', 'AUTO_INCREMENT', 'UNSIGNED', 'ZEROFILL', 'ENUM',
  'CHARACTER SET', 'COLLATE', 'CHARSET', 'DEFAULT CHARSET',
  'IF NOT EXISTS', 'IF EXISTS', 'ON DUPLICATE KEY UPDATE',
  'STRAIGHT_JOIN', 'FORCE INDEX', 'USE INDEX', 'IGNORE INDEX',
  'EXPLAIN', 'DESCRIBE', 'SHOW TABLES', 'SHOW COLUMNS', 'SHOW DATABASES',
  'SHOW CREATE TABLE', 'SHOW INDEX', 'REPLACE INTO', 'INSERT IGNORE',
  'LOCK TABLES', 'UNLOCK TABLES', 'ROW_FORMAT', 'PARTITION BY',
  'SUBPARTITION BY', 'LOAD DATA INFILE', 'INTO OUTFILE',
]

const MYSQL_DATA_TYPES = [
  'TINYINT', 'SMALLINT', 'MEDIUMINT', 'INT', 'INTEGER', 'BIGINT',
  'FLOAT', 'DOUBLE', 'DECIMAL', 'NUMERIC', 'BIT',
  'BOOLEAN', 'BOOL',
  'DATE', 'DATETIME', 'TIMESTAMP', 'TIME', 'YEAR',
  'CHAR', 'VARCHAR', 'TINYTEXT', 'TEXT', 'MEDIUMTEXT', 'LONGTEXT',
  'BINARY', 'VARBINARY', 'TINYBLOB', 'BLOB', 'MEDIUMBLOB', 'LONGBLOB',
  'ENUM', 'SET', 'JSON',
]

const MYSQL_FUNCTIONS: { label: string; detail: string }[] = [
  { label: 'NOW()', detail: 'Returns current date and time' },
  { label: 'CURDATE()', detail: 'Returns current date' },
  { label: 'CURTIME()', detail: 'Returns current time' },
  { label: 'SYSDATE()', detail: 'Returns the time at function execution' },
  { label: 'COALESCE()', detail: 'Returns first non-null argument' },
  { label: 'IFNULL()', detail: 'Returns alternate value if expression is null' },
  { label: 'NULLIF()', detail: 'Returns null if two arguments are equal' },
  { label: 'IF()', detail: 'If/else value based on condition' },
  { label: 'COUNT()', detail: 'Count rows or non-null values' },
  { label: 'SUM()', detail: 'Sum of values' },
  { label: 'AVG()', detail: 'Average of values' },
  { label: 'MIN()', detail: 'Minimum value' },
  { label: 'MAX()', detail: 'Maximum value' },
  { label: 'GROUP_CONCAT()', detail: 'Concatenate group values into a string' },
  { label: 'CONCAT()', detail: 'Concatenate strings' },
  { label: 'CONCAT_WS()', detail: 'Concatenate strings with separator' },
  { label: 'LOWER()', detail: 'Convert string to lower case' },
  { label: 'UPPER()', detail: 'Convert string to upper case' },
  { label: 'TRIM()', detail: 'Remove leading and trailing spaces' },
  { label: 'LENGTH()', detail: 'Length of string in bytes' },
  { label: 'CHAR_LENGTH()', detail: 'Length of string in characters' },
  { label: 'SUBSTRING()', detail: 'Extract substring' },
  { label: 'REPLACE()', detail: 'Replace occurrences of a substring' },
  { label: 'LEFT()', detail: 'Return leftmost N characters' },
  { label: 'RIGHT()', detail: 'Return rightmost N characters' },
  { label: 'DATE_FORMAT()', detail: 'Format date as string using a format mask' },
  { label: 'STR_TO_DATE()', detail: 'Convert string to date using a format mask' },
  { label: 'DATE_ADD()', detail: 'Add a time interval to a date' },
  { label: 'DATE_SUB()', detail: 'Subtract a time interval from a date' },
  { label: 'DATEDIFF()', detail: 'Number of days between two dates' },
  { label: 'YEAR()', detail: 'Extract year from date' },
  { label: 'MONTH()', detail: 'Extract month from date' },
  { label: 'DAY()', detail: 'Extract day from date' },
  { label: 'HOUR()', detail: 'Extract hour from time' },
  { label: 'MINUTE()', detail: 'Extract minute from time' },
  { label: 'SECOND()', detail: 'Extract second from time' },
  { label: 'UNIX_TIMESTAMP()', detail: 'Return Unix timestamp' },
  { label: 'FROM_UNIXTIME()', detail: 'Convert Unix timestamp to datetime' },
  { label: 'JSON_EXTRACT()', detail: 'Extract value from JSON document' },
  { label: 'JSON_OBJECT()', detail: 'Create a JSON object' },
  { label: 'JSON_ARRAY()', detail: 'Create a JSON array' },
  { label: 'JSON_ARRAYAGG()', detail: 'Aggregate values into a JSON array' },
  { label: 'JSON_OBJECTAGG()', detail: 'Aggregate key/value pairs into a JSON object' },
  { label: 'FIND_IN_SET()', detail: 'Find a value in a comma-separated string' },
  { label: 'FIELD()', detail: 'Return index position of a value in a list' },
  { label: 'ROUND()', detail: 'Round numeric value' },
  { label: 'FLOOR()', detail: 'Round down to nearest integer' },
  { label: 'CEIL()', detail: 'Round up to nearest integer' },
  { label: 'ABS()', detail: 'Absolute value' },
  { label: 'MOD()', detail: 'Modulo operation' },
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
    displayName: 'SQL (MySQL)',
    appliesToTypes: ['mysql'],
    format: (sql) => formatSql(sql, 'mysql')
  })
  ctx.typeMappers.register('postgresql', 'mysql', PG_TO_MYSQL, pgToMysqlFallback)

  ctx.drivers.register('mysql', {
    createAdapter: (config) => new MysqlAdapter(config),
    sqlDialect: 'mysql',
    quoteChar: MY_QUOTE,
    placeholderStyle: 'positional',
    editorLanguage: 'sql',
    statementSyntax: 'sql',
    presentation: { abbreviation: 'MY', tone: 'warning' },
    nouns: {
      object: { one: 'table', many: 'tables' },
      field: { one: 'column', many: 'columns' },
      record: { one: 'row', many: 'rows' },
    },
    errorRules: mysqlErrorRules,
    defaultSchemaUseConnectionDatabase: true,
    connectionFields: [
      { key: 'host', label: 'Host', type: 'text', required: true, default: 'localhost' },
      { key: 'port', label: 'Port', type: 'number', required: true, default: 3306 },
      { key: 'database', label: 'Database', type: 'text', required: true },
      { key: 'username', label: 'Username', type: 'text' },
      { key: 'password', label: 'Password', type: 'password' },
      { key: 'ssl', label: 'SSL', type: 'boolean', default: false },
    ],
    sampleQuery: createSampleQuery(MY_QUOTE),
    getTableData: createRelationalGetTableData(MY_QUOTE),
    explain: { supportsAnalyze: true, format: 'text', statement: 'EXPLAIN ANALYZE' },
    generateMigrationDdl: createMigrationDdl(MY_QUOTE),
  })

  // The dynamic table/column half is shared; only these static items differ.
  ctx.completions.register(createSchemaCompletionProvider(ctx.schema, () => {
    const items: CompletionItem[] = []
    for (const kw of SQL_KEYWORDS) {
      items.push({ label: kw, kind: 'keyword', sortText: '3a' })
    }
    for (const kw of MYSQL_KEYWORDS) {
      items.push({ label: kw, kind: 'keyword', detail: 'MySQL', sortText: '3b' })
    }
    for (const dt of MYSQL_DATA_TYPES) {
      items.push({ label: dt, kind: 'keyword', detail: 'data type', sortText: '3c' })
    }
    for (const fn of MYSQL_FUNCTIONS) {
      items.push({ label: fn.label, kind: 'function', detail: fn.detail, sortText: '2' })
    }
    return items
  }))
}
