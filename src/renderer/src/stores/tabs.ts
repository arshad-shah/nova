import { create } from 'zustand'
import type { Tab, QueryTab, QueryTabTxnState, QueryResult, PlanNode, ConnectionFormTab, PluginDetailTab, InstallPluginTab, SettingsTab, WelcomeTab, ReleaseNotesTab } from '@shared/types'
import { IPC_CHANNELS } from '@shared/ipc'
import { useSelectionStore } from './selection'
import { useUiStore } from './ui'
import type { SettingsCategoryId } from '@/lib/settings-categories'
import { t } from '@shared/i18n'
import { ipc } from '@/platform/client'

let tabCounter = 0

/** Release any pinned DB session for a closed query tab. The main-process
 *  handler is a tolerant no-op when the tab never opened a session, so this is
 *  always safe. Fire-and-forget; cleanup must never block tab close. */
function releaseTabSession(tab: Tab): void {
  if (tab.type === 'query' && tab.connectionId) {
    ipc.optional(IPC_CHANNELS.DB_SESSION_CLOSE, tab.connectionId, tab.id)?.catch(() => {})
  }
}

function createQueryTab(connectionId: string | null, schema: string | null = null, opts?: { autoCommit?: boolean }): QueryTab {
  tabCounter++
  return {
    id: `query-${tabCounter}-${Date.now()}`,
    type: 'query',
    title: t('shell.tabs.queryTitle', { n: tabCounter }),
    connectionId,
    database: null,
    schema,
    sql: '',
    results: null,
    isExecuting: false,
    error: null,
    isDirty: false,
    aiExplanation: null,
    txn: { autoCommit: opts?.autoCommit ?? true, status: 'none', readOnly: false },
  }
}

/** Patch the query tab with `id`; non-matching and non-query tabs are untouched.
 *  Collapses the otherwise-identical per-field setters into one shape. */
function patchQueryTab(tabs: Tab[], id: string, patch: Partial<QueryTab>): Tab[] {
  return tabs.map((t) => (t.id === id && t.type === 'query' ? { ...t, ...patch } : t))
}

/** Patch the transaction sub-state of the query tab with `id` (no-op if it has
 *  no open txn record). */
function patchTabTxn(tabs: Tab[], id: string, patch: Partial<QueryTabTxnState>): Tab[] {
  return tabs.map((t) =>
    t.id === id && t.type === 'query' && t.txn ? { ...t, txn: { ...t.txn, ...patch } } : t,
  )
}

const MAX_RECENTLY_CLOSED = 10

/** Minimal, serialisable shape of a query tab — what we persist for
 *  restore-on-startup. Transient runtime state (results, execution, txn status)
 *  is intentionally dropped; restored tabs come back clean and idle. */
export interface QueryTabSnapshot {
  /** Stable tab id. When present (restoring from the persistence engine) it's
   *  reused so the restored tab keeps its identity for incremental persistence;
   *  when absent (legacy/migration) a fresh id is generated. */
  id?: string
  title: string
  sql: string
  connectionId: string | null
  database: string | null
  schema: string | null
  savedQueryId?: string
  autoCommit: boolean
}

interface TabsState {
  tabs: Tab[]
  activeTabId: string | null
  recentlyClosed: Tab[]
  addQueryTab: (connectionId: string | null, schema?: string | null, opts?: { autoCommit?: boolean }) => string
  closeTab: (id: string) => void
  closeOtherTabs: (id: string) => void
  closeTabsToRight: (id: string) => void
  closeAllTabs: () => void
  setActiveTab: (id: string) => void
  updateTabSql: (id: string, sql: string) => void
  setTabDirty: (id: string, dirty: boolean) => void
  /** Marks the tab as saved: records the current sql as the saved snapshot,
   *  optionally updating title/savedQueryId. Subsequent edits dirty the tab
   *  again automatically; reverting to this exact text clears the flag. */
  markTabSaved: (id: string, opts?: { title?: string; savedQueryId?: string }) => void
  setTabConnection: (id: string, connectionId: string) => void
  setTabDatabase: (id: string, database: string) => void
  setTabSchema: (id: string, schema: string) => void
  setTabExecuting: (id: string, executing: boolean) => void
  setTabResults: (id: string, results: QueryResult) => void
  /** Store the driver-parsed execution plan for the tab's current results. */
  setTabQueryPlan: (id: string, plan: PlanNode[]) => void
  setTabError: (id: string, error: string) => void
  setTabAiExplanation: (id: string, explanation: string | null) => void
  setTabAutoCommit: (id: string, autoCommit: boolean) => void
  setTabTxnStatus: (id: string, status: 'none' | 'active') => void
  setTabIsolation: (id: string, isolationLevel: string) => void
  setTabReadOnly: (id: string, readOnly: boolean) => void
  openErDiagram: (connectionId: string, schema: string) => string
  openTableData: (connectionId: string, tableName: string, schema: string) => string
  openConnectionForm: (editingId?: string) => string
  openPluginDetail: (pluginName: string, displayName: string) => string
  openInstallPlugin: () => string
  /** Open the settings tab, optionally focusing a specific category. */
  openSettings: (category?: SettingsCategoryId) => string
  /** Open (or focus) the first-run Welcome / Get Started walkthrough tab. */
  openWelcome: () => string
  /** Open (or focus) the "What's New" tab for a version. One tab per version;
   *  the tab title is the version itself (e.g. "v1.2.0"). */
  openReleaseNotes: (version: string) => string
  reorderTabs: (fromIndex: number, toIndex: number) => void
  duplicateTab: (id: string) => string | null
  reopenTab: () => void
  /** Re-create query tabs from a persisted snapshot at boot. Restored tabs are
   *  clean (savedSnapshot === sql) and idle. `activeIndex` selects which one is
   *  focused, falling back to the first. */
  restoreQueryTabs: (snapshots: QueryTabSnapshot[], activeIndex: number | null) => void
  /** Called when a connection profile is deleted. Query tabs lose their
   *  pointer so the next execute lands in the "pick a connection" state
   *  instead of failing silently against a gone profile. ER-diagram and
   *  table tabs target one specific connection — they're closed outright. */
  detachConnection: (connectionId: string) => void
}

export const useTabsStore = create<TabsState>((set, get) => ({
  tabs: [],
  activeTabId: null,
  recentlyClosed: [],

  addQueryTab: (connectionId, schema = null, opts?) => {
    const tab = createQueryTab(connectionId, schema, opts)
    set((s) => ({
      tabs: [...s.tabs, tab],
      activeTabId: tab.id
    }))
    return tab.id
  },

  closeTab: (id) => {
    set((s) => {
      const closedTab = s.tabs.find(t => t.id === id)
      const remaining = s.tabs.filter(t => t.id !== id)
      let nextActive = s.activeTabId
      if (s.activeTabId === id) {
        const idx = s.tabs.findIndex(t => t.id === id)
        nextActive = remaining[Math.min(idx, remaining.length - 1)]?.id ?? null
      }
      if (closedTab) releaseTabSession(closedTab)
      return {
        tabs: remaining,
        activeTabId: nextActive,
        recentlyClosed: closedTab
          ? [closedTab, ...s.recentlyClosed].slice(0, MAX_RECENTLY_CLOSED)
          : s.recentlyClosed
      }
    })
    useSelectionStore.getState().clearForTab(id)
  },

  closeOtherTabs: (id) => {
    set((s) => {
      const kept = s.tabs.filter(t => t.id === id)
      const closed = s.tabs.filter(t => t.id !== id)
      for (const tab of closed) releaseTabSession(tab)
      return {
        tabs: kept,
        activeTabId: id,
        recentlyClosed: [...closed.reverse(), ...s.recentlyClosed].slice(0, MAX_RECENTLY_CLOSED)
      }
    })
  },

  closeTabsToRight: (id) => {
    set((s) => {
      const idx = s.tabs.findIndex(t => t.id === id)
      if (idx === -1) return s
      const kept = s.tabs.slice(0, idx + 1)
      const closed = s.tabs.slice(idx + 1)
      for (const tab of closed) releaseTabSession(tab)
      const nextActive = kept.find(t => t.id === s.activeTabId) ? s.activeTabId : id
      return {
        tabs: kept,
        activeTabId: nextActive,
        recentlyClosed: [...closed.reverse(), ...s.recentlyClosed].slice(0, MAX_RECENTLY_CLOSED)
      }
    })
  },

  closeAllTabs: () => {
    set((s) => {
      for (const tab of s.tabs) releaseTabSession(tab)
      return {
        tabs: [],
        activeTabId: null,
        recentlyClosed: [...[...s.tabs].reverse(), ...s.recentlyClosed].slice(0, MAX_RECENTLY_CLOSED)
      }
    })
  },

  setActiveTab: (id) => set({ activeTabId: id }),

  updateTabSql: (id, sql) => {
    set((s) => ({
      tabs: s.tabs.map(t => {
        if (t.id !== id || t.type !== 'query') return t
        // Dirty is derived: true iff content drifted from the saved snapshot.
        // For never-saved tabs we treat the empty string as the baseline so a
        // fresh tab starts clean and dirties on the first keystroke.
        const baseline = t.savedSnapshot ?? ''
        return { ...t, sql, isDirty: sql !== baseline }
      })
    }))
  },

  setTabDirty: (id, dirty) => set((s) => ({ tabs: patchQueryTab(s.tabs, id, { isDirty: dirty }) })),

  markTabSaved: (id, opts) => {
    set((s) => ({
      tabs: s.tabs.map(t => {
        if (t.id !== id || t.type !== 'query') return t
        return {
          ...t,
          savedSnapshot: t.sql,
          isDirty: false,
          ...(opts?.title ? { title: opts.title } : {}),
          ...(opts?.savedQueryId ? { savedQueryId: opts.savedQueryId } : {})
        }
      })
    }))
  },

  setTabConnection: (id, connectionId) => set((s) => ({ tabs: patchQueryTab(s.tabs, id, { connectionId }) })),

  setTabDatabase: (id, database) => set((s) => ({ tabs: patchQueryTab(s.tabs, id, { database }) })),

  setTabSchema: (id, schema) => set((s) => ({ tabs: patchQueryTab(s.tabs, id, { schema }) })),

  setTabExecuting: (id, executing) => set((s) => ({
    // Clear any prior error when starting a run, but leave it on completion.
    tabs: patchQueryTab(s.tabs, id, { isExecuting: executing, ...(executing ? { error: null } : {}) }),
  })),

  setTabResults: (id, results) => set((s) => ({
    // queryPlan is cleared here and re-populated asynchronously by the driver
    // (db:parse-plan) once new results land, so a stale plan never lingers.
    tabs: patchQueryTab(s.tabs, id, { results, isExecuting: false, error: null, isDirty: false, aiExplanation: null, queryPlan: null }),
  })),

  setTabQueryPlan: (id, plan) => set((s) => ({ tabs: patchQueryTab(s.tabs, id, { queryPlan: plan }) })),

  setTabError: (id, error) => set((s) => ({ tabs: patchQueryTab(s.tabs, id, { error, isExecuting: false }) })),

  setTabAiExplanation: (id, explanation) => set((s) => ({ tabs: patchQueryTab(s.tabs, id, { aiExplanation: explanation }) })),

  setTabAutoCommit: (id, autoCommit) => set((s) => ({ tabs: patchTabTxn(s.tabs, id, { autoCommit }) })),

  setTabTxnStatus: (id, status) => set((s) => ({ tabs: patchTabTxn(s.tabs, id, { status }) })),

  setTabIsolation: (id, isolationLevel) => set((s) => ({ tabs: patchTabTxn(s.tabs, id, { isolationLevel }) })),

  setTabReadOnly: (id, readOnly) => set((s) => ({ tabs: patchTabTxn(s.tabs, id, { readOnly }) })),

  openErDiagram: (connectionId: string, schema: string) => {
    const id = `er-${connectionId}-${schema}`
    const existing = get().tabs.find(t => t.id === id)
    if (existing) {
      set({ activeTabId: id })
      return id
    }
    const tab: import('@shared/types').ErDiagramTab = {
      id,
      type: 'er-diagram',
      title: t('shell.tabs.erTitle', { schema }),
      connectionId,
      schema
    }
    set((s) => ({
      tabs: [...s.tabs, tab],
      activeTabId: id
    }))
    return id
  },

  openTableData: (connectionId: string, tableName: string, schema: string) => {
    const id = `table-${connectionId}-${schema}-${tableName}`
    const existing = get().tabs.find(t => t.id === id)
    if (existing) {
      set({ activeTabId: id })
      return id
    }
    const tab: import('@shared/types').TableTab = {
      id,
      type: 'table',
      title: tableName,
      connectionId,
      tableName,
      schema,
    }
    set((s) => ({ tabs: [...s.tabs, tab], activeTabId: id }))
    return id
  },

  openConnectionForm: (editingId?: string) => {
    const formId = editingId ? `conn-form-${editingId}` : 'conn-form-new'
    const existing = get().tabs.find(t => t.id === formId)
    if (existing) {
      set({ activeTabId: formId })
      return formId
    }
    const tab: ConnectionFormTab = {
      id: formId,
      type: 'connection-form',
      title: editingId ? t('shell.tabs.editConnection') : t('shell.tabs.newConnection'),
      editingId
    }
    set((s) => ({
      tabs: [...s.tabs, tab],
      activeTabId: tab.id
    }))
    return tab.id
  },

  openPluginDetail: (pluginName: string, displayName: string) => {
    const id = `plugin-${pluginName}`
    const existing = get().tabs.find(t => t.id === id)
    if (existing) {
      set({ activeTabId: id })
      return id
    }
    const tab: PluginDetailTab = {
      id,
      type: 'plugin-detail',
      title: displayName,
      pluginName
    }
    set((s) => ({
      tabs: [...s.tabs, tab],
      activeTabId: id
    }))
    return id
  },

  openInstallPlugin: () => {
    const id = 'install-plugin'
    const existing = get().tabs.find(t => t.id === id)
    if (existing) {
      set({ activeTabId: id })
      return id
    }
    const tab: InstallPluginTab = {
      id,
      type: 'install-plugin',
      title: t('shell.tabs.installPlugin')
    }
    set((s) => ({
      tabs: [...s.tabs, tab],
      activeTabId: id
    }))
    return id
  },

  openSettings: (category) => {
    // Focus the requested category first so the tab opens on it (the body reads
    // useUiStore.activeSettingsCategory). Omitting it preserves the last view.
    if (category) useUiStore.getState().setActiveSettingsCategory(category)
    const id = 'settings'
    const existing = get().tabs.find((t) => t.id === id)
    if (existing) {
      set({ activeTabId: id })
      return id
    }
    const tab: SettingsTab = { id, type: 'settings', title: t('shell.tabs.settings') }
    set((s) => ({ tabs: [...s.tabs, tab], activeTabId: id }))
    return id
  },

  openWelcome: () => {
    const id = 'welcome'
    const existing = get().tabs.find((t) => t.id === id)
    if (existing) {
      set({ activeTabId: id })
      return id
    }
    const tab: WelcomeTab = { id, type: 'welcome', title: t('shell.tabs.welcome') }
    set((s) => ({ tabs: [...s.tabs, tab], activeTabId: id }))
    return id
  },

  openReleaseNotes: (version) => {
    const id = `release-notes-${version}`
    const existing = get().tabs.find((t) => t.id === id)
    if (existing) {
      set({ activeTabId: id })
      return id
    }
    const tab: ReleaseNotesTab = {
      id,
      type: 'release-notes',
      title: t('shell.tabs.releaseNotesTitle', { version }),
      version,
    }
    set((s) => ({ tabs: [...s.tabs, tab], activeTabId: id }))
    return id
  },

  reorderTabs: (fromIndex, toIndex) => {
    set((s) => {
      const tabs = [...s.tabs]
      const [moved] = tabs.splice(fromIndex, 1)
      tabs.splice(toIndex, 0, moved)
      return { tabs }
    })
  },

  duplicateTab: (id) => {
    const tab = get().tabs.find(t => t.id === id)
    if (!tab || tab.type !== 'query') return null
    const newTab = createQueryTab(tab.connectionId, tab.schema)
    newTab.title = `${tab.title} (copy)`
    newTab.database = tab.database
    newTab.sql = tab.sql
    set((s) => {
      const idx = s.tabs.findIndex(t => t.id === id)
      const tabs = [...s.tabs]
      tabs.splice(idx + 1, 0, newTab)
      return { tabs, activeTabId: newTab.id }
    })
    return newTab.id
  },

  reopenTab: () => {
    set((s) => {
      if (s.recentlyClosed.length === 0) return s
      const [tab, ...rest] = s.recentlyClosed
      return {
        tabs: [...s.tabs, tab],
        activeTabId: tab.id,
        recentlyClosed: rest
      }
    })
  },

  restoreQueryTabs: (snapshots, activeIndex) => {
    if (snapshots.length === 0) return
    const restored: QueryTab[] = snapshots.map((s) => {
      tabCounter++
      return {
        id: s.id ?? `query-${tabCounter}-${Date.now()}`,
        type: 'query',
        title: s.title,
        connectionId: s.connectionId,
        database: s.database,
        schema: s.schema,
        sql: s.sql,
        results: null,
        isExecuting: false,
        error: null,
        isDirty: false,
        aiExplanation: null,
        savedSnapshot: s.sql,
        ...(s.savedQueryId ? { savedQueryId: s.savedQueryId } : {}),
        txn: { autoCommit: s.autoCommit, status: 'none', readOnly: false },
      }
    })
    set((state) => {
      const tabs = [...state.tabs, ...restored]
      const active =
        activeIndex != null && restored[activeIndex]
          ? restored[activeIndex].id
          : (state.activeTabId ?? restored[0].id)
      return { tabs, activeTabId: active }
    })
  },

  detachConnection: (connectionId) => {
    set((s) => {
      const nextTabs: Tab[] = []
      for (const t of s.tabs) {
        if (t.type === 'query') {
          if (t.connectionId === connectionId) {
            nextTabs.push({ ...t, connectionId: null, database: null, schema: null })
          } else {
            nextTabs.push(t)
          }
        } else if (t.type === 'er-diagram' || t.type === 'table') {
          // These tabs only make sense in the context of one specific
          // connection — drop them when that connection is gone.
          if (t.connectionId === connectionId) continue
          nextTabs.push(t)
        } else {
          nextTabs.push(t)
        }
      }
      const activeStillThere = nextTabs.some(t => t.id === s.activeTabId)
      return {
        tabs: nextTabs,
        activeTabId: activeStillThere ? s.activeTabId : (nextTabs[0]?.id ?? null),
      }
    })
  }
}))
