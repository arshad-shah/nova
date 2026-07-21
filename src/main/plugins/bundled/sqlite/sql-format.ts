import { createSqlExporter, createSqlImporter } from '../../sdk/sql-format'

export const sqlExporter = createSqlExporter({
  quoteChar: '"',
  displayName: 'SQL (SQLite)',
  appliesToTypes: ['sqlite'],
})

export const sqlImporter = createSqlImporter({
  displayName: 'SQL (SQLite)',
  appliesToTypes: ['sqlite'],
})
