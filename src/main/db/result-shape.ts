import type { FieldInfo, QueryResult } from '@shared/types'

/**
 * Assemble a `QueryResult` envelope from a driver's raw rows/fields, owning the
 * two derived values every adapter computed by hand: `rowCount` (the row count)
 * and `duration` (elapsed ms, rounded, from a `performance.now()` start mark).
 *
 * Pass `start` from a `performance.now()` taken before the query ran.
 */
export function makeQueryResult(input: {
  rows: Record<string, unknown>[]
  fields: FieldInfo[]
  affectedRows?: number
  start: number
}): QueryResult {
  return {
    rows: input.rows,
    fields: input.fields,
    rowCount: input.rows.length,
    duration: Math.round(performance.now() - input.start),
    affectedRows: input.affectedRows ?? 0,
  }
}

/**
 * Derive `FieldInfo[]` from the first row's keys when the driver returns no
 * column metadata (Mongo/Redis and the export-query path). Columns are typed
 * `'unknown'` and nullable — the shared default these call sites each inlined.
 */
export function inferFieldsFromRows(rows: Record<string, unknown>[]): FieldInfo[] {
  if (rows.length === 0) return []
  return Object.keys(rows[0]).map((name) => ({ name, dataType: 'unknown', nullable: true }))
}
