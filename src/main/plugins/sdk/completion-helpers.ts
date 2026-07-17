// Shared completion-provider scaffolding for SQL driver plugins.
//
// Every relational driver's completion callback ends with the same dynamic
// block: fetch the schema's tables, then each table's columns, tolerating
// partial failures. Only the *static* keyword/type/function items differ per
// dialect. This helper owns the dynamic half so drivers supply just their
// static items.

import type { CompletionItem, CompletionContext } from '@shared/plugin-ui-types'
import type { SchemaAccess } from './types'

export type CompletionProvider = (
  connectionId: string,
  context: CompletionContext,
) => Promise<CompletionItem[]>

/**
 * Build a completion provider that appends live table + column suggestions to a
 * driver's static items. `buildStatic` is called per request (it may read the
 * context). Tables sort before columns before keywords, matching the shared
 * `sortText` convention ('0' tables, '1' columns).
 */
export function createSchemaCompletionProvider(
  schema: SchemaAccess,
  buildStatic: (context: CompletionContext) => CompletionItem[],
): CompletionProvider {
  return async (connectionId, context) => {
    const items: CompletionItem[] = buildStatic(context)

    let tables: { name: string }[] = []
    try {
      tables = await schema.getTables(connectionId, context.schema)
      for (const table of tables) {
        items.push({ label: table.name, kind: 'table', detail: context.schema ?? 'table', sortText: '0' })
      }
    } catch {
      // partial results — tables unavailable
    }

    for (const table of tables) {
      try {
        const columns = await schema.getColumns(connectionId, table.name, context.schema)
        for (const col of columns) {
          items.push({
            label: col.name,
            kind: 'column',
            detail: `${table.name}.${col.name} (${col.dataType})`,
            sortText: '1',
          })
        }
      } catch {
        // partial results — columns for this table unavailable
      }
    }

    return items
  }
}
