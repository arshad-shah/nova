import { useUiStore, ACTIVITY_PANEL, SECONDARY_PANEL, BOTTOM_PANEL, type SecondaryPanelId } from '@/stores/ui'
import { SETTINGS_CATEGORY, isSettingsCategory } from '@/lib/settings-categories'
import { useTabsStore } from '@/stores/tabs'
import { useConnectionsStore, getActiveProfile, getProfile } from '@/stores/connections'
import { useSchemaStore } from '@/stores/schema'
import { useSelectionStore } from '@/stores/selection'
import { useDriverCapabilitiesStore } from '@/stores/driver-capabilities'
import { editorRegistry } from '@/stores/editor'
import { pickDefaultSchema } from '@/lib/pick-default-schema'
import { initialAutoCommit } from '@/lib/initial-autocommit'
import { findSavedQuery, openSavedQuery } from '@/components/saved-queries/SavedQueriesPanel'
import { getLatestReleaseNote, getReleaseNote } from '@/lib/release-notes'
import { IPC_CHANNELS } from '@shared/ipc'
import { t } from '@shared/i18n'
import { resolveConnection } from './resolve'
import { appActions } from './registry'
import { APP_ACTION } from './ids'
import type { AppAction } from './types'
import { ipc } from '@/platform/client'

const str = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined)

/** The active query tab's current results, or null when there's nothing to act on. */
function activeQueryResults() {
  const { tabs, activeTabId } = useTabsStore.getState()
  const tab = tabs.find((item) => item.id === activeTabId)
  return tab && tab.type === 'query' ? tab.results : null
}

/** Resolve the schema to target for the active connection, honouring an explicit
 *  value and otherwise falling back to the driver's default. */
async function resolveSchema(
  conn: { id: string; type: string; database: string },
  explicit: string | undefined
): Promise<string> {
  if (explicit) return explicit
  const schemas = await useSchemaStore.getState().fetchSchemas(conn.id, conn.database)
  const caps = await useDriverCapabilitiesStore.getState().fetch(conn.type)
  return pickDefaultSchema(caps ?? {}, schemas, conn.database) ?? conn.database ?? 'public'
}

/**
 * Built-in app actions, wired to the same store calls the command palette uses.
 * Registered once at startup. Plugins add their own via `appActions.register`.
 *
 * All are `navigation` (no data mutation): the AI may run them agentically via
 * the perform_app_action tool, and they also render as user-clickable deep-link
 * chips. Anything that would change data stays out of this list.
 */
const BUILTINS: AppAction[] = [
  // ── Navigation & panels ─────────────────────────────────────────────────
  {
    id: APP_ACTION.OPEN_SETTINGS,
    title: t('actions.openSettings.title'),
    description: t('actions.openSettings.description', {
      categories: Object.values(SETTINGS_CATEGORY).join(', '),
      pluginsCategory: SETTINGS_CATEGORY.PLUGINS
    }),
    kind: 'navigation',
    params: { category: { type: 'string', description: 'Settings category id' } },
    run: (p) => {
      // Settings live in a dedicated editor tab (SettingsTab), not the left
      // sidebar panel. openSettings focuses the category when one is given;
      // ignore an unrecognised category rather than landing on a blank id.
      const category = str(p.category)
      useTabsStore.getState().openSettings(isSettingsCategory(category) ? category : undefined)
    }
  },
  {
    id: APP_ACTION.OPEN_CONNECTIONS,
    title: t('actions.openConnections.title'),
    description: t('actions.openConnections.description'),
    kind: 'navigation',
    run: () => useUiStore.getState().setSecondaryActivePanel(SECONDARY_PANEL.CONNECTIONS)
  },
  {
    id: APP_ACTION.NEW_CONNECTION,
    title: t('actions.newConnection.title'),
    description: t('actions.newConnection.description'),
    kind: 'navigation',
    run: () => { useTabsStore.getState().openConnectionForm() }
  },
  {
    id: APP_ACTION.OPEN_EXPLORER,
    title: t('actions.openExplorer.title'),
    description: t('actions.openExplorer.description'),
    kind: 'navigation',
    run: () => useUiStore.getState().setActivePanel(ACTIVITY_PANEL.EXPLORER)
  },
  {
    id: APP_ACTION.OPEN_SECONDARY_PANEL,
    title: t('actions.openSecondaryPanel.title'),
    description: t('actions.openSecondaryPanel.description'),
    kind: 'navigation',
    params: { id: { type: 'string', required: true, description: 'Secondary panel id' } },
    run: (p) => {
      const id = str(p.id)
      if (id) useUiStore.getState().setSecondaryActivePanel(id as SecondaryPanelId)
    }
  },
  {
    id: APP_ACTION.OPEN_NOTIFICATIONS,
    title: t('actions.openNotifications.title'),
    description: t('actions.openNotifications.description'),
    kind: 'navigation',
    run: () => {
      const ui = useUiStore.getState()
      if (!(ui.secondaryActivePanel === SECONDARY_PANEL.NOTIFICATIONS && ui.secondarySidebarVisible)) {
        ui.setSecondaryActivePanel(SECONDARY_PANEL.NOTIFICATIONS)
      }
    }
  },

  // ── Query tabs & schema authoring ───────────────────────────────────────
  {
    id: APP_ACTION.NEW_QUERY_TAB,
    title: t('actions.newQueryTab.title'),
    description: t('actions.newQueryTab.description'),
    kind: 'navigation',
    params: { sql: { type: 'string', description: 'SQL to pre-fill' } },
    run: (p) => {
      const { activeConnectionId } = useConnectionsStore.getState()
      const conn = getActiveProfile()
      useTabsStore.getState().addQueryTab(activeConnectionId, str(p.sql) ?? null, {
        autoCommit: initialAutoCommit(conn)
      })
    }
  },
  {
    id: APP_ACTION.OPEN_SAVED_QUERY,
    title: t('actions.openSavedQuery.title'),
    description: t('actions.openSavedQuery.description'),
    kind: 'navigation',
    params: { query: { type: 'string', required: true, description: 'Saved query name or id' } },
    run: (p) => {
      const arg = str(p.query)
      if (!arg) throw new Error(t('actions.errors.provideSavedQuery'))
      const q = findSavedQuery(arg)
      if (!q) throw new Error(t('actions.errors.noSavedQueryMatch', { arg }))
      openSavedQuery(q)
    }
  },
  {
    id: APP_ACTION.FORMAT_EDITOR,
    title: t('actions.formatEditor.title'),
    description: t('actions.formatEditor.description'),
    kind: 'navigation',
    run: async () => {
      const reg = editorRegistry.get()
      if (!reg) throw new Error(t('actions.errors.noActiveEditor'))
      const model = reg.editor.getModel()
      if (!model) throw new Error(t('actions.errors.noEditorContent'))
      const source = model.getValue()
      if (!source.trim()) return
      const { tabs } = useTabsStore.getState()
      const tab = tabs.find((item) => item.id === reg.tabId)
      const { activeConnectionId } = useConnectionsStore.getState()
      const connId = (tab && tab.type === 'query' ? tab.connectionId : null) ?? activeConnectionId
      const connType = getProfile(connId)?.type ?? ''
      const { formatted, changed } = await ipc.invoke(
        IPC_CHANNELS.DB_FORMAT_QUERY, model.getLanguageId(), connType, source
      )
      if (!changed) return
      reg.editor.executeEdits('format-document', [{ range: model.getFullModelRange(), text: formatted }])
      reg.editor.focus()
    }
  },
  {
    id: APP_ACTION.INSERT_INTO_EDITOR,
    title: t('actions.insertIntoEditor.title'),
    description: t('actions.insertIntoEditor.description'),
    kind: 'navigation',
    params: { sql: { type: 'string', required: true, description: 'SQL text to insert' } },
    run: (p) => {
      const sql = str(p.sql)
      if (!sql) throw new Error(t('actions.errors.provideSql'))
      const reg = editorRegistry.get()
      if (!reg) throw new Error(t('actions.errors.noActiveSqlEditor'))
      const { editor } = reg
      const selection = editor.getSelection()
      const pos = editor.getPosition()
      const range = selection ?? (pos
        ? { startLineNumber: pos.lineNumber, startColumn: pos.column, endLineNumber: pos.lineNumber, endColumn: pos.column }
        : editor.getModel()?.getFullModelRange() ?? { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 })
      editor.executeEdits('ai-insert', [{ range, text: sql, forceMoveMarkers: true }])
      editor.focus()
    }
  },

  // ── Connection lifecycle ────────────────────────────────────────────────
  {
    id: APP_ACTION.CONNECT_DATABASE,
    title: t('actions.connectDatabase.title'),
    description: t('actions.connectDatabase.description'),
    kind: 'navigation',
    params: { connection: { type: 'string', required: true, description: 'Saved connection name or id' } },
    run: async (p) => {
      const conn = resolveConnection(useConnectionsStore.getState().connections, str(p.connection))
      if (!conn) throw new Error(t('actions.errors.noMatchingConnection'))
      const res = await useConnectionsStore.getState().connect(conn.id)
      if (!res.success) throw new Error(res.error ?? t('actions.errors.couldntConnect', { name: conn.name }))
    }
  },
  {
    id: APP_ACTION.DISCONNECT_DATABASE,
    title: t('actions.disconnectDatabase.title'),
    description: t('actions.disconnectDatabase.description'),
    kind: 'navigation',
    params: { connection: { type: 'string', description: 'Saved connection name or id (defaults to the active one)' } },
    run: async (p) => {
      const state = useConnectionsStore.getState()
      const arg = str(p.connection)
      const conn = arg
        ? resolveConnection(state.connections, arg)
        : getActiveProfile()
      if (!conn) throw new Error(t('actions.errors.noConnectionToDisconnect'))
      await useConnectionsStore.getState().disconnect(conn.id)
    }
  },
  {
    id: APP_ACTION.SWITCH_CONNECTION,
    title: t('actions.switchConnection.title'),
    description: t('actions.switchConnection.description'),
    kind: 'navigation',
    params: { connection: { type: 'string', required: true, description: 'Saved connection name or id' } },
    run: async (p) => {
      const state = useConnectionsStore.getState()
      const conn = resolveConnection(state.connections, str(p.connection))
      if (!conn) throw new Error(t('actions.errors.noMatchingConnection'))
      if (state.connectedIds.has(conn.id)) {
        state.setActiveConnection(conn.id)
      } else {
        const res = await useConnectionsStore.getState().connect(conn.id)
        if (!res.success) throw new Error(res.error ?? t('actions.errors.couldntConnect', { name: conn.name }))
      }
    }
  },

  // ── Result actions ──────────────────────────────────────────────────────
  {
    id: APP_ACTION.EXPORT_RESULTS,
    title: t('actions.exportResults.title'),
    description: t('actions.exportResults.description'),
    kind: 'navigation',
    params: { format: { type: 'string', description: 'csv or json (defaults to csv)' } },
    run: async (p) => {
      const format = (str(p.format) ?? 'csv').toLowerCase()
      if (format !== 'csv' && format !== 'json') throw new Error(t('actions.errors.formatMustBe'))
      const results = activeQueryResults()
      if (!results) throw new Error(t('actions.errors.noResultsToExport'))
      const fields = results.fields.map((f) => f.name)
      await ipc.invoke(IPC_CHANNELS.EXPORT_QUERY_RESULT, results.rows, fields, format)
    }
  },
  {
    id: APP_ACTION.OPEN_CHART,
    title: t('actions.openChart.title'),
    description: t('actions.openChart.description'),
    kind: 'navigation',
    run: () => {
      const results = activeQueryResults()
      if (!results) throw new Error(t('actions.errors.noResultsToChart'))
      if (results.fields.length < 2 || results.rows.length === 0) {
        throw new Error(t('actions.errors.needColumnsToChart'))
      }
      const ui = useUiStore.getState()
      if (!(ui.bottomDockActivePanel === BOTTOM_PANEL.CHART && ui.bottomDockVisible)) {
        ui.setBottomDockActivePanel(BOTTOM_PANEL.CHART)
      }
    }
  },

  // ── Schema navigation ───────────────────────────────────────────────────
  {
    id: APP_ACTION.FOCUS_TABLE,
    title: t('actions.focusTable.title'),
    description: t('actions.focusTable.description'),
    kind: 'navigation',
    params: {
      table: { type: 'string', required: true, description: 'Table name' },
      schema: { type: 'string', description: 'Schema name (defaults to the connection default)' },
      column: { type: 'string', description: 'Column to reveal under the table' }
    },
    run: async (p) => {
      const table = str(p.table)
      if (!table) throw new Error(t('actions.errors.provideTable'))
      const { connectedIds } = useConnectionsStore.getState()
      const conn = getActiveProfile()
      if (!conn) throw new Error(t('actions.errors.noActiveConnection'))
      if (!connectedIds.has(conn.id)) throw new Error(t('actions.errors.notConnected', { name: conn.name }))
      const schema = await resolveSchema(conn, str(p.schema))
      const ui = useUiStore.getState()
      if (!(ui.activePanel === ACTIVITY_PANEL.EXPLORER && ui.sidebarVisible)) ui.setActivePanel(ACTIVITY_PANEL.EXPLORER)
      // Expand the ancestor nodes so the table row renders. Cover both the
      // database-qualified and flat key shapes — an unused key is harmless.
      if (conn.database) {
        ui.expandTreeNode(`db:${conn.id}:${conn.database}`)
        ui.expandTreeNode(`schema:${conn.id}:${conn.database}:${schema}`)
      }
      ui.expandTreeNode(`schema:${conn.id}:${schema}`)
      if (str(p.column)) ui.expandTreeNode(`table:${conn.id}:${schema}:${table}`)
      useSelectionStore.getState().setSelection({ kind: 'table', connectionId: conn.id, schema, table })
    }
  },
  {
    id: APP_ACTION.OPEN_ER_DIAGRAM,
    title: t('actions.openErDiagram.title'),
    description: t('actions.openErDiagram.description'),
    kind: 'navigation',
    params: {
      schema: { type: 'string', description: 'Schema name (defaults to the connection default)' },
      table: { type: 'string', description: 'Table to select/focus in the diagram' }
    },
    run: async (p) => {
      const { connectedIds } = useConnectionsStore.getState()
      const conn = getActiveProfile()
      if (!conn) throw new Error(t('actions.errors.noActiveConnection'))
      if (!connectedIds.has(conn.id)) throw new Error(t('actions.errors.notConnectedEr', { name: conn.name }))
      const schema = (await resolveSchema(conn, str(p.schema))) || ''
      useTabsStore.getState().openErDiagram(conn.id, schema)
      const table = str(p.table)
      if (table) useSelectionStore.getState().setSelection({ kind: 'erNode', connectionId: conn.id, schema, table })
    }
  },

  // ── Plugins ─────────────────────────────────────────────────────────────
  {
    id: APP_ACTION.OPEN_INSTALL_PLUGIN,
    title: t('actions.openInstallPlugin.title'),
    description: t('actions.openInstallPlugin.description'),
    kind: 'navigation',
    run: () => { useTabsStore.getState().openInstallPlugin() }
  },

  // ── Onboarding & release notes ──────────────────────────────────────────
  {
    id: APP_ACTION.OPEN_WELCOME,
    title: t('actions.openWelcome.title'),
    description: t('actions.openWelcome.description'),
    kind: 'navigation',
    run: () => { useTabsStore.getState().openWelcome() }
  },
  {
    id: APP_ACTION.OPEN_RELEASE_NOTES,
    title: t('actions.openReleaseNotes.title'),
    description: t('actions.openReleaseNotes.description'),
    kind: 'navigation',
    params: { version: { type: 'string', description: 'Version to show; defaults to the latest' } },
    run: (p) => {
      const version = str(p.version)
      const note = version ? getReleaseNote(version) : getLatestReleaseNote()
      if (note) useTabsStore.getState().openReleaseNotes(note.version)
    }
  }
]

let registered = false

/** Idempotently register the built-in app actions. Call once at startup. */
export function registerBuiltinAppActions(): void {
  if (registered) return
  registered = true
  for (const action of BUILTINS) appActions.register(action)
}
