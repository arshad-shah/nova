import type { DbAdapter } from '../../db/adapter'
import type { TableDataOptions, TableDataResult } from '@shared/types'
import type { PaginationCapability } from '@shared/driver-capabilities'
import { quoteIdentifier } from './identifier'
import { renderPageClause } from './sql-format'

/**
 * Build the data-fetch implementation that relational driver plugins should
 * use for their `getTableData` contribution. The `quoteChar` drives identifier
 * escaping so a hostile table name (introspected from a malicious server,
 * for example) can never break out of the SELECT statement.
 *
 * `options.pagination` selects the paging-clause dialect (defaults to
 * `LIMIT n OFFSET m`) so the syntax is driver-declared, not hardcoded here.
 *
 * The returned reader takes a per-call `TableDataOptions`:
 *   - with a `limit` (the "View data" browse path) it fetches a bounded page —
 *     `limit + 1` rows, so it can report `hasMore` without a separate COUNT —
 *     and returns at most `limit` rows. This is what stops "View data" from
 *     pulling a 50M-row table whole into the main process.
 *   - with no `limit` (the export path) it issues an unbounded read, preserving
 *     today's export behaviour until export streaming lands (see #214/#17).
 *
 * Non-relational drivers should NOT use this — they implement `getTableData`
 * themselves with their own query language (Mongo find, Redis SCAN, etc.).
 */
export function createRelationalGetTableData(
  quoteChar: string,
  options?: { pagination?: PaginationCapability },
) {
  const style = options?.pagination?.style ?? 'limit-offset'
  return async function getTableData(
    adapter: DbAdapter,
    table: string,
    schema?: string,
    opts?: TableDataOptions,
  ): Promise<TableDataResult> {
    const columns = await adapter.getColumns(table, schema)
    const qualified = schema
      ? quoteIdentifier([schema, table], quoteChar)
      : quoteIdentifier(table, quoteChar)

    const limit = opts?.limit
    if (limit == null) {
      // Unbounded read — only the export path reaches here; the browse path
      // always passes a limit. Export streaming is #214/#17.
      const result = await adapter.query(`SELECT * FROM ${qualified}`)
      return { rows: result.rows, columns }
    }

    // Over-fetch by one row so a full page tells us more rows exist, without
    // paying for a separate COUNT(*).
    const clause = renderPageClause(style, limit + 1, opts?.offset ?? 0)
    const result = await adapter.query(`SELECT * FROM ${qualified} ${clause}`)
    const hasMore = result.rows.length > limit
    return {
      rows: hasMore ? result.rows.slice(0, limit) : result.rows,
      columns,
      hasMore,
    }
  }
}
