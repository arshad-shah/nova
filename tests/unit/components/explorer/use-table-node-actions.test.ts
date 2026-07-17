import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useTableNodeActions } from '../../../../src/renderer/src/components/explorer/useTableNodeActions'
import type { ConnectionProfile } from '../../../../shared/types'

/**
 * Behavioural tests for `useTableNodeActions` — the table tree-node's data
 * actions and context menu assembly. Covers the `canViewData` capability
 * gate (a driver may not have a data reader), the DB-AGNOSTIC noun
 * resolution (a Mongo-shaped driver must not say "table"/"row"), the sample
 * query IPC-failure fallback, and that plugin + export contributions are
 * appended rather than replacing the built-ins.
 */

let profile: ConnectionProfile | null = { id: 'conn-1', name: 'Prod', type: 'postgresql', database: 'app', defaultAutoCommit: true }
vi.mock('../../../../src/renderer/src/stores/connections', () => ({
  useConnectionsStore: (selector: (s: { connections: ConnectionProfile[] }) => unknown) =>
    selector({ connections: profile ? [profile] : [] }),
}))

let caps: Record<string, unknown> | null = { hasGetTableData: true }
const mockFetchCaps = vi.fn().mockResolvedValue(undefined)
vi.mock('../../../../src/renderer/src/stores/driver-capabilities', () => ({
  useDriverCapabilitiesStore: Object.assign(
    (selector: (s: { resolveCapabilities: () => unknown }) => unknown) =>
      selector({ resolveCapabilities: () => caps }),
    { getState: () => ({ fetch: mockFetchCaps }) }
  ),
}))

const mockAddQueryTab = vi.fn().mockReturnValue('new-tab-id')
const mockUpdateTabSql = vi.fn()
vi.mock('../../../../src/renderer/src/stores/tabs', () => ({
  useTabsStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({ addQueryTab: mockAddQueryTab, updateTabSql: mockUpdateTabSql, openTableData: vi.fn() }),
}))

let pluginItems: { kind: 'item'; id: string; label: string; onSelect: () => void }[] = []
vi.mock('../../../../src/renderer/src/components/plugin-ui/usePluginContextMenu', () => ({
  usePluginContextMenuItems: () => pluginItems,
}))

beforeEach(() => {
  vi.clearAllMocks()
  profile = { id: 'conn-1', name: 'Prod', type: 'postgresql', database: 'app', defaultAutoCommit: true }
  caps = { hasGetTableData: true }
  pluginItems = []
  Object.defineProperty(window, 'electronAPI', {
    value: { invoke: vi.fn().mockResolvedValue('SELECT * FROM users LIMIT 100;'), on: vi.fn() },
    writable: true,
    configurable: true,
  })
  Object.defineProperty(navigator, 'clipboard', { value: { writeText: vi.fn().mockResolvedValue(undefined) }, configurable: true })
})

describe('useTableNodeActions capability gating', () => {
  it('canViewData is true and the "view data" menu item is present when the driver has a data reader', () => {
    caps = { hasGetTableData: true }
    const { result } = renderHook(() => useTableNodeActions('conn-1', 'users', 'public'))
    expect(result.current.canViewData).toBe(true)
    expect(result.current.menuItems.some((i) => 'id' in i && i.id === 'view-data')).toBe(true)
  })

  it('canViewData is false and the "view data" menu item is absent when the driver lacks a data reader', () => {
    caps = { hasGetTableData: false }
    const { result } = renderHook(() => useTableNodeActions('conn-1', 'users', 'public'))
    expect(result.current.canViewData).toBe(false)
    expect(result.current.menuItems.some((i) => 'id' in i && i.id === 'view-data')).toBe(false)
  })

  it('canViewData is false when capabilities have not resolved yet (null)', () => {
    caps = null
    const { result } = renderHook(() => useTableNodeActions('conn-1', 'users', 'public'))
    expect(result.current.canViewData).toBe(false)
  })
})

describe('useTableNodeActions DB-agnostic nouns', () => {
  it('uses the driver-declared noun ("collection") instead of "table" for a non-SQL driver', () => {
    profile = { id: 'conn-1', name: 'Docs', type: 'mongodb', database: 'app' }
    caps = { hasGetTableData: true, nouns: { object: { one: 'collection', many: 'collections' } } }
    const { result } = renderHook(() => useTableNodeActions('conn-1', 'orders', 'public'))
    const copyItem = result.current.menuItems.find((i) => 'id' in i && i.id === 'copy-table-name')
    expect(copyItem && 'label' in copyItem ? copyItem.label : '').toMatch(/collection/)
  })

  it('falls back to the generic, driver-agnostic "object" noun when the driver declares none', () => {
    // The glue must never assume "table" for a driver that hasn't declared its
    // own nouns — it falls back to the generic i18n word, not a SQL-ism.
    caps = { hasGetTableData: true }
    const { result } = renderHook(() => useTableNodeActions('conn-1', 'orders', 'public'))
    const copyItem = result.current.menuItems.find((i) => 'id' in i && i.id === 'copy-table-name')
    expect(copyItem && 'label' in copyItem ? copyItem.label : '').toMatch(/object/i)
  })
})

describe('useTableNodeActions sample query + copy actions', () => {
  it('copyTableName writes the raw table name to the clipboard', () => {
    const { result } = renderHook(() => useTableNodeActions('conn-1', 'users', 'public'))
    act(() => result.current.copyTableName())
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('users')
  })

  it('copySampleQuery copies the IPC-provided sample query when it succeeds', async () => {
    const { result } = renderHook(() => useTableNodeActions('conn-1', 'users', 'public'))
    await act(async () => { await result.current.copySampleQuery() })
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('SELECT * FROM users LIMIT 100;')
  })

  it('copySampleQuery falls back to a generated SELECT when the IPC call fails', async () => {
    Object.defineProperty(window, 'electronAPI', {
      value: { invoke: vi.fn().mockRejectedValue(new Error('no such table')), on: vi.fn() },
      writable: true,
      configurable: true,
    })
    const { result } = renderHook(() => useTableNodeActions('conn-1', 'orders', 'public'))
    await act(async () => { await result.current.copySampleQuery() })
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('SELECT * FROM orders LIMIT 100;')
  })

  it('openInQueryTab opens a new tab honoring the connection profile\'s default auto-commit and seeds it with the sample query', async () => {
    profile = { id: 'conn-1', name: 'Prod', type: 'postgresql', database: 'app', defaultAutoCommit: false }
    const { result } = renderHook(() => useTableNodeActions('conn-1', 'users', 'public'))
    await act(async () => { await result.current.openInQueryTab() })

    expect(mockAddQueryTab).toHaveBeenCalledWith('conn-1', 'public', { autoCommit: false })
    expect(mockUpdateTabSql).toHaveBeenCalledWith('new-tab-id', 'SELECT * FROM users LIMIT 100;')
  })
})

describe('useTableNodeActions menu assembly', () => {
  it('omits the export item when no onExportTable handler is given', () => {
    const { result } = renderHook(() => useTableNodeActions('conn-1', 'users', 'public'))
    expect(result.current.menuItems.some((i) => 'id' in i && i.id === 'export-table')).toBe(false)
  })

  it('includes the export item, wired to the given handler, when onExportTable is provided', () => {
    const onExportTable = vi.fn()
    const { result } = renderHook(() => useTableNodeActions('conn-1', 'users', 'public', onExportTable))
    const exportItem = result.current.menuItems.find((i) => 'id' in i && i.id === 'export-table')
    expect(exportItem).toBeDefined()
    if (exportItem && 'onSelect' in exportItem && exportItem.onSelect) exportItem.onSelect()
    expect(onExportTable).toHaveBeenCalledWith('users')
  })

  it('appends plugin-contributed context menu items after the built-ins', () => {
    pluginItems = [{ kind: 'item', id: 'plugin:foo:bar', label: 'Foo: Bar', onSelect: vi.fn() }]
    const { result } = renderHook(() => useTableNodeActions('conn-1', 'users', 'public'))
    expect(result.current.menuItems.at(-1)).toMatchObject({ id: 'plugin:foo:bar' })
  })
})
