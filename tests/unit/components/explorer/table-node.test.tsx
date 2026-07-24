import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TableNode } from '../../../../src/renderer/src/components/explorer/TableNode'
import type { SchemaColumn, SchemaIndex } from '../../../../shared/types'

/**
 * Behavioural tests for `TableNode` — the schema explorer's table row.
 * Covers the lazy-fetch-on-expand contract (columns/indexes/row count only
 * load once expanded, not on every render), the `canViewData` capability
 * gate hiding the "view data" hover action, and the loaded-empty vs.
 * not-yet-loaded distinction for the columns list (contrast with the
 * ExplorerTree bug: this one gets it right via `columns.has(cacheKey)`).
 */

let expandedTreeNodes = new Set<string>()
const mockToggleTreeNode = vi.fn((key: string) => {
  const next = new Set(expandedTreeNodes)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  expandedTreeNodes = next
})
vi.mock('../../../../src/renderer/src/stores/ui', () => ({
  useUiStore: (selector: (s: { expandedTreeNodes: Set<string>; toggleTreeNode: (k: string) => void }) => unknown) =>
    selector({ expandedTreeNodes, toggleTreeNode: mockToggleTreeNode }),
}))

let columns = new Map<string, SchemaColumn[]>()
let indexes = new Map<string, SchemaIndex[]>()
let rowCounts = new Map<string, number>()
let errored = new Set<string>()
const mockFetchColumns = vi.fn()
const mockFetchIndexes = vi.fn()
const mockFetchRowCount = vi.fn()
vi.mock('../../../../src/renderer/src/stores/schema', () => ({
  useSchemaStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      columns, indexes, rowCounts, errored,
      fetchColumns: mockFetchColumns, fetchIndexes: mockFetchIndexes, fetchRowCount: mockFetchRowCount,
    }),
  schemaErrorTag: (kind: string, key: string) => `${kind}:${key}`,
}))

let canViewData = true
vi.mock('../../../../src/renderer/src/components/explorer/useTableNodeActions', () => ({
  useTableNodeActions: () => ({
    canViewData,
    openData: vi.fn(),
    openInQueryTab: vi.fn(),
    copyTableName: vi.fn(),
    copySampleQuery: vi.fn(),
    menuItems: [],
  }),
}))

vi.mock('../../../../src/renderer/src/hooks/useDataNouns', () => ({
  useDataNouns: () => ({ object: { one: 'table', many: 'tables' }, field: { one: 'column', many: 'columns' }, record: { one: 'row', many: 'rows' } }),
}))

function col(name: string): SchemaColumn {
  return { name, dataType: 'text', nullable: true } as SchemaColumn
}

beforeEach(() => {
  vi.clearAllMocks()
  expandedTreeNodes = new Set()
  columns = new Map()
  indexes = new Map()
  rowCounts = new Map()
  errored = new Set()
  canViewData = true
})

describe('TableNode lazy-fetch on expand', () => {
  it('does not fetch columns/indexes/row-count while collapsed', () => {
    render(<TableNode tableName="users" connectionId="conn-1" schema="public" depth={0} />)
    expect(mockFetchColumns).not.toHaveBeenCalled()
    expect(mockFetchIndexes).not.toHaveBeenCalled()
    expect(mockFetchRowCount).not.toHaveBeenCalled()
  })

  it('fetches columns, indexes, and row count once expanded', () => {
    expandedTreeNodes = new Set(['table:conn-1:public:users'])
    render(<TableNode tableName="users" connectionId="conn-1" schema="public" depth={0} />)
    expect(mockFetchColumns).toHaveBeenCalledWith('conn-1', 'users', 'public')
    expect(mockFetchIndexes).toHaveBeenCalledWith('conn-1', 'users', 'public')
    expect(mockFetchRowCount).toHaveBeenCalledWith('conn-1', 'users', 'public')
  })

  it('toggles the node key on header click', async () => {
    const user = userEvent.setup()
    render(<TableNode tableName="users" connectionId="conn-1" schema="public" depth={0} />)
    await user.click(screen.getByText('users'))
    expect(mockToggleTreeNode).toHaveBeenCalledWith('table:conn-1:public:users')
  })
})

describe('TableNode column-list loaded-vs-loading distinction', () => {
  it('shows "Loading columns…" when the columns cache has no entry yet for this table', () => {
    expandedTreeNodes = new Set(['table:conn-1:public:users'])
    columns = new Map() // no entry at all
    render(<TableNode tableName="users" connectionId="conn-1" schema="public" depth={0} />)
    expect(screen.getByText(/Loading columns/)).toBeInTheDocument()
  })

  it('shows a driver-noun "no columns" message (not "loading") once resolved to genuinely zero columns', () => {
    expandedTreeNodes = new Set(['table:conn-1:public:users'])
    columns = new Map([['conn-1:public:users', []]]) // resolved — genuinely empty (e.g. Redis)
    render(<TableNode tableName="users" connectionId="conn-1" schema="public" depth={0} />)
    expect(screen.queryByText(/Loading columns/)).not.toBeInTheDocument()
    expect(screen.getByText(/No columns/)).toBeInTheDocument()
  })

  it('renders one ColumnRow per resolved column', () => {
    expandedTreeNodes = new Set(['table:conn-1:public:users'])
    columns = new Map([['conn-1:public:users', [col('id'), col('email')]]])
    render(<TableNode tableName="users" connectionId="conn-1" schema="public" depth={0} />)
    expect(screen.getByText('id')).toBeInTheDocument()
    expect(screen.getByText('email')).toBeInTheDocument()
  })
})

describe('TableNode capability gating', () => {
  it('hides the "view data" hover action when the driver has no data reader', () => {
    canViewData = false
    render(<TableNode tableName="users" connectionId="conn-1" schema="public" depth={0} />)
    expect(screen.queryByRole('button', { name: /view data/i })).not.toBeInTheDocument()
  })

  it('shows the "view data" hover action when the driver has a data reader', () => {
    canViewData = true
    render(<TableNode tableName="users" connectionId="conn-1" schema="public" depth={0} />)
    expect(screen.getByRole('button', { name: /view data/i })).toBeInTheDocument()
  })
})
