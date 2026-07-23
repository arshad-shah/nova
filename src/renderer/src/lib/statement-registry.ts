/**
 * Statement contributions keyed by **statement-syntax id** (e.g. `'sql'`,
 * `'redis'`, `'mongodb'`), which each driver declares via its `statementSyntax`
 * capability. A splitter + ordered lens actions per syntax. The StatementGutter
 * overlay is the only consumer; it resolves a connection's syntax from the
 * driver capability (never from a hardcoded db-type list).
 */
import type { LucideIcon } from 'lucide-react'
import type { MessageKey } from '@shared/i18n'

/** Why a statement is considered destructive — an i18n message key the
 *  run-confirm prompt renders. Returned by a syntax's `classifyDestructive`. */
export interface DestructiveReason {
  messageKey: MessageKey
}

export interface Statement {
  startLine: number
  startColumn: number
  endLine: number
  endColumn: number
  text: string
}

/** Per-call splitting knobs a syntax may honour. Threaded from the connection's
 *  driver capabilities at split time (a syntax registered once is shared by
 *  several drivers, so per-driver behaviour can't be baked into registration). */
export interface StatementSplitOptions {
  /** Recognise dollar-quoted bodies (`$$…$$`) — set from the driver's
   *  `supportsDollarQuoting` capability. Syntaxes without the notion ignore it. */
  dollarQuoting?: boolean
}

export interface LensActionContext {
  stmt: Statement
  tabId: string
  connectionId: string | null
  dbType: string
}

export interface LensAction {
  id: string
  title: string
  /** Optional lucide icon component rendered to the left of the title. */
  icon?: LucideIcon
  when?: (stmt: Statement) => boolean
  handler: (ctx: LensActionContext) => void
}

export interface StatementContribution {
  splitStatements(source: string, opts?: StatementSplitOptions): Statement[]
  lensActions: LensAction[]
  /** Classify a statement as destructive (drives the run-confirm prompt), or
   *  null when it's safe. Optional — a syntax with no notion of destructive
   *  statements omits it, so the confirm is driver-aware instead of assuming SQL
   *  DELETE/DROP semantics apply to every driver. */
  classifyDestructive?(source: string): DestructiveReason | null
}

const contributions = new Map<string, StatementContribution>()

export function registerStatementContribution(syntax: string, c: StatementContribution): void {
  contributions.set(syntax, c)
}

export function getStatementContribution(syntax: string): StatementContribution | undefined {
  return contributions.get(syntax)
}

export function invokeLensAction(syntax: string, actionId: string, ctx: LensActionContext): void {
  const c = contributions.get(syntax)
  if (!c) return
  const action = c.lensActions.find((a) => a.id === actionId)
  if (!action) return
  action.handler(ctx)
}

/** Test-only: clear the registry between test cases. */
export function _resetForTests(): void {
  contributions.clear()
}
