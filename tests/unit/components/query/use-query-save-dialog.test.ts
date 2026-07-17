import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useQuerySaveDialog } from '../../../../src/renderer/src/components/query/hooks/useQuerySaveDialog'
import type { QueryTab, DatabaseType } from '../../../../shared/types'

/**
 * Behavioural tests for `useQuerySaveDialog` — the "save query" flow. It
 * reads the LATEST tab state from the store (not the closed-over `tab` prop)
 * so a fast typer doesn't get a stale re-save; covers the three branches
 * (nothing to save / silent re-save / first-time name prompt) and the
 * confirm/cancel paths of the prompt itself.
 */

const mockSaveQuery = vi.fn().mockReturnValue('sq-new-id')
vi.mock('../../../../src/renderer/src/components/saved-queries/SavedQueriesPanel', () => ({
  saveQuery: (...args: unknown[]) => mockSaveQuery(...args),
}))

const mockMarkTabSaved = vi.fn()
vi.mock('../../../../src/renderer/src/stores/tabs', () => ({
  useTabsStore: Object.assign(
    (selector?: (s: unknown) => unknown) => (selector ? selector({ markTabSaved: mockMarkTabSaved }) : { markTabSaved: mockMarkTabSaved }),
    { getState: () => ({ tabs: currentTabs }) }
  ),
}))

const mockAddToast = vi.fn()
vi.mock('../../../../src/renderer/src/stores/toast', () => ({
  useToastStore: { getState: () => ({ addToast: mockAddToast }) },
}))

function makeTab(overrides: Partial<QueryTab> = {}): QueryTab {
  return {
    id: 'tab-1',
    type: 'query',
    title: 'My Query',
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

let currentTabs: QueryTab[] = []
const dbType: DatabaseType = 'postgresql'

beforeEach(() => {
  vi.clearAllMocks()
  mockSaveQuery.mockReturnValue('sq-new-id')
  currentTabs = []
})

describe('useQuerySaveDialog.handleSave', () => {
  it('shows a "nothing to save" toast and does not open the dialog for a blank buffer', () => {
    const tab = makeTab({ sql: '   ' })
    currentTabs = [tab]
    const { result } = renderHook(() => useQuerySaveDialog(tab, dbType))
    act(() => result.current.handleSave())

    expect(mockAddToast).toHaveBeenCalledWith(expect.objectContaining({ type: 'info' }))
    expect(result.current.saveDialogOpen).toBe(false)
    expect(mockSaveQuery).not.toHaveBeenCalled()
  })

  it('silently re-saves a tab that already has a savedQueryId, without opening the dialog', () => {
    const tab = makeTab({ savedQueryId: 'sq-1', sql: 'SELECT 2' })
    currentTabs = [tab]
    const { result } = renderHook(() => useQuerySaveDialog(tab, dbType))
    act(() => result.current.handleSave())

    expect(mockSaveQuery).toHaveBeenCalledWith({ id: 'sq-1', name: 'My Query', sql: 'SELECT 2', connectionType: dbType })
    expect(mockMarkTabSaved).toHaveBeenCalledWith('tab-1')
    expect(result.current.saveDialogOpen).toBe(false)
    expect(mockAddToast).toHaveBeenCalledWith(expect.objectContaining({ type: 'success' }))
  })

  it('reads the LATEST store state, not the stale prop, so a race with a fast edit saves current content', () => {
    // The prop passed to the hook is now stale (still says the old sql); the
    // store has the up-to-date value. A closure-captured `tab.sql` bug would
    // save the stale text instead.
    const propTab = makeTab({ savedQueryId: 'sq-1', sql: 'SELECT stale' })
    currentTabs = [makeTab({ savedQueryId: 'sq-1', sql: 'SELECT fresh' })]
    const { result } = renderHook(() => useQuerySaveDialog(propTab, dbType))
    act(() => result.current.handleSave())

    expect(mockSaveQuery).toHaveBeenCalledWith(expect.objectContaining({ sql: 'SELECT fresh' }))
  })

  it('does nothing when the tab has since been closed (missing from the store)', () => {
    const tab = makeTab({ savedQueryId: 'sq-1' })
    currentTabs = [] // tab no longer exists
    const { result } = renderHook(() => useQuerySaveDialog(tab, dbType))
    act(() => result.current.handleSave())

    expect(mockSaveQuery).not.toHaveBeenCalled()
    expect(result.current.saveDialogOpen).toBe(false)
  })

  it('opens the in-app prompt pre-filled with the tab title on a first-time save', () => {
    const tab = makeTab({ title: 'Untitled report', sql: 'SELECT 1' })
    currentTabs = [tab]
    const { result } = renderHook(() => useQuerySaveDialog(tab, dbType))
    act(() => result.current.handleSave())

    expect(result.current.saveDialogOpen).toBe(true)
    expect(result.current.saveDialogName).toBe('Untitled report')
    expect(mockSaveQuery).not.toHaveBeenCalled()
  })

  it('falls back to a timestamped default name when the tab title is blank', () => {
    const tab = makeTab({ title: '   ', sql: 'SELECT 1' })
    currentTabs = [tab]
    const { result } = renderHook(() => useQuerySaveDialog(tab, dbType))
    act(() => result.current.handleSave())

    expect(result.current.saveDialogName).toMatch(/^Query /)
  })
})

describe('useQuerySaveDialog.confirmSaveDialog', () => {
  it('saves the pending SQL under the entered name and closes the dialog', () => {
    const tab = makeTab({ title: '', sql: 'SELECT 42' })
    currentTabs = [tab]
    const { result } = renderHook(() => useQuerySaveDialog(tab, dbType))
    act(() => result.current.handleSave())
    act(() => result.current.setSaveDialogName('Answer query'))
    act(() => result.current.confirmSaveDialog())

    expect(mockSaveQuery).toHaveBeenCalledWith({ name: 'Answer query', sql: 'SELECT 42', connectionType: dbType })
    expect(mockMarkTabSaved).toHaveBeenCalledWith('tab-1', { title: 'Answer query', savedQueryId: 'sq-new-id' })
    expect(result.current.saveDialogOpen).toBe(false)
  })

  it('closes without saving when the entered name is blank', () => {
    const tab = makeTab({ sql: 'SELECT 42' })
    currentTabs = [tab]
    const { result } = renderHook(() => useQuerySaveDialog(tab, dbType))
    act(() => result.current.handleSave())
    act(() => result.current.setSaveDialogName('   '))
    act(() => result.current.confirmSaveDialog())

    expect(mockSaveQuery).not.toHaveBeenCalled()
    expect(mockMarkTabSaved).not.toHaveBeenCalled()
    expect(result.current.saveDialogOpen).toBe(false)
  })
})
