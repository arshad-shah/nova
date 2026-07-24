import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useQueryExecution } from '../../../../src/renderer/src/components/query/hooks/useQueryExecution'
import { registerStatementContribution } from '../../../../src/renderer/src/lib/statement-registry'
import type { QueryTab, DatabaseType } from '../../../../shared/types'
import type { DriverCapabilities } from '../../../../src/renderer/src/stores/driver-capabilities'

/**
 * Behavioural tests for `useQueryExecution` — the hook that owns running,
 * cancelling and explaining a query tab's SQL. Exercises the destructive-
 * confirm gate, the transactional session prelude, the timeout race, history
 * recording, and the driver-capability gate on EXPLAIN — not just that IPC
 * fired.
 */

const mockGetSelectedSql = vi.fn<() => string>()
vi.mock('../../../../src/renderer/src/stores/editor', () => ({
  editorRegistry: { getSelectedSql: () => mockGetSelectedSql() },
}))

const mockRecordRunResult = vi.fn()
vi.mock('../../../../src/renderer/src/stores/tab-actions', () => ({
  tabActions: { recordRunResult: (...args: unknown[]) => mockRecordRunResult(...args) },
}))

const mockNotifyError = vi.fn()
vi.mock('../../../../src/renderer/src/lib/notify-error', () => ({
  notifyError: (...args: unknown[]) => mockNotifyError(...args),
}))

const mockSetTabExecuting = vi.fn()
const mockSetTabResults = vi.fn()
const mockSetTabError = vi.fn()
const mockSetTabTxnStatus = vi.fn()
const tabsState = {
  setTabExecuting: mockSetTabExecuting,
  setTabResults: mockSetTabResults,
  setTabError: mockSetTabError,
  setTabTxnStatus: mockSetTabTxnStatus,
}
vi.mock('../../../../src/renderer/src/stores/tabs', () => ({
  useTabsStore: (selector: (s: typeof tabsState) => unknown) => selector(tabsState),
}))

const mockSetBottomDockActivePanel = vi.fn()
vi.mock('../../../../src/renderer/src/stores/ui', () => ({
  BOTTOM_PANEL: { RESULTS: 'results', QUERY_PLAN: 'query-plan', CHART: 'chart' },
  useUiStore: { getState: () => ({ setBottomDockActivePanel: mockSetBottomDockActivePanel }) },
}))

let settingsState = { general: { queryTimeout: 30, confirmDestructiveQueries: true } }
vi.mock('../../../../src/renderer/src/stores/settings', () => ({
  useSettingsStore: (selector: (s: { settings: typeof settingsState }) => unknown) =>
    selector({ settings: settingsState }),
}))

const mockRecordHistory = vi.fn()
vi.mock('../../../../src/renderer/src/stores/query-history', () => ({
  useQueryHistoryStore: { getState: () => ({ record: mockRecordHistory }) },
}))

const mockClearCache = vi.fn()
vi.mock('../../../../src/renderer/src/stores/schema', () => ({
  useSchemaStore: { getState: () => ({ clearCache: mockClearCache }) },
}))

function makeTab(overrides: Partial<QueryTab> = {}): QueryTab {
  return {
    id: 'tab-1',
    type: 'query',
    title: 'Query 1',
    connectionId: 'conn-1',
    database: null,
    schema: null,
    sql: 'SELECT 1',
    results: null,
    isExecuting: false,
    error: null,
    isDirty: false,
    aiExplanation: null,
    ...overrides,
  }
}

const dbType: DatabaseType = 'postgresql'

beforeEach(() => {
  vi.clearAllMocks()
  mockGetSelectedSql.mockReturnValue('')
  settingsState = { general: { queryTimeout: 30, confirmDestructiveQueries: true } }
  registerStatementContribution('sql', {
    splitStatements: () => [],
    lensActions: [],
    classifyDestructive: (sql: string) =>
      /DELETE|DROP/i.test(sql) ? { messageKey: 'query.destructive.generic' } : null,
  })
  Object.defineProperty(window, 'electronAPI', {
    value: { invoke: vi.fn().mockResolvedValue(undefined), on: vi.fn() },
    writable: true,
    configurable: true,
  })
  vi.spyOn(window, 'confirm').mockReturnValue(true)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useQueryExecution.runStatement', () => {
  it('does nothing when the tab has no connection', async () => {
    const tab = makeTab({ connectionId: null })
    const { result } = renderHook(() => useQueryExecution(tab, dbType, null))
    await act(async () => { await result.current.runStatement() })
    expect(window.electronAPI.invoke).not.toHaveBeenCalled()
  })

  it('does nothing when the effective SQL (override, selection, and buffer) is blank', async () => {
    const tab = makeTab({ sql: '   ' })
    mockGetSelectedSql.mockReturnValue('')
    const { result } = renderHook(() => useQueryExecution(tab, dbType, null))
    await act(async () => { await result.current.runStatement('   ') })
    expect(window.electronAPI.invoke).not.toHaveBeenCalled()
  })

  it('prefers the editor selection over the tab buffer when no override is given', async () => {
    const tab = makeTab({ sql: 'SELECT * FROM whole_buffer' })
    mockGetSelectedSql.mockReturnValue('SELECT 1')
    const { result } = renderHook(() => useQueryExecution(tab, dbType, null))
    await act(async () => { await result.current.runStatement() })
    expect(window.electronAPI.invoke).toHaveBeenCalledWith('db:query', 'conn-1', 'SELECT 1', undefined, undefined)
  })

  it('asks for confirmation on a destructive statement and aborts the query when declined', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    const tab = makeTab({ sql: 'DELETE FROM users' })
    const caps = { statementSyntax: 'sql' } as DriverCapabilities
    const { result } = renderHook(() => useQueryExecution(tab, dbType, caps))
    await act(async () => { await result.current.runStatement() })
    expect(window.confirm).toHaveBeenCalled()
    // NOTE: `expect.anything()` never matches `undefined`, and the real call
    // passes `undefined` for the override/txnOpts args — so a `not.toHaveBeenCalledWith`
    // built from all-`anything()` args would trivially pass even if db:query
    // WAS invoked. Assert directly on the channel instead.
    const channels = (window.electronAPI.invoke as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0])
    expect(channels).not.toContain('db:query')
  })

  it('runs the destructive statement once confirmed', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const tab = makeTab({ sql: 'DELETE FROM users' })
    const caps = { statementSyntax: 'sql' } as DriverCapabilities
    const { result } = renderHook(() => useQueryExecution(tab, dbType, caps))
    await act(async () => { await result.current.runStatement() })
    expect(window.electronAPI.invoke).toHaveBeenCalledWith('db:query', 'conn-1', 'DELETE FROM users', undefined, undefined)
  })

  it('does not prompt when confirmDestructiveQueries is disabled in settings', async () => {
    settingsState = { general: { queryTimeout: 30, confirmDestructiveQueries: false } }
    const tab = makeTab({ sql: 'DROP TABLE users' })
    const caps = { statementSyntax: 'sql' } as DriverCapabilities
    const { result } = renderHook(() => useQueryExecution(tab, dbType, caps))
    await act(async () => { await result.current.runStatement() })
    expect(window.confirm).not.toHaveBeenCalled()
    expect(window.electronAPI.invoke).toHaveBeenCalledWith('db:query', 'conn-1', 'DROP TABLE users', undefined, undefined)
  })

  it('does not prompt when the driver has no statementSyntax capability (e.g. not yet loaded)', async () => {
    const tab = makeTab({ sql: 'DELETE FROM users' })
    const { result } = renderHook(() => useQueryExecution(tab, dbType, null))
    await act(async () => { await result.current.runStatement() })
    expect(window.confirm).not.toHaveBeenCalled()
  })

  it('records ok history and per-statement result when run via an override (single statement)', async () => {
    const tab = makeTab()
    const invoke = vi.fn().mockImplementation((channel: string) => {
      if (channel === 'db:query') return Promise.resolve({ rows: [], rowCount: 3, fields: [] })
      return Promise.resolve(undefined)
    })
    Object.defineProperty(window, 'electronAPI', { value: { invoke, on: vi.fn() }, writable: true, configurable: true })
    const { result } = renderHook(() => useQueryExecution(tab, dbType, null))
    await act(async () => { await result.current.runStatement('SELECT 1') })

    expect(mockRecordHistory).toHaveBeenCalledWith(expect.objectContaining({ status: 'ok', rowCount: 3 }))
    expect(mockRecordRunResult).toHaveBeenCalledWith('tab-1', 'SELECT 1', expect.objectContaining({ kind: 'ok', rowCount: 3 }))
    expect(mockSetTabResults).toHaveBeenCalledWith('tab-1', { rows: [], rowCount: 3, fields: [] })
  })

  it('does NOT record a per-statement result for a whole-buffer run (no override)', async () => {
    const tab = makeTab({ sql: 'SELECT 1' })
    const { result } = renderHook(() => useQueryExecution(tab, dbType, null))
    await act(async () => { await result.current.runStatement() })
    expect(mockRecordRunResult).not.toHaveBeenCalled()
  })

  it('surfaces a query error: sets tab error, records failing history, notifies, and records per-statement failure', async () => {
    const tab = makeTab()
    const invoke = vi.fn().mockImplementation((channel: string) => {
      if (channel === 'db:query') return Promise.reject(new Error('syntax error at or near "SELECT"'))
      return Promise.resolve(undefined)
    })
    Object.defineProperty(window, 'electronAPI', { value: { invoke, on: vi.fn() }, writable: true, configurable: true })
    const { result } = renderHook(() => useQueryExecution(tab, dbType, null))
    await act(async () => { await result.current.runStatement('SELECT 1') })

    expect(mockSetTabError).toHaveBeenCalledWith('tab-1', 'syntax error at or near "SELECT"')
    expect(mockRecordHistory).toHaveBeenCalledWith(expect.objectContaining({ status: 'error' }))
    expect(mockRecordRunResult).toHaveBeenCalledWith('tab-1', 'SELECT 1', expect.objectContaining({ kind: 'error' }))
    expect(mockNotifyError).toHaveBeenCalled()
  })

  it('cancels the running query when it times out, and surfaces the timeout error', async () => {
    vi.useFakeTimers()
    settingsState = { general: { queryTimeout: 1, confirmDestructiveQueries: true } }
    const tab = makeTab()
    const invoke = vi.fn().mockImplementation((channel: string) => {
      if (channel === 'db:query') return new Promise(() => {}) // never resolves
      return Promise.resolve(undefined)
    })
    Object.defineProperty(window, 'electronAPI', { value: { invoke, on: vi.fn() }, writable: true, configurable: true })
    const { result } = renderHook(() => useQueryExecution(tab, dbType, null))

    const runPromise = act(async () => {
      const p = result.current.runStatement()
      await vi.advanceTimersByTimeAsync(1000)
      await p
    })
    await runPromise

    expect(mockSetTabError).toHaveBeenCalledWith('tab-1', 'Query timed out after 1s')
    // TIMEOUT-classified errors trigger a best-effort server-side cancel.
    expect(invoke).toHaveBeenCalledWith('db:cancel-query', 'conn-1')
  })

  it('clears the schema cache after a schema-mutating (DDL) statement succeeds', async () => {
    const tab = makeTab({ sql: 'CREATE TABLE foo (id int)' })
    const { result } = renderHook(() => useQueryExecution(tab, dbType, null))
    await act(async () => { await result.current.runStatement() })
    expect(mockClearCache).toHaveBeenCalledWith('conn-1')
  })

  it('does not clear the schema cache after a plain SELECT', async () => {
    const tab = makeTab({ sql: 'SELECT * FROM foo' })
    const { result } = renderHook(() => useQueryExecution(tab, dbType, null))
    await act(async () => { await result.current.runStatement() })
    expect(mockClearCache).not.toHaveBeenCalled()
  })

  it('opens a session and issues an explicit BEGIN before the first query of a manual-commit tab', async () => {
    const tab = makeTab({ txn: { autoCommit: false, status: 'none', readOnly: false } })
    const invoke = vi.fn().mockResolvedValue({ rows: [], rowCount: 0, fields: [] })
    Object.defineProperty(window, 'electronAPI', { value: { invoke, on: vi.fn() }, writable: true, configurable: true })
    const { result } = renderHook(() => useQueryExecution(tab, dbType, null))
    await act(async () => { await result.current.runStatement() })

    const channels = invoke.mock.calls.map((c) => c[0])
    expect(channels).toContain('db:session:open')
    expect(channels).toContain('db:txn:begin')
    expect(channels.indexOf('db:txn:begin')).toBeLessThan(channels.indexOf('db:query'))
    expect(mockSetTabTxnStatus).toHaveBeenCalledWith('tab-1', 'active')
    // The query itself must carry the session id so the driver applies it to
    // the open transaction rather than an ad-hoc connection.
    expect(invoke).toHaveBeenCalledWith('db:query', 'conn-1', 'SELECT 1', undefined, { sessionId: 'tab-1' })
  })

  it('does not re-open a session or re-BEGIN when the tab transaction is already active', async () => {
    const tab = makeTab({ txn: { autoCommit: false, status: 'active', readOnly: false } })
    const invoke = vi.fn().mockResolvedValue({ rows: [], rowCount: 0, fields: [] })
    Object.defineProperty(window, 'electronAPI', { value: { invoke, on: vi.fn() }, writable: true, configurable: true })
    const { result } = renderHook(() => useQueryExecution(tab, dbType, null))
    await act(async () => { await result.current.runStatement() })

    const channels = invoke.mock.calls.map((c) => c[0])
    expect(channels).not.toContain('db:txn:begin')
    expect(mockSetTabTxnStatus).not.toHaveBeenCalled()
  })
})

describe('useQueryExecution.explainStatement', () => {
  it('no-ops when the driver has no explain capability', async () => {
    const tab = makeTab()
    const { result } = renderHook(() => useQueryExecution(tab, dbType, null))
    await act(async () => { await result.current.explainStatement() })
    expect(window.electronAPI.invoke).not.toHaveBeenCalled()
  })

  it('prepends the driver-declared EXPLAIN statement and switches the bottom dock to the Query Plan panel', async () => {
    const tab = makeTab({ sql: 'SELECT * FROM foo' })
    const caps = { explain: { statement: 'EXPLAIN ANALYZE', supportsAnalyze: true, format: 'tree' } } as DriverCapabilities
    const invoke = vi.fn().mockResolvedValue({ rows: [], rowCount: 0, fields: [] })
    Object.defineProperty(window, 'electronAPI', { value: { invoke, on: vi.fn() }, writable: true, configurable: true })
    const { result } = renderHook(() => useQueryExecution(tab, dbType, caps))
    await act(async () => { await result.current.explainStatement() })

    expect(invoke).toHaveBeenCalledWith('db:query', 'conn-1', 'EXPLAIN ANALYZE SELECT * FROM foo')
    expect(mockSetBottomDockActivePanel).toHaveBeenCalledWith('query-plan')
  })

  it('sets a tab error and does not touch the bottom dock when EXPLAIN itself fails', async () => {
    const tab = makeTab({ sql: 'SELECT 1' })
    const caps = { explain: { statement: 'EXPLAIN', supportsAnalyze: false, format: 'text' } } as DriverCapabilities
    const invoke = vi.fn().mockRejectedValue(new Error('explain not supported here'))
    Object.defineProperty(window, 'electronAPI', { value: { invoke, on: vi.fn() }, writable: true, configurable: true })
    const { result } = renderHook(() => useQueryExecution(tab, dbType, caps))
    await act(async () => { await result.current.explainStatement() })

    expect(mockSetTabError).toHaveBeenCalledWith('tab-1', 'explain not supported here')
    expect(mockSetBottomDockActivePanel).not.toHaveBeenCalled()
  })
})
