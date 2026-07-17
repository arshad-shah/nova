import { createSqlExporter, createSqlImporter } from '../../sdk/sql-format'

export const sqlExporter = createSqlExporter({
  quoteChar: '"',
  displayName: 'SQL (PostgreSQL)',
  appliesToTypes: ['postgresql', 'postgres'],
})

export const sqlImporter = createSqlImporter({
  displayName: 'SQL (PostgreSQL)',
  appliesToTypes: ['postgresql', 'postgres'],
})
