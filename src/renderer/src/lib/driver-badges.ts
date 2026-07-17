/**
 * Two-letter chips for the most common engines, keyed by driver id.
 * Centralised so the connection switcher and the status bar segment show
 * the same abbreviation instead of drifting. Anything not listed falls back
 * to the first two letters of the driver id (uppercased), so a future
 * plugin-contributed driver still renders sensibly without a code change.
 */
export const DB_ABBREVIATIONS: Record<string, string> = {
  postgresql: 'PG',
  mysql: 'MY',
  sqlite: 'SL',
  mongodb: 'MG',
  redis: 'RD',
}
