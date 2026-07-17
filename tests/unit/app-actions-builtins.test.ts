// Fills the gap in tests/unit/app-actions-open-settings.test.ts, which only
// exercises OPEN_SETTINGS. The other ~20 builtins — query-tab/editor actions,
// connection lifecycle, result actions, and schema navigation — carry real
// validation and error-path logic (missing args, no active connection, not
// connected, empty results) that had zero coverage.
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { registerBuiltinAppActions } from '../../src/renderer/src/lib/app-actions/builtins'
import { appActions } from '../../src/renderer/src/lib/app-actions/registry'
import { APP_ACTION } from '../../src/renderer/src/lib/app-actions/ids'
import { useUiStore, SECONDARY_PANEL, BOTTOM_PANEL } from '../../src/renderer/src/stores/ui'
import { useTabsStore } from '../../src/renderer/src/stores/tabs'
import { useConnectionsStore } from '../../src/renderer/src/stores/connections'
import { useSchemaStore } from '../../src/renderer/src/stores/schema'
import { useDriverCapabilitiesStore } from '../../src/renderer/src/stores/driver-capabilities'
import { useSelectionStore } from '../../src/renderer/src/stores/selection'
import { editorRegistry } from '../../src/renderer/src/stores/editor'
import { saveQuery, removeSavedQuery } from '../../src/renderer/src/components/saved-queries/SavedQueriesPanel'
import { IPC_CHANNELS } from '@shared/ipc'
import type { ConnectionProfile } from '@shared/types'
import type { QueryTab } from '@shared/types'

const invoke = vi.fn()

beforeEach(() => {
  for (const a of appActions.list()) appActions.unregister?.(a.id)
  registerBuiltinAppActions()
  invoke.mockReset().mockResolvedValue(undefined)
  // @ts-expect-error test override
  globalThis.window.electronAPI = { invoke, on: vi.fn(() => () => {}) }
  useUiStore.setState({
    activePanel: 'explorer', sidebarVisible: true,
    secondaryActivePanel: null, secondarySidebarVisible: false,
    bottomDockActivePanel: BOTTOM_PANEL.RESULTS, bottomDockVisible: false,
    expandedTreeNodes: new Set(),
  } as never)
  useTabsStore.setState({ tabs: [], activeTabId: null })
  useConnectionsStore.setState({ connections: [], activeConnectionId: null, connectedIds: new Set(), loading: false })
  useSelectionStore.setState({ selection: null })
  editorRegistry.unregister('tab-1')
})

function run(id: string, params: Record<string, unknown> = {}) {
  return appActions.run(id, params)
}

describe('NEW_QUERY_TAB', () => {
  it('opens a query tab against the active connection', async () => {
    useConnectionsStore.setState({ activeConnectionId: 'c1' })
    await run(APP_ACTION.NEW_QUERY_TAB, {})
    const { tabs } = useTabsStore.getState()
    expect(tabs).toHaveLength(1)
    expect((tabs[0] as QueryTab).connectionId).toBe('c1')
  })

  it('defaults to an empty buffer when no sql param is given', async () => {
    await run(APP_ACTION.NEW_QUERY_TAB, {})
    expect((useTabsStore.getState().tabs[0] as QueryTab).sql).toBe('')
  })

  // BUG: the action declares `sql` as "SQL to pre-fill" and forwards it as
  // addQueryTab's SECOND positional argument — but that parameter is
  // `schema`, not sql (see stores/tabs.ts `addQueryTab(connectionId, schema,
  // opts)` / `createQueryTab`, which always hardcodes the new tab's `sql: ''`).
  // The result: a `new_query_tab` app-action/AI chip with a `sql` param opens
  // an EMPTY editor and silently corrupts the tab's `schema` field with the
  // SQL text instead. Documented as current behaviour, not fixed here.
  it('BUG: the `sql` param does not pre-fill the tab body — it overwrites `schema` instead', async () => {
    await run(APP_ACTION.NEW_QUERY_TAB, { sql: 'SELECT 1' })
    const tab = useTabsStore.getState().tabs[0] as QueryTab
    expect(tab.sql).toBe('') // should be 'SELECT 1' per the action's own param description
    expect(tab.schema).toBe('SELECT 1') // the SQL text lands in the wrong field
  })
})

describe('OPEN_SAVED_QUERY', () => {
  it('throws when no query name/id is given', async () => {
    await expect(run(APP_ACTION.OPEN_SAVED_QUERY, {})).rejects.toThrow(/provide/i)
  })

  it('throws when the name does not match any saved query', async () => {
    await expect(run(APP_ACTION.OPEN_SAVED_QUERY, { query: 'nope-at-all' })).rejects.toThrow(/no saved query/i)
  })

  it('opens a matching saved query pre-filled, by name', async () => {
    const id = saveQuery({ name: 'Top Users', sql: 'SELECT * FROM users ORDER BY score DESC' })
    try {
      await run(APP_ACTION.OPEN_SAVED_QUERY, { query: 'top users' })
      const tab = useTabsStore.getState().tabs[0] as QueryTab
      expect(tab.sql).toBe('SELECT * FROM users ORDER BY score DESC')
      expect(tab.title).toBe('Top Users')
    } finally {
      removeSavedQuery(id)
    }
  })
})

describe('OPEN_SECONDARY_PANEL', () => {
  it('is a no-op when no id param is given (never crashes on a missing required param)', async () => {
    await run(APP_ACTION.OPEN_SECONDARY_PANEL, {})
    expect(useUiStore.getState().secondaryActivePanel).toBeNull()
  })

  it('sets the requested secondary panel', async () => {
    await run(APP_ACTION.OPEN_SECONDARY_PANEL, { id: SECONDARY_PANEL.CONNECTIONS })
    expect(useUiStore.getState().secondaryActivePanel).toBe(SECONDARY_PANEL.CONNECTIONS)
  })
})

describe('OPEN_NOTIFICATIONS', () => {
  it('opens the notifications panel when the secondary sidebar is closed', async () => {
    await run(APP_ACTION.OPEN_NOTIFICATIONS, {})
    expect(useUiStore.getState().secondaryActivePanel).toBe(SECONDARY_PANEL.NOTIFICATIONS)
  })

  it('is idempotent when notifications are already the visible secondary panel (avoids a redundant re-render/toggle)', async () => {
    useUiStore.setState({ secondaryActivePanel: SECONDARY_PANEL.NOTIFICATIONS, secondarySidebarVisible: true })
    const spy = vi.spyOn(useUiStore.getState(), 'setSecondaryActivePanel')
    await run(APP_ACTION.OPEN_NOTIFICATIONS, {})
    expect(spy).not.toHaveBeenCalled()
  })
})

describe('CONNECT_DATABASE / DISCONNECT_DATABASE / SWITCH_CONNECTION', () => {
  const profile = { id: 'c1', name: 'Prod', type: 'postgresql', database: 'app' } as ConnectionProfile

  it('CONNECT_DATABASE throws when the named connection does not exist', async () => {
    await expect(run(APP_ACTION.CONNECT_DATABASE, { connection: 'ghost' })).rejects.toThrow(/no matching/i)
  })

  it('CONNECT_DATABASE surfaces the store error when connect() fails', async () => {
    useConnectionsStore.setState({
      connections: [profile],
      connect: vi.fn().mockResolvedValue({ success: false, error: 'auth failed' }),
    })
    await expect(run(APP_ACTION.CONNECT_DATABASE, { connection: 'Prod' })).rejects.toThrow('auth failed')
  })

  it('CONNECT_DATABASE succeeds silently when connect() reports success', async () => {
    useConnectionsStore.setState({ connections: [profile], connect: vi.fn().mockResolvedValue({ success: true }) })
    await expect(run(APP_ACTION.CONNECT_DATABASE, { connection: 'c1' })).resolves.toBeUndefined()
  })

  it('DISCONNECT_DATABASE defaults to the active connection when none is named', async () => {
    const disconnect = vi.fn().mockResolvedValue(undefined)
    useConnectionsStore.setState({ connections: [profile], activeConnectionId: 'c1', disconnect })
    await run(APP_ACTION.DISCONNECT_DATABASE, {})
    expect(disconnect).toHaveBeenCalledWith('c1')
  })

  it('DISCONNECT_DATABASE throws when there is nothing to disconnect', async () => {
    await expect(run(APP_ACTION.DISCONNECT_DATABASE, {})).rejects.toThrow(/no connection to disconnect/i)
  })

  it('SWITCH_CONNECTION just activates an already-connected profile without reconnecting', async () => {
    const connect = vi.fn()
    useConnectionsStore.setState({ connections: [profile], connectedIds: new Set(['c1']), connect })
    await run(APP_ACTION.SWITCH_CONNECTION, { connection: 'c1' })
    expect(useConnectionsStore.getState().activeConnectionId).toBe('c1')
    expect(connect).not.toHaveBeenCalled()
  })

  it('SWITCH_CONNECTION connects first when the profile is not yet connected', async () => {
    const connect = vi.fn().mockResolvedValue({ success: true })
    useConnectionsStore.setState({ connections: [profile], connectedIds: new Set(), connect })
    await run(APP_ACTION.SWITCH_CONNECTION, { connection: 'c1' })
    expect(connect).toHaveBeenCalledWith('c1')
  })

  it('SWITCH_CONNECTION surfaces a failed connect attempt', async () => {
    const connect = vi.fn().mockResolvedValue({ success: false })
    useConnectionsStore.setState({ connections: [profile], connectedIds: new Set(), connect })
    await expect(run(APP_ACTION.SWITCH_CONNECTION, { connection: 'c1' })).rejects.toThrow(/couldn't connect/i)
  })
})

describe('EXPORT_RESULTS', () => {
  const queryTab: QueryTab = {
    id: 'q1', type: 'query', title: 'Q', connectionId: 'c1', database: null, schema: null,
    sql: '', results: { rows: [{ a: 1 }], fields: [{ name: 'a', dataType: 'int', nullable: false }], rowCount: 1, duration: 1 } as never,
    isExecuting: false, error: null, isDirty: false, aiExplanation: null,
  }

  it('throws for an unsupported format', async () => {
    useTabsStore.setState({ tabs: [queryTab], activeTabId: 'q1' })
    await expect(run(APP_ACTION.EXPORT_RESULTS, { format: 'xml' })).rejects.toThrow(/must be/i)
  })

  it('throws when there is nothing to export', async () => {
    await expect(run(APP_ACTION.EXPORT_RESULTS, {})).rejects.toThrow(/no query results/i)
  })

  it('defaults to csv and exports the active tab field list + rows', async () => {
    useTabsStore.setState({ tabs: [queryTab], activeTabId: 'q1' })
    await run(APP_ACTION.EXPORT_RESULTS, {})
    expect(invoke).toHaveBeenCalledWith(IPC_CHANNELS.EXPORT_QUERY_RESULT, [{ a: 1 }], ['a'], 'csv')
  })
})

describe('OPEN_CHART', () => {
  const oneColTab: QueryTab = {
    id: 'q1', type: 'query', title: 'Q', connectionId: 'c1', database: null, schema: null, sql: '',
    results: { rows: [{ a: 1 }], fields: [{ name: 'a', dataType: 'int', nullable: false }], rowCount: 1, duration: 1 } as never,
    isExecuting: false, error: null, isDirty: false, aiExplanation: null,
  }
  const twoColTab: QueryTab = {
    ...oneColTab,
    results: {
      rows: [{ a: 1, b: 2 }],
      fields: [{ name: 'a', dataType: 'int', nullable: false }, { name: 'b', dataType: 'int', nullable: false }],
      rowCount: 1, duration: 1,
    } as never,
  }

  it('throws when there are no results at all', async () => {
    await expect(run(APP_ACTION.OPEN_CHART, {})).rejects.toThrow(/no query results/i)
  })

  it('throws when the results have fewer than two columns (nothing to plot)', async () => {
    useTabsStore.setState({ tabs: [oneColTab], activeTabId: 'q1' })
    await expect(run(APP_ACTION.OPEN_CHART, {})).rejects.toThrow(/columns/i)
  })

  it('opens the chart panel for a chartable result set', async () => {
    useTabsStore.setState({ tabs: [twoColTab], activeTabId: 'q1' })
    await run(APP_ACTION.OPEN_CHART, {})
    expect(useUiStore.getState().bottomDockActivePanel).toBe(BOTTOM_PANEL.CHART)
  })
})

describe('FOCUS_TABLE', () => {
  const profile = { id: 'c1', name: 'Prod', type: 'postgresql', database: 'app' } as ConnectionProfile

  it('throws when no table param is given', async () => {
    await expect(run(APP_ACTION.FOCUS_TABLE, {})).rejects.toThrow(/provide/i)
  })

  it('throws when there is no active connection', async () => {
    await expect(run(APP_ACTION.FOCUS_TABLE, { table: 'users' })).rejects.toThrow(/no active connection/i)
  })

  it('throws when the active connection is not actually connected', async () => {
    useConnectionsStore.setState({ connections: [profile], activeConnectionId: 'c1', connectedIds: new Set() })
    await expect(run(APP_ACTION.FOCUS_TABLE, { table: 'users' })).rejects.toThrow(/not connected/i)
  })

  it('resolves the schema and selects the table when connected', async () => {
    useConnectionsStore.setState({ connections: [profile], activeConnectionId: 'c1', connectedIds: new Set(['c1']) })
    useSchemaStore.setState({ fetchSchemas: vi.fn().mockResolvedValue(['public']) } as never)
    useDriverCapabilitiesStore.setState({ fetch: vi.fn().mockResolvedValue({}) } as never)
    await run(APP_ACTION.FOCUS_TABLE, { table: 'users', schema: 'public' })
    expect(useSelectionStore.getState().selection).toEqual({ kind: 'table', connectionId: 'c1', schema: 'public', table: 'users' })
  })
})

describe('OPEN_ER_DIAGRAM', () => {
  const profile = { id: 'c1', name: 'Prod', type: 'postgresql', database: 'app' } as ConnectionProfile

  it('throws when there is no active connection', async () => {
    await expect(run(APP_ACTION.OPEN_ER_DIAGRAM, {})).rejects.toThrow(/no active connection/i)
  })

  it('throws when the active connection is not connected', async () => {
    useConnectionsStore.setState({ connections: [profile], activeConnectionId: 'c1', connectedIds: new Set() })
    await expect(run(APP_ACTION.OPEN_ER_DIAGRAM, {})).rejects.toThrow(/not connected/i)
  })

  it('opens the diagram and selects the given table node', async () => {
    useConnectionsStore.setState({ connections: [profile], activeConnectionId: 'c1', connectedIds: new Set(['c1']) })
    useSchemaStore.setState({ fetchSchemas: vi.fn().mockResolvedValue(['public']) } as never)
    useDriverCapabilitiesStore.setState({ fetch: vi.fn().mockResolvedValue({}) } as never)
    await run(APP_ACTION.OPEN_ER_DIAGRAM, { schema: 'public', table: 'users' })
    expect(useSelectionStore.getState().selection).toEqual({ kind: 'erNode', connectionId: 'c1', schema: 'public', table: 'users' })
  })
})

describe('FORMAT_EDITOR', () => {
  it('throws when there is no active editor', async () => {
    await expect(run(APP_ACTION.FORMAT_EDITOR, {})).rejects.toThrow(/no active editor/i)
  })

  it('is a no-op for an empty buffer', async () => {
    const executeEdits = vi.fn()
    editorRegistry.register({
      tabId: 'tab-1',
      monaco: {} as never,
      editor: {
        getModel: () => ({ getValue: () => '   ', getLanguageId: () => 'sql', getFullModelRange: () => ({}) }),
        executeEdits, focus: vi.fn(),
      } as never,
    })
    await run(APP_ACTION.FORMAT_EDITOR, {})
    expect(executeEdits).not.toHaveBeenCalled()
    expect(invoke).not.toHaveBeenCalled()
  })

  it('applies the formatted text as a full-range edit when the formatter reports a change', async () => {
    invoke.mockResolvedValueOnce({ formatted: 'SELECT\n  1', changed: true })
    const executeEdits = vi.fn()
    const focus = vi.fn()
    editorRegistry.register({
      tabId: 'tab-1',
      monaco: {} as never,
      editor: {
        getModel: () => ({ getValue: () => 'select 1', getLanguageId: () => 'sql', getFullModelRange: () => ({ startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 9 }) }),
        executeEdits, focus,
      } as never,
    })
    await run(APP_ACTION.FORMAT_EDITOR, {})
    expect(executeEdits).toHaveBeenCalledWith('format-document', [
      { range: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 9 }, text: 'SELECT\n  1' },
    ])
    expect(focus).toHaveBeenCalled()
  })
})

describe('INSERT_INTO_EDITOR', () => {
  it('throws when no sql param is given', async () => {
    await expect(run(APP_ACTION.INSERT_INTO_EDITOR, {})).rejects.toThrow(/provide/i)
  })

  it('throws when there is no active editor', async () => {
    await expect(run(APP_ACTION.INSERT_INTO_EDITOR, { sql: 'SELECT 1' })).rejects.toThrow(/no active/i)
  })

  it('inserts at the current selection when there is one', async () => {
    const executeEdits = vi.fn()
    const selectionRange = { startLineNumber: 2, startColumn: 1, endLineNumber: 2, endColumn: 5 }
    editorRegistry.register({
      tabId: 'tab-1',
      monaco: {} as never,
      editor: {
        getSelection: () => selectionRange,
        getPosition: () => ({ lineNumber: 2, column: 5 }),
        getModel: () => ({ getFullModelRange: () => ({}) }),
        executeEdits, focus: vi.fn(),
      } as never,
    })
    await run(APP_ACTION.INSERT_INTO_EDITOR, { sql: 'x' })
    expect(executeEdits).toHaveBeenCalledWith('ai-insert', [{ range: selectionRange, text: 'x', forceMoveMarkers: true }])
  })

  it('falls back to a zero-width range at the cursor position when there is no selection', async () => {
    const executeEdits = vi.fn()
    editorRegistry.register({
      tabId: 'tab-1',
      monaco: {} as never,
      editor: {
        getSelection: () => null,
        getPosition: () => ({ lineNumber: 3, column: 7 }),
        getModel: () => ({ getFullModelRange: () => ({}) }),
        executeEdits, focus: vi.fn(),
      } as never,
    })
    await run(APP_ACTION.INSERT_INTO_EDITOR, { sql: 'y' })
    expect(executeEdits).toHaveBeenCalledWith('ai-insert', [
      { range: { startLineNumber: 3, startColumn: 7, endLineNumber: 3, endColumn: 7 }, text: 'y', forceMoveMarkers: true },
    ])
  })
})

describe('OPEN_RELEASE_NOTES', () => {
  it('opens the latest release note when no version is given', async () => {
    await run(APP_ACTION.OPEN_RELEASE_NOTES, {})
    expect(useTabsStore.getState().tabs.some((t) => t.type === 'release-notes')).toBe(true)
  })

  it('is a silent no-op for a version with no authored note', async () => {
    await run(APP_ACTION.OPEN_RELEASE_NOTES, { version: '0.0.0-does-not-exist' })
    expect(useTabsStore.getState().tabs).toHaveLength(0)
  })
})
