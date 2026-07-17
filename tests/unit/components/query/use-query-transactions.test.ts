import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useQueryTransactions } from '../../../../src/renderer/src/components/query/hooks/useQueryTransactions'
import type { QueryTab } from '../../../../shared/types'

/**
 * Behavioural tests for `useQueryTransactions` — auto-commit toggling and
 * commit/rollback. The raw `doCommit`/`doRollback` must RE-THROW (App.tsx's
 * close-guard keeps its dialog open on failure); the `on*` toolbar variants
 * must swallow into a notification instead.
 */

const mockSetTabAutoCommit = vi.fn()
const mockSetTabTxnStatus = vi.fn()
vi.mock('../../../../src/renderer/src/stores/tabs', () => ({
  useTabsStore: () => ({
    setTabAutoCommit: mockSetTabAutoCommit,
    setTabTxnStatus: mockSetTabTxnStatus,
  }),
}))

const mockNotifyError = vi.fn()
vi.mock('../../../../src/renderer/src/lib/notify-error', () => ({
  notifyError: (...args: unknown[]) => mockNotifyError(...args),
}))

function makeTab(overrides: Partial<QueryTab> = {}): QueryTab {
  return {
    id: 'tab-1',
    type: 'query',
    title: 'Query 1',
    connectionId: 'conn-1',
    database: null,
    schema: null,
    sql: '',
    results: null,
    isExecuting: false,
    error: null,
    isDirty: false,
    aiExplanation: null,
    ...overrides,
  }
}

let invoke: ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.clearAllMocks()
  invoke = vi.fn().mockResolvedValue(undefined)
  Object.defineProperty(window, 'electronAPI', { value: { invoke, on: vi.fn() }, writable: true, configurable: true })
})

describe('useQueryTransactions.onToggleAutoCommit', () => {
  it('commits the open transaction, closes the session, and resets status before enabling auto-commit', async () => {
    const tab = makeTab({ txn: { autoCommit: false, status: 'active', readOnly: false } })
    const { result } = renderHook(() => useQueryTransactions(tab))
    await act(async () => { await result.current.onToggleAutoCommit(true) })

    const channels = invoke.mock.calls.map((c) => c[0])
    expect(channels.indexOf('db:txn:commit')).toBeLessThan(channels.indexOf('db:session:close'))
    expect(mockSetTabTxnStatus).toHaveBeenCalledWith('tab-1', 'none')
    expect(mockSetTabAutoCommit).toHaveBeenCalledWith('tab-1', true)
  })

  it('skips the commit call (nothing to commit) but still closes the session when no transaction is active', async () => {
    const tab = makeTab({ txn: { autoCommit: false, status: 'none', readOnly: false } })
    const { result } = renderHook(() => useQueryTransactions(tab))
    await act(async () => { await result.current.onToggleAutoCommit(true) })

    expect(invoke).not.toHaveBeenCalledWith('db:txn:commit', expect.anything(), expect.anything())
    expect(invoke).toHaveBeenCalledWith('db:session:close', 'conn-1', 'tab-1')
    expect(mockSetTabAutoCommit).toHaveBeenCalledWith('tab-1', true)
  })

  it('turning OFF auto-commit is lazy: no IPC calls at all, just flips the flag', async () => {
    const tab = makeTab({ txn: { autoCommit: true, status: 'none', readOnly: false } })
    const { result } = renderHook(() => useQueryTransactions(tab))
    await act(async () => { await result.current.onToggleAutoCommit(false) })

    expect(invoke).not.toHaveBeenCalled()
    expect(mockSetTabAutoCommit).toHaveBeenCalledWith('tab-1', false)
  })

  it('does nothing at all when the tab has no connection', async () => {
    const tab = makeTab({ connectionId: null })
    const { result } = renderHook(() => useQueryTransactions(tab))
    await act(async () => { await result.current.onToggleAutoCommit(true) })

    expect(invoke).not.toHaveBeenCalled()
    expect(mockSetTabAutoCommit).not.toHaveBeenCalled()
  })

  it('notifies (rather than throwing out) and does NOT flip auto-commit when the commit IPC fails', async () => {
    const tab = makeTab({ txn: { autoCommit: false, status: 'active', readOnly: false } })
    invoke.mockRejectedValueOnce(new Error('commit failed'))
    const { result } = renderHook(() => useQueryTransactions(tab))
    await act(async () => { await result.current.onToggleAutoCommit(true) })

    expect(mockNotifyError).toHaveBeenCalled()
    expect(mockSetTabAutoCommit).not.toHaveBeenCalled()
  })
})

describe('useQueryTransactions raw commit/rollback (re-throwing)', () => {
  it('doCommit re-throws on IPC failure instead of swallowing it', async () => {
    invoke.mockRejectedValueOnce(new Error('boom'))
    const tab = makeTab()
    const { result } = renderHook(() => useQueryTransactions(tab))
    await expect(result.current.doCommit()).rejects.toThrow('boom')
    expect(mockSetTabTxnStatus).not.toHaveBeenCalled()
  })

  it('doRollback re-throws on IPC failure instead of swallowing it', async () => {
    invoke.mockRejectedValueOnce(new Error('rollback boom'))
    const tab = makeTab()
    const { result } = renderHook(() => useQueryTransactions(tab))
    await expect(result.current.doRollback()).rejects.toThrow('rollback boom')
    expect(mockSetTabTxnStatus).not.toHaveBeenCalled()
  })

  it('doCommit resets status to none on success', async () => {
    const tab = makeTab()
    const { result } = renderHook(() => useQueryTransactions(tab))
    await act(async () => { await result.current.doCommit() })
    expect(mockSetTabTxnStatus).toHaveBeenCalledWith('tab-1', 'none')
  })

  it('doCommit/doRollback are no-ops (no IPC) when the tab has no connection', async () => {
    const tab = makeTab({ connectionId: null })
    const { result } = renderHook(() => useQueryTransactions(tab))
    await act(async () => { await result.current.doCommit() })
    await act(async () => { await result.current.doRollback() })
    expect(invoke).not.toHaveBeenCalled()
  })
})

describe('useQueryTransactions toolbar commit/rollback (swallowing)', () => {
  it('onCommit swallows a failure into a notification instead of rejecting', async () => {
    invoke.mockRejectedValueOnce(new Error('boom'))
    const tab = makeTab()
    const { result } = renderHook(() => useQueryTransactions(tab))
    await expect(act(async () => { await result.current.onCommit() })).resolves.not.toThrow()
    expect(mockNotifyError).toHaveBeenCalled()
  })

  it('onRollback swallows a failure into a notification instead of rejecting', async () => {
    invoke.mockRejectedValueOnce(new Error('boom'))
    const tab = makeTab()
    const { result } = renderHook(() => useQueryTransactions(tab))
    await expect(act(async () => { await result.current.onRollback() })).resolves.not.toThrow()
    expect(mockNotifyError).toHaveBeenCalled()
  })
})
