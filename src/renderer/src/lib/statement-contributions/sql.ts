import { Play, Sparkles } from 'lucide-react'
import { tabActions } from '@/stores/tab-actions'
import type { Statement, StatementContribution, StatementSplitOptions, DestructiveReason } from '@/lib/statement-registry'
import { destructiveKind } from '@/lib/sql-classify'
import { splitStatements, isCommentOnly } from '@shared/sql/statement-splitter'

/**
 * The renderer's view of the shared statement splitter: statement text plus
 * line/column positions, and — unlike the SDK's text-only view — it also breaks
 * on a newline whose next token is a statement keyword, so a buffer without
 * trailing semicolons still gets per-statement gutter actions. The single walk
 * lives in `@shared/sql/statement-splitter`; this is a thin adapter over it.
 * `dollarQuoting` is threaded from the connection's driver capability so
 * Postgres function bodies don't split on their internal semicolons.
 */
export function splitSqlStatements(source: string, opts?: StatementSplitOptions): Statement[] {
  return splitStatements(source, {
    splitOnKeywordNewline: true,
    dollarQuoting: opts?.dollarQuoting,
  })
}

/** Map the SQL family's destructive kinds to their confirm-prompt messages. */
function classifySqlDestructive(source: string): DestructiveReason | null {
  const kind = destructiveKind(source)
  if (kind === 'delete-drop-truncate') return { messageKey: 'query.destructive.deleteDropTruncate' }
  if (kind === 'update-no-where') return { messageKey: 'query.destructive.updateNoWhere' }
  return null
}

export const sqlStatementContribution: StatementContribution = {
  splitStatements: (source, opts) => splitSqlStatements(source, opts).filter((s) => !isCommentOnly(s.text)),
  classifyDestructive: classifySqlDestructive,
  lensActions: [
    { id: 'run',     title: 'Run',     icon: Play,     handler: (ctx) => tabActions.runStatement(ctx.tabId, ctx.stmt.text) },
    { id: 'explain', title: 'Explain', icon: Sparkles, handler: (ctx) => tabActions.explainStatement(ctx.tabId, ctx.stmt.text) },
  ],
}
