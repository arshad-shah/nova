import { createSqlExporter, createSqlImporter } from '../../sdk/sql-format'

export const sqlExporter = createSqlExporter({
  quoteChar: '`',
  displayName: 'SQL (MySQL)',
  appliesToTypes: ['mysql'],
})

export const sqlImporter = createSqlImporter({
  displayName: 'SQL (MySQL)',
  appliesToTypes: ['mysql'],
})
