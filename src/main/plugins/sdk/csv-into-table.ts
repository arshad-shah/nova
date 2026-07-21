import type { DbAdapter } from '../../db/adapter'
import { quoteIdentifier, renderPlaceholder } from './identifier'
import type { PlaceholderStyle } from './types'
import { errorMessage } from '@shared/errors'

export interface CsvIntoTableOptions {
  tableName: string
  columnMapping: Record<string, string> // csvColumn -> dbColumn
  onConflict: 'skip' | 'update' | 'error'
  /** Driver's identifier quote character — passed in by the orchestrator so
   *  the core-formats plugin never branches on dialect names. */
  quoteChar: string
  /** Driver's parameter-placeholder style. `'numbered'` ⇒ "$1", "$2"… (Postgres);
   *  `'positional'` ⇒ "?" (MySQL / SQLite). Declarative (was a function) so the
   *  driver descriptor stays serializable. */
  placeholderStyle: PlaceholderStyle
}

export async function importCsvToTable(
  adapter: DbAdapter,
  csvRows: Record<string, string>[],
  options: CsvIntoTableOptions,
): Promise<{ inserted: number; skipped: number; errors: string[] }> {
  const { tableName, columnMapping, onConflict, quoteChar, placeholderStyle } = options
  const dbColumns = Object.values(columnMapping)
  const csvColumns = Object.keys(columnMapping)

  let inserted = 0
  let skipped = 0
  const errors: string[] = []

  const colList = dbColumns.map(c => quoteIdentifier(c, quoteChar)).join(', ')
  const qTable = quoteIdentifier(tableName, quoteChar)
  const placeholders = dbColumns.map((_, idx) => renderPlaceholder(placeholderStyle, idx + 1)).join(', ')
  const sql = `INSERT INTO ${qTable} (${colList}) VALUES (${placeholders})`

  for (let i = 0; i < csvRows.length; i++) {
    const row = csvRows[i]
    const values = csvColumns.map(csvCol => row[csvCol] ?? null)
    try {
      await adapter.query(sql, values)
      inserted++
    } catch (err) {
      if (onConflict === 'skip') {
        skipped++
      } else if (onConflict === 'error') {
        errors.push(`Row ${i + 1}: ${errorMessage(err)}`)
      } else {
        // 'update' mode: dialect-specific upsert isn't implemented yet.
        // Surface the failure via errors[] so the user sees it; the old
        // behaviour silently dropped every conflict and reported success.
        errors.push(`Row ${i + 1}: ${errorMessage(err)}`)
      }
    }
  }

  return { inserted, skipped, errors }
}
