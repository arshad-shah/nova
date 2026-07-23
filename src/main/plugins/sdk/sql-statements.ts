// SDK text-only view of the shared statement splitter.
//
// Plugin authors (and the SQL importer) want statement *text*; the single walk
// lives in `@shared/sql/statement-splitter` so this surface and the renderer's
// position-carrying gutter cannot drift apart. Semicolon-delimited by default;
// pass `dollarQuoting` for dialects with `$$…$$` function bodies (Postgres).

import { splitStatements, type SplitOptions } from '@shared/sql/statement-splitter'

export type { SplitOptions } from '@shared/sql/statement-splitter'

export function splitSqlStatements(sql: string, options?: SplitOptions): string[] {
  return splitStatements(sql, options).map((s) => s.text)
}
