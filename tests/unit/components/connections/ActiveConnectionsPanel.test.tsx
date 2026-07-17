import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ActiveConnectionsPanel } from '../../../../src/renderer/src/components/connections/ActiveConnectionsPanel'
import { useToastStore } from '../../../../src/renderer/src/stores/toast'

const PROFILES = [
  { id: 'c-1', name: 'zebra', type: 'postgresql', host: 'h', port: 5432, database: 'd', username: 'u', password: '', color: '#111' },
  { id: 'c-2', name: 'apple', type: 'postgresql', host: 'h', port: 5432, database: 'd', username: 'u', password: '', color: '#222' },
  { id: 'c-3', name: 'mango', type: 'mysql', host: 'h', port: 3306, database: 'd', username: 'u', password: '', color: '#333' },
]

let connectionsList: typeof PROFILES = PROFILES
let connectedIds = new Set<string>()
let activeConnectionId: string | null = null
const mockSetActiveConnection = vi.fn((id: string) => { activeConnectionId = id })
const mockDisconnect = vi.fn().mockResolvedValue(undefined)
const mockConnect = vi.fn().mockResolvedValue({ success: true })
const mockDeleteConnection = vi.fn().mockResolvedValue(undefined)
const mockAddQueryTab = vi.fn()
const mockOpenConnectionForm = vi.fn()

vi.mock('../../../../src/renderer/src/stores/connections', () => ({
  useConnectionsStore: (selector: any) => selector({
    connections: connectionsList,
    connectedIds,
    activeConnectionId,
    setActiveConnection: mockSetActiveConnection,
    disconnect: mockDisconnect,
    connect: mockConnect,
    deleteConnection: mockDeleteConnection,
  }),
}))

vi.mock('../../../../src/renderer/src/stores/tabs', () => ({
  useTabsStore: (selector: any) => selector({
    addQueryTab: mockAddQueryTab,
    openConnectionForm: mockOpenConnectionForm,
  }),
}))

/** Finds the row's overflow-menu trigger by the connection name printed in it. */
function moreActionsFor(name: string): HTMLElement {
  const nameEl = screen.getByText(name)
  const row = nameEl.closest('.group') as HTMLElement
  return within(row).getByRole('button', { name: 'More actions' })
}

describe('ActiveConnectionsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    connectionsList = PROFILES
    connectedIds = new Set()
    activeConnectionId = null
    mockConnect.mockResolvedValue({ success: true })
    useToastStore.setState({ toasts: [] })
  })

  it('shows the empty state with a "New connection" affordance when there are no connections at all', () => {
    connectionsList = []
    render(<ActiveConnectionsPanel />)
    expect(screen.getByText('No connections yet')).toBeInTheDocument()
    expect(screen.queryByText(/Saved ·|Live ·/)).toBeNull()
  })

  it('sorts connected connections before disconnected ones, alphabetically within each group', () => {
    connectedIds = new Set(['c-3']) // mango is the only connected one
    render(<ActiveConnectionsPanel />)
    const names = screen.getAllByText(/^(zebra|apple|mango)$/).map((el) => el.textContent)
    // mango (connected) first, then apple/zebra alphabetically among the disconnected.
    expect(names).toEqual(['mango', 'apple', 'zebra'])
  })

  it('renders no Live section when nothing is connected', () => {
    render(<ActiveConnectionsPanel />)
    expect(screen.queryByText(/Live ·/)).toBeNull()
    expect(screen.getByText('Saved · 3')).toBeInTheDocument()
  })

  it('renders a Live section sized to just the connected subset', () => {
    connectedIds = new Set(['c-1', 'c-2'])
    render(<ActiveConnectionsPanel />)
    expect(screen.getByText('Live · 2')).toBeInTheDocument()
    expect(screen.getByText('Saved · 1')).toBeInTheDocument()
  })

  it('Delete from the row menu opens a confirmation dialog naming that connection, without deleting yet', async () => {
    const user = userEvent.setup()
    render(<ActiveConnectionsPanel />)
    await user.click(moreActionsFor('zebra'))
    const menu = await screen.findByRole('menu')
    await user.click(within(menu).getByRole('menuitem', { name: 'Delete connection…' }))

    expect(await screen.findByText('Delete connection')).toBeInTheDocument()
    expect(screen.getByText('Delete "zebra"? This can\'t be undone.')).toBeInTheDocument()
    expect(mockDeleteConnection).not.toHaveBeenCalled()
  })

  it('confirming the dialog deletes exactly the connection that was targeted', async () => {
    const user = userEvent.setup()
    render(<ActiveConnectionsPanel />)
    await user.click(moreActionsFor('zebra'))
    const menu = await screen.findByRole('menu')
    await user.click(within(menu).getByRole('menuitem', { name: 'Delete connection…' }))
    await screen.findByText('Delete connection')
    await user.click(screen.getByRole('button', { name: 'Delete' }))

    expect(mockDeleteConnection).toHaveBeenCalledTimes(1)
    expect(mockDeleteConnection).toHaveBeenCalledWith('c-1') // zebra's id
  })

  it('canceling the dialog leaves the connection alone', async () => {
    const user = userEvent.setup()
    render(<ActiveConnectionsPanel />)
    await user.click(moreActionsFor('mango'))
    const menu = await screen.findByRole('menu')
    await user.click(within(menu).getByRole('menuitem', { name: 'Delete connection…' }))
    await screen.findByText('Delete connection')
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(mockDeleteConnection).not.toHaveBeenCalled()
    // The dialog stays mounted (only its native `open` toggles) — a stale
    // `open` after Cancel is exactly the bug this guards against.
    expect(screen.getByText('Delete connection').closest('dialog')).not.toHaveAttribute('open')
  })

  it('a failed connect() surfaces an error toast instead of throwing', async () => {
    mockConnect.mockResolvedValueOnce({ success: false, error: 'refused by host' })
    const user = userEvent.setup()
    render(<ActiveConnectionsPanel />)
    await user.click(moreActionsFor('apple'))
    const menu = await screen.findByRole('menu')
    await user.click(within(menu).getByRole('menuitem', { name: 'Connect' }))

    expect(mockConnect).toHaveBeenCalledWith('c-2')
    expect(useToastStore.getState().toasts.some((t) => t.type === 'error')).toBe(true)
  })

  it('a successful connect() does not raise an error toast', async () => {
    const user = userEvent.setup()
    render(<ActiveConnectionsPanel />)
    await user.click(moreActionsFor('apple'))
    const menu = await screen.findByRole('menu')
    await user.click(within(menu).getByRole('menuitem', { name: 'Connect' }))

    expect(mockConnect).toHaveBeenCalledWith('c-2')
    expect(useToastStore.getState().toasts.some((t) => t.type === 'error')).toBe(false)
  })

  it('opening a query tab activates the connection and seeds the tab from its autoCommit default', async () => {
    connectedIds = new Set(['c-1'])
    const user = userEvent.setup()
    render(<ActiveConnectionsPanel />)
    await user.click(moreActionsFor('zebra'))
    const menu = await screen.findByRole('menu')
    await user.click(within(menu).getByRole('menuitem', { name: 'Open query tab' }))

    expect(mockSetActiveConnection).toHaveBeenCalledWith('c-1')
    // No `defaultAutoCommit` on the profile ⇒ initialAutoCommit falls back to true.
    expect(mockAddQueryTab).toHaveBeenCalledWith('c-1', null, { autoCommit: true })
  })

  it('clicking "New connection" in the header opens the connection form for a brand new profile', async () => {
    const user = userEvent.setup()
    render(<ActiveConnectionsPanel />)
    await user.click(screen.getByRole('button', { name: 'New connection' }))
    expect(mockOpenConnectionForm).toHaveBeenCalledWith()
  })
})
