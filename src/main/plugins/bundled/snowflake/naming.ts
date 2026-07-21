/**
 * Snowflake `SHOW …` commands return column names as quoted-lowercase keys
 * (e.g. `'"name"'`), but some driver paths surface them unquoted. This reads
 * the row's name column either way. The one home for the
 * `String(r['"name"'] ?? r.name ?? '')` idiom the adapter/plugin repeated.
 */
export function extractSnowflakeName(row: Record<string, unknown>): string {
  return String(row['"name"'] ?? row.name ?? '')
}
