import { useCallback } from 'react'
import { editorRegistry } from '@/stores/editor'
import { tabActions } from '@/stores/tab-actions'
import { parseDbError } from '@/lib/db-error'
import { notifyError } from '@/lib/notify-error'
import { useTabsStore } from '@/stores/tabs'
import { useUiStore, BOTTOM_PANEL } from '@/stores/ui'
import { useSettingsStore } from '@/stores/settings'
import { useQueryHistoryStore } from '@/stores/query-history'
import { useSchemaStore } from '@/stores/schema'
import type { QueryTab, QueryResult, DatabaseType } from '@shared/types'
import type { DriverCapabilities } from '@/stores/driver-capabilities'
import { IPC_CHANNELS } from '@shared/ipc'
import { useTranslation } from '@/i18n/I18nProvider'
import { t as coreT } from '@shared/i18n'
import { isSchemaMutatingSql } from '@/lib/sql-classify'
import { getStatementContribution } from '@/lib/statement-registry'
import { ipc } from '@/platform/client'

/** Localized confirm message for a destructive statement, or null when safe.
 *  Detection is driver-aware: it routes through the statement contribution for
 *  the connection's `statementSyntax` (SQL → DELETE/DROP/UPDATE-no-WHERE; Redis →
 *  FLUSHALL/DEL; Mongo → drop/deleteMany; unknown syntax → no warning) instead
 *  of assuming SQL semantics for every driver. */
function destructiveReason(sql: string, statementSyntax: string | undefined): string | null {
  if (!statementSyntax) return null
  const reason = getStatementContribution(statementSyntax)?.classifyDestructive?.(sql)
  return reason ? coreT(reason.messageKey) : null
}

export interface QueryExecution {
  runStatement: (override?: string) => Promise<void>
  handleExecute: () => void
  handleCancel: () => Promise<void>
  explainStatement: (sqlOverride?: string) => Promise<void>
  handleExplain: () => void
}

/** Owns running / cancelling / explaining SQL for a query tab: schema-context
 *  setup, the per-tab transactional session prelude, timeout racing, history
 *  recording, error surfacing and best-effort plan parsing. */
export function useQueryExecution(
  tab: QueryTab,
  dbType: DatabaseType | undefined,
  caps: DriverCapabilities | null
): QueryExecution {
  const { t } = useTranslation()
  const { setTabExecuting, setTabResults, setTabError, setTabTxnStatus } = useTabsStore()
  const queryTimeout = useSettingsStore(s => s.settings.general.queryTimeout)
  const confirmDestructive = useSettingsStore(s => s.settings.general.confirmDestructiveQueries)

  // Align the connection to the tab's selected database + schema. This MUST run
  // before a transactional session is opened: `switchDatabase` rebuilds the
  // connection pool (and clears its sessions) when the target differs from the
  // current database, so applying context *after* opening the session would
  // wipe the session out from under the first query. It's idempotent — a no-op
  // once the connection is already on the right database.
  const applyContext = useCallback(async () => {
    if (!tab.connectionId) return
    if (tab.database) {
      try {
        await ipc.invoke(IPC_CHANNELS.DB_SWITCH_DATABASE, tab.connectionId, tab.database)
      } catch {
        // ignore — some adapters don't support switchDatabase
      }
    }
    if (tab.schema) {
      try {
        await ipc.invoke(IPC_CHANNELS.DB_SET_SCHEMA, tab.connectionId, tab.schema)
      } catch {
        // ignore — some adapters don't support setSchema
      }
    }
  }, [tab.connectionId, tab.database, tab.schema])

  // Ask the driver to parse the results into a plan tree (db:parse-plan). The
  // renderer never parses EXPLAIN output itself; the driver returns [] for
  // non-plan results, which hides the Query Plan tab. Best-effort.
  const refreshQueryPlan = useCallback(async (result: QueryResult) => {
    if (!tab.connectionId) return
    try {
      const plan = await ipc.invoke(IPC_CHANNELS.DB_PARSE_PLAN, tab.connectionId, result)
      useTabsStore.getState().setTabQueryPlan(tab.id, plan)
    } catch { /* plan parsing is best-effort */ }
  }, [tab.connectionId, tab.id])

  /**
   * Runs SQL. If `override` is provided we use it verbatim (CodeLens "▶ Run"
   * for a single statement, palette "Run Selection", etc.). Otherwise we
   * prefer the user's visual selection in the editor — IDE-style "run only
   * the highlighted text" — falling back to the whole buffer.
   */
  const runStatement = useCallback(async (override?: string) => {
    if (!tab.connectionId) return
    const selected = override?.trim() || editorRegistry.getSelectedSql()
    const sql = (selected || tab.sql).trim()
    if (!sql) return
    if (confirmDestructive) {
      const reason = destructiveReason(sql, caps?.statementSyntax)
      if (reason && !window.confirm(t('query.destructive.runAnyway', { reason }))) return
    }
    // Only single-statement runs (e.g. statement gutter) carry an override.
    // We record per-statement status only in that case — multi-statement runs
    // from Cmd+Enter don't have a single hash.
    const singleStmt = override?.trim() || null

    setTabExecuting(tab.id, true)
    const startedAt = performance.now()
    try {
      const timeoutMs = queryTimeout * 1000
      // Transactional queries are routed through a per-tab session so they
      // participate in an explicit transaction (with isolation level + read-only
      // applied via an explicit BEGIN). The session is opened lazily here on the
      // first query rather than on toggle, so tabs that START with auto-commit
      // off (connection profile default) still get a session before their first
      // statement — previously such tabs would send sessionId with no open
      // session, causing the adapter to throw "No open session".
      const useSession = !!(tab.txn && !tab.txn.autoCommit && tab.connectionId)
      // Apply the database/schema context FIRST, before opening the session, so
      // a pool-rebuilding switchDatabase can't wipe the session we're about to
      // open (the old "No open session on the first transactional query" that
      // self-corrected on retry).
      await applyContext()
      if (useSession) {
        // db:session:open is idempotent (no-op if already open) — safe to call every time.
        await ipc.invoke(IPC_CHANNELS.DB_SESSION_OPEN, tab.connectionId!, tab.id, { autoCommit: false })
        if (tab.txn!.status !== 'active') {
          // Explicit BEGIN applies isolation level + read-only so those settings
          // actually reach the database. The implicit BEGIN used previously
          // silently ignored both. Status is set BEFORE the query so that a
          // query timeout/error leaves status as 'active' (the server txn IS
          // open), rather than leaving it as 'none' which is incorrect.
          await ipc.invoke(IPC_CHANNELS.DB_TXN_BEGIN, tab.connectionId!, tab.id, {
            isolationLevel: tab.txn!.isolationLevel,
            readOnly: tab.txn!.readOnly,
          })
          setTabTxnStatus(tab.id, 'active')
        }
      }
      const txnOpts = useSession ? { sessionId: tab.id } : undefined
      const queryPromise = ipc.invoke(IPC_CHANNELS.DB_QUERY, tab.connectionId, sql, undefined, txnOpts)
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(t('query.timeout.message', { seconds: queryTimeout }))), timeoutMs)
      )
      const result = await Promise.race([queryPromise, timeoutPromise])
      if (result) {
        setTabResults(tab.id, result)
        void refreshQueryPlan(result)
      }
      useQueryHistoryStore.getState().record({
        sql,
        connectionId: tab.connectionId ?? undefined,
        connectionType: dbType,
        status: 'ok',
        durationMs: Math.round(performance.now() - startedAt),
        rowCount: result?.rowCount ?? undefined,
      })
      if (isSchemaMutatingSql(sql) && tab.connectionId) {
        useSchemaStore.getState().clearCache(tab.connectionId)
      }
      if (singleStmt) {
        tabActions.recordRunResult(tab.id, singleStmt, {
          kind: 'ok',
          durationMs: Math.round(performance.now() - startedAt),
          rowCount: result?.rowCount ?? null,
        })
      }
    } catch (err) {
      const durationMs = Math.round(performance.now() - startedAt)
      if (singleStmt) {
        tabActions.recordRunResult(tab.id, singleStmt, { kind: 'error', durationMs, rowCount: null })
      }
      const raw = (err as Error).message
      useQueryHistoryStore.getState().record({
        sql,
        connectionId: tab.connectionId ?? undefined,
        connectionType: dbType,
        status: 'error',
        durationMs,
        error: raw,
      })
      const parsed = parseDbError(raw, dbType)
      // Tab stores the raw text so the QueryErrorView can re-parse and show
      // both the friendly summary and the original driver message — keeps
      // classification logic in one place.
      setTabError(tab.id, raw)
      // Toast + persistent notification share the same parsed text. The bell
      // tray gets the tab as the source so the user can jump back to it.
      notifyError(raw, {
        source: { type: 'tab', id: tab.id, label: tab.title },
      })
      // Cancel the running query on timeout (use the parsed code, not the
      // raw text, so driver locale/wording changes don't break this).
      if (parsed.code === 'TIMEOUT' && tab.connectionId) {
        ipc.invoke(IPC_CHANNELS.DB_CANCEL_QUERY, tab.connectionId).catch(() => {})
      }
    }
  }, [tab.id, tab.connectionId, tab.sql, tab.schema, tab.title, tab.txn, dbType, caps, queryTimeout, confirmDestructive, applyContext, setTabExecuting, setTabResults, setTabError, setTabTxnStatus, refreshQueryPlan, t])

  const handleExecute = useCallback(() => runStatement(), [runStatement])

  const handleCancel = useCallback(async () => {
    if (!tab.connectionId) return
    try {
      await ipc.invoke(IPC_CHANNELS.DB_CANCEL_QUERY, tab.connectionId)
    } catch {
      // ignore cancel errors
    }
    setTabExecuting(tab.id, false)
  }, [tab.id, tab.connectionId, setTabExecuting])

  const explainStatement = useCallback(async (sqlOverride?: string) => {
    if (!tab.connectionId) return
    // The explain statement is driver-declared (capabilities.explain); the app
    // never hardcodes an EXPLAIN dialect. Drivers without it can't explain.
    const explain = caps?.explain
    if (!explain) return
    const sql = (sqlOverride?.trim() || editorRegistry.getSelectedSql() || tab.sql).trim()
    if (!sql) return
    setTabExecuting(tab.id, true)
    try {
      await applyContext()
      const result = await ipc.invoke(IPC_CHANNELS.DB_QUERY, tab.connectionId, `${explain.statement} ${sql}`)
      if (result) {
        setTabResults(tab.id, result)
        void refreshQueryPlan(result)
        // The user asked for an EXPLAIN — route them to the plan view instead
        // of leaving them on the raw-rows Results tab. The BottomDock only
        // surfaces the "Query Plan" tab once the driver parses plan content,
        // which matches the output we just produced.
        useUiStore.getState().setBottomDockActivePanel(BOTTOM_PANEL.QUERY_PLAN)
      }
    } catch (err) {
      setTabError(tab.id, (err as Error).message)
    }
  }, [tab.id, tab.connectionId, tab.sql, tab.schema, caps, applyContext, setTabExecuting, setTabResults, setTabError, refreshQueryPlan])

  const handleExplain = useCallback(() => explainStatement(), [explainStatement])

  return { runStatement, handleExecute, handleCancel, explainStatement, handleExplain }
}
