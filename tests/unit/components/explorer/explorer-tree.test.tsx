import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ExplorerTree } from '../../../../src/renderer/src/components/explorer/ExplorerTree'
import type { SchemaTable } from '../../../../shared/types'

/**
 * Behavioural tests for `ExplorerTree` — the schema explorer's top-level
 * shape logic: the not-connected empty state, the hierarchy-loading
 * spinner, and which of the three tree shapes (flat / single-db-multi-schema
 * / multi-db) renders for a given databases×schemas count. Also covers the
 * fuzzy filter+sort feeding the flat view and that a driver's own nouns
 * (DB-agnostic — a driver may not be SQL) reach the empty/loading copy.
 */

let activeConnectionId: string | null = 'conn-1'
let connectedIds = new Set<string>(['conn-1'])
vi.mock('../../../../src/renderer/src/stores/connections', () => ({
  useConnectionsStore: (selector: (s: { activeConnectionId: string | null; connectedIds: Set<string> }) => unknown) =>
    selector({ activeConnectionId, connectedIds }),
}))

let schemaState = {
  databases: new Map<string, string[]>(),
  schemas: new Map<string, string[]>(),
  tables: new Map<string, SchemaTable[]>(),
  filterText: '',
  loading: false,
  errored: new Set<string>(),
}
const mockFetchDatabases = vi.fn()
const mockFetchSchemas = vi.fn()
const mockFetchTables = vi.fn()
vi.mock('../../../../src/renderer/src/stores/schema', () => ({
  useSchemaStore: (selector: (s: typeof schemaState & { fetchDatabases: unknown; fetchSchemas: unknown; fetchTables: unknown }) => unknown) =>
    selector({ ...schemaState, fetchDatabases: mockFetchDatabases, fetchSchemas: mockFetchSchemas, fetchTables: mockFetchTables }),
  schemaErrorTag: (kind: string, key: string) => `${kind}:${key}`,
}))

let nouns = {
  object: { one: 'table', many: 'tables' },
  field: { one: 'column', many: 'columns' },
  record: { one: 'row', many: 'rows' },
}
vi.mock('../../../../src/renderer/src/hooks/useDataNouns', () => ({
  useDataNouns: () => nouns,
  titleCase: (s: string) => s.charAt(0).toUpperCase() + s.slice(1),
}))

vi.mock('../../../../src/renderer/src/components/explorer/SearchFilter', () => ({
  SearchFilter: ({ resultCount }: { resultCount?: number }) => (
    <div data-testid="search-filter">{resultCount !== undefined ? `count:${resultCount}` : 'no-count'}</div>
  ),
}))
vi.mock('../../../../src/renderer/src/components/explorer/DatabaseNode', () => ({
  DatabaseNode: ({ databaseName }: { databaseName: string }) => <div data-testid="database-node">{databaseName}</div>,
}))
vi.mock('../../../../src/renderer/src/components/explorer/SchemaNode', () => ({
  SchemaNode: ({ schemaName }: { schemaName: string }) => <div data-testid="schema-node">{schemaName}</div>,
}))
vi.mock('../../../../src/renderer/src/components/explorer/TableNode', () => ({
  TableNode: ({ tableName }: { tableName: string }) => <div data-testid="table-node">{tableName}</div>,
}))
vi.mock('../../../../src/renderer/src/components/explorer/ViewNode', () => ({
  ViewNode: ({ viewName }: { viewName: string }) => <div data-testid="view-node">{viewName}</div>,
}))

function table(name: string, type: 'table' | 'view' = 'table'): SchemaTable {
  return { name, type } as SchemaTable
}

beforeEach(() => {
  vi.clearAllMocks()
  activeConnectionId = 'conn-1'
  connectedIds = new Set(['conn-1'])
  nouns = { object: { one: 'table', many: 'tables' }, field: { one: 'column', many: 'columns' }, record: { one: 'row', many: 'rows' } }
  schemaState = {
    databases: new Map(),
    schemas: new Map(),
    tables: new Map(),
    filterText: '',
    loading: false,
    errored: new Set(),
  }
})

describe('ExplorerTree connection states', () => {
  it('shows the "no connection" empty state when nothing is active', () => {
    activeConnectionId = null
    render(<ExplorerTree />)
    expect(screen.getByText('No connection')).toBeInTheDocument()
  })

  it('shows the empty state when the active connection is not actually connected', () => {
    activeConnectionId = 'conn-1'
    connectedIds = new Set() // stale active id, connection dropped
    render(<ExplorerTree />)
    expect(screen.getByText('No connection')).toBeInTheDocument()
  })

  it('shows a loading spinner (not the tree) while databases/schemas have not resolved yet', () => {
    schemaState.databases = new Map() // hierarchy not loaded
    const { container } = render(<ExplorerTree />)
    expect(container.querySelector('[class*="animate-spin"], svg')).toBeTruthy()
    expect(screen.queryByTestId('search-filter')).not.toBeInTheDocument()
  })
})

describe('ExplorerTree tree-shape selection', () => {
  it('renders the flat shape (no DatabaseNode/SchemaNode) for a single database + single schema (e.g. SQLite)', () => {
    schemaState.databases = new Map([['conn-1', ['main']]])
    schemaState.schemas = new Map([['conn-1', ['public']]])
    schemaState.tables = new Map([['conn-1:public', [table('users'), table('orders_view', 'view')]]])
    render(<ExplorerTree />)

    expect(screen.getAllByTestId('table-node')).toHaveLength(1)
    expect(screen.getAllByTestId('view-node')).toHaveLength(1)
    expect(screen.queryByTestId('database-node')).not.toBeInTheDocument()
    expect(screen.queryByTestId('schema-node')).not.toBeInTheDocument()
    // Flat shape fetches tables for the (only) schema eagerly.
    expect(mockFetchTables).toHaveBeenCalledWith('conn-1', 'public')
  })

  it('renders SchemaNodes (not the flat table list) for a single database with multiple schemas', () => {
    schemaState.databases = new Map([['conn-1', ['main']]])
    schemaState.schemas = new Map([['conn-1', ['public', 'sales']]])
    render(<ExplorerTree />)

    const schemaNodes = screen.getAllByTestId('schema-node')
    expect(schemaNodes.map((n) => n.textContent)).toEqual(['public', 'sales'])
    expect(screen.queryByTestId('table-node')).not.toBeInTheDocument()
    expect(mockFetchTables).not.toHaveBeenCalled()
  })

  it('renders DatabaseNodes for multiple databases, skipping blank/falsy database names', () => {
    schemaState.databases = new Map([['conn-1', ['app', '', 'analytics']]])
    schemaState.schemas = new Map([['conn-1', ['public']]])
    render(<ExplorerTree />)

    const dbNodes = screen.getAllByTestId('database-node')
    expect(dbNodes.map((n) => n.textContent)).toEqual(['app', 'analytics'])
  })
})

describe('ExplorerTree flat-view filtering', () => {
  it('splits tables and views into separate labeled groups', () => {
    schemaState.databases = new Map([['conn-1', ['main']]])
    schemaState.schemas = new Map([['conn-1', ['public']]])
    schemaState.tables = new Map([['conn-1:public', [table('users'), table('accounts_v', 'view')]]])
    render(<ExplorerTree />)

    expect(screen.getByTestId('table-node')).toHaveTextContent('users')
    expect(screen.getByTestId('view-node')).toHaveTextContent('accounts_v')
  })

  it('fuzzy-filters and reports the combined result count to SearchFilter', () => {
    schemaState.databases = new Map([['conn-1', ['main']]])
    schemaState.schemas = new Map([['conn-1', ['public']]])
    schemaState.tables = new Map([['conn-1:public', [table('users'), table('user_logs'), table('orders')]]])
    schemaState.filterText = 'user'
    render(<ExplorerTree />)

    // "orders" doesn't fuzzy-match "user"; both "users" and "user_logs" do.
    expect(screen.getAllByTestId('table-node')).toHaveLength(2)
    expect(screen.getByTestId('search-filter')).toHaveTextContent('count:2')
  })

  it('shows a "no matches" message (not "no tables") when filtering yields zero results', () => {
    schemaState.databases = new Map([['conn-1', ['main']]])
    schemaState.schemas = new Map([['conn-1', ['public']]])
    schemaState.tables = new Map([['conn-1:public', [table('users')]]])
    schemaState.filterText = 'zzz'
    render(<ExplorerTree />)

    expect(screen.getByText('No matches for "zzz"')).toBeInTheDocument()
  })

  it('BUG: shows the driver-noun-aware "Loading…" copy forever for a genuinely empty schema, never "No tables"', () => {
    // `allTables.length === 0` is true both when the schema truly has zero
    // tables/views AND when fetchTables hasn't resolved yet — ExplorerTree
    // doesn't distinguish them (unlike TableNode's `columns.has(cacheKey)`
    // check for the exact same loaded-vs-loading ambiguity). A connected,
    // schema-less driver with no tables is stuck on "Loading…" forever.
    schemaState.databases = new Map([['conn-1', ['main']]])
    schemaState.schemas = new Map([['conn-1', ['public']]])
    schemaState.tables = new Map([['conn-1:public', []]]) // resolved — genuinely empty
    nouns = { object: { one: 'collection', many: 'collections' }, field: { one: 'field', many: 'fields' }, record: { one: 'document', many: 'documents' } }
    render(<ExplorerTree />)

    expect(screen.getByText('Loading collections…')).toBeInTheDocument()
    expect(screen.queryByText(/No collections/)).not.toBeInTheDocument()
  })
})
