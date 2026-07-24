import { useEffect } from 'react'
import { QueryEditor } from './QueryEditor'
import { QueryToolbar } from './QueryToolbar'
import { TransactionToolbar } from './TransactionToolbar'
import { ConnectionSelector } from './ConnectionSelector'
import { PluginSlot } from '@/components/plugins/PluginSlot'
import { SaveQueryDialog } from './SaveQueryDialog'
import { useQueryExecution } from './hooks/useQueryExecution'
import { useQueryTransactions } from './hooks/useQueryTransactions'
import { useQuerySaveDialog } from './hooks/useQuerySaveDialog'
import { tabActions } from '@/stores/tab-actions'
import { useTabsStore } from '@/stores/tabs'
import { useConnectionsStore } from '@/stores/connections'
import { useDriverCapabilitiesStore } from '@/stores/driver-capabilities'
import type { QueryTab } from '@shared/types'
import { Flex, Divider, Box } from '@/primitives'

interface Props {
  tab: QueryTab
}

export function QueryPanel({ tab }: Props) {
  const updateTabSql = useTabsStore(s => s.updateTabSql)
  const setTabIsolation = useTabsStore(s => s.setTabIsolation)
  const setTabReadOnly = useTabsStore(s => s.setTabReadOnly)
  const connections = useConnectionsStore(s => s.connections)
  const dbType = tab.connectionId ? connections.find(c => c.id === tab.connectionId)?.type : undefined

  // Capabilities: resolve + ensure fetched for this driver type
  const fetchCaps = useDriverCapabilitiesStore(s => s.fetch)
  const caps = useDriverCapabilitiesStore(s =>
    dbType ? s.resolveCapabilities(tab.connectionId, dbType) : null
  )
  useEffect(() => {
    if (dbType) fetchCaps(dbType).catch(() => {})
  }, [dbType, fetchCaps])

  const { runStatement, handleExecute, handleCancel, explainStatement, handleExplain } = useQueryExecution(tab, dbType, caps)
  const { onToggleAutoCommit, doCommit, doRollback, onCommit, onRollback } = useQueryTransactions(tab)
  const { handleSave, saveDialogOpen, setSaveDialogOpen, saveDialogName, setSaveDialogName, confirmSaveDialog } =
    useQuerySaveDialog(tab, dbType)

  // Publish this tab's save + dirty + lens + txn handlers to the registry. The global
  // Cmd/Ctrl+S handler in App.tsx pulls the active tab's handler from here,
  // and the CodeLens dispatcher routes run/explain through tabActions so the
  // editor library stays decoupled from React.
  // txnStatus reads from the store directly (not from the `tab` prop closure)
  // so it reflects the latest transaction state even if this effect doesn't re-run.
  useEffect(() => {
    tabActions.register(tab.id, {
      onSave: handleSave,
      isDirty: () => {
        const t = useTabsStore.getState().tabs.find((t) => t.id === tab.id)
        return t?.type === 'query' && t.isDirty
      },
      label: tab.title,
      runStatement: (sql) => { void runStatement(sql) },
      // Only expose the per-statement Explain when the driver can explain.
      explainStatement: caps?.explain ? (sql) => { void explainStatement(sql) } : undefined,
      txnStatus: () => {
        const t = useTabsStore.getState().tabs.find((t) => t.id === tab.id)
        return (t?.type === 'query' ? t.txn?.status : undefined) ?? 'none'
      },
      // Raw throwing variants: the close-guard in App.tsx uses these so a
      // failed commit/rollback propagates the error and keeps the dialog open.
      commitTransaction: doCommit,
      rollbackTransaction: doRollback,
    })
    return () => tabActions.unregister(tab.id)
  }, [tab.id, tab.title, handleSave, runStatement, explainStatement, caps, doCommit, doRollback])

  return (
    <Flex direction="column" className="h-full">
      {/* Connection + schema selector + toolbar */}
      <Flex direction="column" className="border-b border-border bg-bg-secondary shrink-0">
        <Flex direction="row" align="center" gap="sm" className="px-3 py-1.5">
          <ConnectionSelector tabId={tab.id} connectionId={tab.connectionId} database={tab.database} schema={tab.schema} caps={caps} />
          <Divider orientation="vertical" className="h-4" />
          <QueryToolbar
            onExecute={handleExecute}
            onCancel={handleCancel}
            onExplain={handleExplain}
            isExecuting={tab.isExecuting}
            connectionType={dbType}
            canExplain={Boolean(caps?.explain)}
          />
        </Flex>
        {/* Transaction toolbar — only shown when driver reports session capabilities.
            TransactionToolbar self-hides when caps.autoCommit and caps.manualTransactions
            are both absent, but we skip the wrapper row entirely to avoid an empty strip. */}
        {caps?.session && (
          <Flex direction="row" align="center" gap="sm" className="px-3 pb-1.5 flex-wrap">
            <TransactionToolbar
              caps={caps.session}
              txn={tab.txn ?? { autoCommit: true, status: 'none', readOnly: false }}
              onToggleAutoCommit={onToggleAutoCommit}
              onCommit={onCommit}
              onRollback={onRollback}
              onIsolationChange={(lvl) => setTabIsolation(tab.id, lvl)}
              onReadOnlyChange={(ro) => setTabReadOnly(tab.id, ro)}
            />
          </Flex>
        )}
      </Flex>

      {/* Plugin-contributed surfaces (e.g. AI NL-to-SQL bar). Nothing renders
          when no plugin contributes here. */}
      <PluginSlot
        id="query.editor.top"
        context={{
          connectionId: tab.connectionId,
          schema: tab.schema,
          onSqlGenerated: (sql: string) => { updateTabSql(tab.id, sql) }
        }}
      />

      <SaveQueryDialog
        open={saveDialogOpen}
        name={saveDialogName}
        onNameChange={setSaveDialogName}
        onClose={() => setSaveDialogOpen(false)}
        onConfirm={confirmSaveDialog}
      />

      {/* Editor */}
      <Box className="flex-1 min-h-30">
        <QueryEditor
          tabId={tab.id}
          value={tab.sql}
          onChange={(sql) => updateTabSql(tab.id, sql)}
          onExecute={handleExecute}
          onSave={handleSave}
          connectionId={tab.connectionId}
          schema={tab.schema}
          databaseType={dbType}
        />
      </Box>
    </Flex>
  )
}
