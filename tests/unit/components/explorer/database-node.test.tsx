import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DatabaseNode } from '../../../../src/renderer/src/components/explorer/DatabaseNode'

/**
 * Behavioural tests for `DatabaseNode` — the multi-database tree row. On
 * expand it switches the connection to that database and lazily fetches its
 * schemas; a failed switch (e.g. the user lacks access) must surface an
 * inline error AND a toast rather than silently showing an empty schema list.
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

let schemas = new Map<string, string[]>()
const mockSwitchDatabase = vi.fn().mockResolvedValue(undefined)
const mockFetchSchemas = vi.fn().mockResolvedValue(undefined)
const mockClearCache = vi.fn()
vi.mock('../../../../src/renderer/src/stores/schema', () => ({
  useSchemaStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      schemas, switchDatabase: mockSwitchDatabase, fetchSchemas: mockFetchSchemas, clearCache: mockClearCache,
      // A cached schema list renders child SchemaNodes, which read these too.
      tables: new Map(), objects: new Map(), filterText: '',
      fetchTables: vi.fn(), fetchSchemaObjects: vi.fn(),
    }),
}))

const mockAddToast = vi.fn()
vi.mock('../../../../src/renderer/src/stores/toast', () => ({
  useToastStore: (selector: (s: { addToast: unknown }) => unknown) => selector({ addToast: mockAddToast }),
}))

vi.mock('../../../../src/renderer/src/hooks/useClipboard', () => ({
  useClipboard: () => ({ copied: false, copy: vi.fn() }),
}))

beforeEach(() => {
  vi.clearAllMocks()
  expandedTreeNodes = new Set()
  schemas = new Map()
  mockSwitchDatabase.mockResolvedValue(undefined)
  mockFetchSchemas.mockResolvedValue(undefined)
})

describe('DatabaseNode expand behaviour', () => {
  it('does not switch database or fetch schemas while collapsed', () => {
    render(<DatabaseNode databaseName="analytics" connectionId="conn-1" depth={0} />)
    expect(mockSwitchDatabase).not.toHaveBeenCalled()
    expect(mockFetchSchemas).not.toHaveBeenCalled()
  })

  it('switches to the database and fetches its schemas once expanded', async () => {
    expandedTreeNodes = new Set(['db:conn-1:analytics'])
    render(<DatabaseNode databaseName="analytics" connectionId="conn-1" depth={0} />)
    await waitFor(() => expect(mockSwitchDatabase).toHaveBeenCalledWith('conn-1', 'analytics'))
    expect(mockFetchSchemas).toHaveBeenCalledWith('conn-1', 'analytics')
  })

  it('does not re-fetch when the schema list is already cached for this database', () => {
    expandedTreeNodes = new Set(['db:conn-1:analytics'])
    schemas = new Map([['conn-1:analytics', ['public']]])
    render(<DatabaseNode databaseName="analytics" connectionId="conn-1" depth={0} />)
    expect(mockSwitchDatabase).not.toHaveBeenCalled()
  })

  it('shows an inline error and a toast when switching to the database fails (e.g. access revoked)', async () => {
    mockSwitchDatabase.mockRejectedValueOnce(new Error('permission denied'))
    expandedTreeNodes = new Set(['db:conn-1:restricted'])
    render(<DatabaseNode databaseName="restricted" connectionId="conn-1" depth={0} />)

    await waitFor(() => expect(screen.getByText(/Cannot access/i)).toBeInTheDocument())
    expect(mockAddToast).toHaveBeenCalledWith(expect.objectContaining({ type: 'error' }))
    expect(mockFetchSchemas).not.toHaveBeenCalled()
  })

  it('toggles the node key on header click', async () => {
    const user = userEvent.setup()
    render(<DatabaseNode databaseName="analytics" connectionId="conn-1" depth={0} />)
    await user.click(screen.getByText('analytics'))
    expect(mockToggleTreeNode).toHaveBeenCalledWith('db:conn-1:analytics')
  })
})

describe('DatabaseNode refresh action', () => {
  it('clears the schema cache and re-fetches on refresh, showing a success toast', async () => {
    const user = userEvent.setup()
    expandedTreeNodes = new Set(['db:conn-1:analytics'])
    render(<DatabaseNode databaseName="analytics" connectionId="conn-1" depth={0} />)
    mockSwitchDatabase.mockClear()
    mockFetchSchemas.mockClear()

    await user.click(screen.getByRole('button', { name: /refresh/i }))

    expect(mockClearCache).toHaveBeenCalledWith('conn-1')
    expect(mockSwitchDatabase).toHaveBeenCalledWith('conn-1', 'analytics')
    expect(mockFetchSchemas).toHaveBeenCalledWith('conn-1', 'analytics')
    await waitFor(() => expect(mockAddToast).toHaveBeenCalledWith(expect.objectContaining({ type: 'success' })))
  })

  it('shows an error toast (not a thrown error) when refresh fails', async () => {
    const user = userEvent.setup()
    mockSwitchDatabase.mockRejectedValueOnce(new Error('gone'))
    render(<DatabaseNode databaseName="analytics" connectionId="conn-1" depth={0} />)

    await user.click(screen.getByRole('button', { name: /refresh/i }))
    await waitFor(() => expect(mockAddToast).toHaveBeenCalledWith(expect.objectContaining({ type: 'error' })))
  })
})
