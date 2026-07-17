import { createSqlExporter, createSqlImporter } from '../../sdk/sql-format'

export const sqlExporter = createSqlExporter({
  quoteChar: '"',
  displayName: 'SQL (Snowflake)',
  appliesToTypes: ['snowflake'],
})

export const sqlImporter = createSqlImporter({
  displayName: 'SQL (Snowflake)',
  appliesToTypes: ['snowflake'],
})
