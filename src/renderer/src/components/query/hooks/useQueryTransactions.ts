import { useCallback } from 'react'
import { notifyError } from '@/lib/notify-error'
import { useTabsStore } from '@/stores/tabs'
import type { QueryTab } from '@shared/types'
import { IPC_CHANNELS } from '@shared/ipc'
import { ipc } from '@/platform/client'

export interface QueryTransactions {
  onToggleAutoCommit: (enabled: boolean) => Promise<void>
  /** Raw commit: performs the IPC + status reset and RE-THROWS on failure. */
  doCommit: () => Promise<void>
  /** Raw rollback: performs the IPC + status reset and RE-THROWS on failure. */
  doRollback: () => Promise<void>
  /** Toolbar commit: wraps `doCommit` and surfaces errors as notifications. */
  onCommit: () => Promise<void>
  /** Toolbar rollback: wraps `doRollback` and surfaces errors as notifications. */
  onRollback: () => Promise<void>
}

/** Owns a query tab's transaction lifecycle: auto-commit toggling (open/close
 *  sessions) and commit/rollback. The raw `doCommit`/`doRollback` re-throw so
 *  the App.tsx close-guard can keep its dialog open on failure; the `on*`
 *  variants swallow errors into notifications for inline toolbar use. */
export function useQueryTransactions(tab: QueryTab): QueryTransactions {
  const setTabAutoCommit = useTabsStore(s => s.setTabAutoCommit)
  const setTabTxnStatus = useTabsStore(s => s.setTabTxnStatus)

  // All three handlers are wrapped in try/catch so IPC failures surface as
  // toasts + bell notifications (via notifyError) rather than silently failing.
  const onToggleAutoCommit = useCallback(async (enabled: boolean) => {
    if (!tab.connectionId) return
    try {
      if (enabled) {
        // Turning auto-commit ON: commit any open txn to avoid leaving the server
        // in a dangling transaction, then release the session. Opening a new
        // session is deferred lazily to the next query (see runSql prelude).
        if (tab.txn?.status === 'active') {
          await ipc.invoke(IPC_CHANNELS.DB_TXN_COMMIT, tab.connectionId, tab.id)
        }
        // DB_SESSION_CLOSE is a tolerant no-op when no session is open, so this
        // is safe even if the user toggles OFF then immediately back ON without
        // ever running a query (i.e. no session was ever opened).
        await ipc.invoke(IPC_CHANNELS.DB_SESSION_CLOSE, tab.connectionId, tab.id)
        setTabTxnStatus(tab.id, 'none')
      }
      // Turning OFF is lazy — no IPC here; the session opens on the next query.
      setTabAutoCommit(tab.id, enabled)
    } catch (err) {
      notifyError(err, {
        source: { type: 'tab', id: tab.id, label: tab.title },
      })
    }
  }, [tab.connectionId, tab.id, tab.title, tab.txn?.status, setTabAutoCommit, setTabTxnStatus])

  // Raw: performs the IPC + status reset and PROPAGATES errors (re-throws).
  // Used by the close-guard (App.tsx) so a failed commit/rollback keeps the
  // dialog open and does NOT close the tab, preventing an orphaned server txn.
  const doCommit = useCallback(async () => {
    if (!tab.connectionId) return
    await ipc.invoke(IPC_CHANNELS.DB_TXN_COMMIT, tab.connectionId, tab.id)
    setTabTxnStatus(tab.id, 'none')
  }, [tab.connectionId, tab.id, setTabTxnStatus])

  const doRollback = useCallback(async () => {
    if (!tab.connectionId) return
    await ipc.invoke(IPC_CHANNELS.DB_TXN_ROLLBACK, tab.connectionId, tab.id)
    setTabTxnStatus(tab.id, 'none')
  }, [tab.connectionId, tab.id, setTabTxnStatus])

  // Toolbar handlers: wrap raw ops with the error notifier (swallow for inline use).
  const onCommit = useCallback(async () => {
    try { await doCommit() } catch (err) {
      notifyError(err, { source: { type: 'tab', id: tab.id, label: tab.title } })
    }
  }, [doCommit, tab.id, tab.title])

  const onRollback = useCallback(async () => {
    try { await doRollback() } catch (err) {
      notifyError(err, { source: { type: 'tab', id: tab.id, label: tab.title } })
    }
  }, [doRollback, tab.id, tab.title])

  return { onToggleAutoCommit, doCommit, doRollback, onCommit, onRollback }
}
