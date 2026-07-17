/**
 * Tab-actions registry.
 *
 * Any tab kind that can be saved or has unsaved state registers itself here
 * on mount. The host shell (App.tsx) uses the registry to:
 *   - route the global Cmd/Ctrl+S to the active tab's save handler, so save
 *     works regardless of which tab type is in front (query, settings, …)
 *   - check `isDirty()` before closing a tab so the user gets a confirm
 *     dialog instead of silently losing edits
 *
 * Refs (not zustand state) because tab handlers re-bind on every render and
 * we don't want every tab to re-render when a sibling registers or saves.
 * Subscribers (the close-button, the palette) call `get(tabId)` on demand.
 *
 * The `usePendingClose` hook is the one bit of zustand state: a single
 * pending-close tab id that App.tsx watches to drive the confirm dialog.
 */
import { create } from 'zustand'
import { useStatementStatus, hashStatement, type StatementStatus } from '@/stores/statement-status'
import { useSettingsStore } from '@/stores/settings'

export interface TabActions {
  /** Persist the tab's content. Receives no args — implementations read their own state. */
  onSave?: () => void | Promise<void>
  /** Returns true when the tab has unsaved changes. Drives the dirty dot and the close confirm. */
  isDirty?: () => boolean
  /** Optional human description for confirm dialogs ("Query 1", "Settings", …). */
  label?: string
  /** Run a single SQL statement (statement-gutter Run action). */
  runStatement?: (sql: string) => void
  /** Show EXPLAIN ANALYZE plan for a single statement (statement-gutter Explain action). */
  explainStatement?: (sql: string) => void
  /** Returns 'active' when the tab has an open, uncommitted transaction. */
  txnStatus?: () => 'none' | 'active'
  commitTransaction?: () => void | Promise<void>
  rollbackTransaction?: () => void | Promise<void>
}

const handlers = new Map<string, TabActions>()

export const tabActions = {
  register(tabId: string, actions: TabActions): void {
    handlers.set(tabId, actions)
  },
  unregister(tabId: string): void {
    handlers.delete(tabId)
  },
  get(tabId: string): TabActions | undefined {
    return handlers.get(tabId)
  },

  /** Returns true if the tab is registered and reports itself dirty. */
  isDirty(tabId: string): boolean {
    return Boolean(handlers.get(tabId)?.isDirty?.())
  },

  /** Invokes the tab's save handler. No-op when the tab didn't register one. */
  async save(tabId: string): Promise<void> {
    const a = handlers.get(tabId)
    if (a?.onSave) await a.onSave()
  },

  recordRunStart(tabId: string, sql: string): void {
    const h = hashStatement(sql)
    useStatementStatus.getState().record(tabId, h, {
      kind: 'running', durationMs: null, rowCount: null, ranAt: Date.now(),
    })
  },
  recordRunResult(tabId: string, sql: string, outcome: Omit<StatementStatus, 'ranAt'>): void {
    const h = hashStatement(sql)
    useStatementStatus.getState().record(tabId, h, { ...outcome, ranAt: Date.now() })
  },

  runStatement(tabId: string, sql: string): void {
    this.recordRunStart(tabId, sql)
    handlers.get(tabId)?.runStatement?.(sql)
  },
  explainStatement(tabId: string, sql: string): void {
    handlers.get(tabId)?.explainStatement?.(sql)
  },

  hasOpenTransaction(tabId: string): boolean {
    return handlers.get(tabId)?.txnStatus?.() === 'active'
  },
  async commitTransaction(tabId: string): Promise<void> {
    await handlers.get(tabId)?.commitTransaction?.()
  },
  async rollbackTransaction(tabId: string): Promise<void> {
    await handlers.get(tabId)?.rollbackTransaction?.()
  },
}

interface PendingCloseState {
  /** Tabs with an open transaction, resolved one at a time, head first.
   *  Each needs its own commit/rollback against its own session — there is
   *  no coherent bulk answer, so these queue rather than batch. */
  txnQueue: string[]
  /** Dirty tabs sharing one combined discard confirm. */
  dirtyBatch: string[]
  requestMany: (ids: { dirty: string[]; txn: string[] }) => void
  /** Pops the transaction queue after a commit/rollback resolves. */
  resolveHead: () => void
  clearBatch: () => void
  clear: () => void
}

/**
 * Holds tabs the user asked to close but which are awaiting confirmation.
 * App.tsx watches this and mounts the dialog; every close site routes through
 * `requestCloseTab`/`requestCloseTabs` so they all share the same guards.
 */
export const usePendingClose = create<PendingCloseState>((set) => ({
  txnQueue: [],
  dirtyBatch: [],
  requestMany: ({ dirty, txn }) => set({ dirtyBatch: dirty, txnQueue: txn }),
  resolveHead: () => set((s) => ({ txnQueue: s.txnQueue.slice(1) })),
  clearBatch: () => set({ dirtyBatch: [] }),
  clear: () => set({ txnQueue: [], dirtyBatch: [] }),
}))

/**
 * Partitions `ids` three ways and closes what it can:
 *   - neither dirty nor transactional -> closed now, no dialog
 *   - dirty (and the confirm is on)   -> one combined discard confirm
 *   - open transaction               -> queued for a per-tab commit/rollback
 *
 * The transaction check comes first and wins: a tab that is both dirty and
 * transactional must not also appear in the discard batch, or the user would
 * answer for it twice.
 *
 * The unsaved-changes confirm is opt-out via Settings -> General. An open
 * transaction always prompts regardless: discarding it loses committed-looking
 * work and isn't covered by the "unsaved edits" toggle.
 */
export function requestCloseTabs(ids: string[], actuallyClose: (id: string) => void): void {
  const confirmUnsaved = useSettingsStore.getState().settings.general.confirmOnUnsavedClose
  const dirty: string[] = []
  const txn: string[] = []

  for (const id of ids) {
    if (tabActions.hasOpenTransaction(id)) txn.push(id)
    else if (confirmUnsaved && tabActions.isDirty(id)) dirty.push(id)
    else actuallyClose(id)
  }

  if (dirty.length > 0 || txn.length > 0) {
    usePendingClose.getState().requestMany({ dirty, txn })
  }
}

/**
 * Single-tab close. The one-element case of `requestCloseTabs` — kept as a
 * named export because it's the common path and every existing call site uses
 * it, but deliberately not a second implementation of the same guards.
 */
export function requestCloseTab(tabId: string, actuallyClose: (id: string) => void): void {
  requestCloseTabs([tabId], actuallyClose)
}
