import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConnectionSelector } from '../../../../src/renderer/src/components/query/ConnectionSelector'

/**
 * Behavioural tests for `ConnectionSelector` after replacing its three
 * hand-rolled dropdowns with the `DropdownMenu` primitive (see
 * `docs/ui-modularity-followups.md` item 1). Assert what the component
 * *does* — which handlers fire, which row is announced as active, and that
 * only one menu is open at a time — not just that labels render.
 */

const mockConnections = [
  { id: 'conn-1', name: 'Prod', color: '#ff0000', database: 'app', type: 'postgresql' },
  { id: 'conn-2', name: 'Staging', color: '#00ff00', database: 'app', type: 'postgresql' },
  { id: 'conn-3', name: 'Local (off)', color: '#0000ff', database: 'app', type: 'sqlite' },
]

const mockConnect = vi.fn().mockResolvedValue({ success: true })

vi.mock('../../../../src/renderer/src/stores/connections', () => ({
  useConnectionsStore: () => ({
    connections: mockConnections,
    connectedIds: new Set(['conn-1', 'conn-2']),
    connect: mockConnect,
  }),
}))

const mockFetchDatabases = vi.fn().mockResolvedValue(['app', 'analytics'])
const mockFetchSchemas = vi.fn().mockResolvedValue(['public', 'sales'])
const mockSwitchDatabase = vi.fn().mockResolvedValue(undefined)

vi.mock('../../../../src/renderer/src/stores/schema', () => ({
  useSchemaStore: () => ({
    fetchDatabases: mockFetchDatabases,
    fetchSchemas: mockFetchSchemas,
    switchDatabase: mockSwitchDatabase,
  }),
}))

const mockSetTabConnection = vi.fn()
const mockSetTabDatabase = vi.fn()
const mockSetTabSchema = vi.fn()
const mockSetTabTxnStatus = vi.fn()

vi.mock('../../../../src/renderer/src/stores/tabs', () => ({
  useTabsStore: () => ({
    setTabConnection: mockSetTabConnection,
    setTabDatabase: mockSetTabDatabase,
    setTabSchema: mockSetTabSchema,
    setTabTxnStatus: mockSetTabTxnStatus,
  }),
}))

vi.mock('../../../../src/renderer/src/stores/driver-capabilities', () => ({
  useDriverCapabilitiesStore: (selector: (s: { fetch: () => Promise<null> }) => unknown) =>
    selector({ fetch: () => Promise.resolve(null) }),
}))

vi.mock('../../../../src/renderer/src/lib/pick-default-schema', () => ({
  pickDefaultSchema: () => null,
}))

Object.defineProperty(window, 'electronAPI', {
  value: { invoke: vi.fn().mockResolvedValue(undefined), on: vi.fn().mockReturnValue(vi.fn()) },
  writable: true,
})

function renderSelector(props?: Partial<React.ComponentProps<typeof ConnectionSelector>>) {
  return render(
    <ConnectionSelector
      tabId="tab-1"
      connectionId="conn-1"
      database="app"
      schema="public"
      {...props}
    />
  )
}

describe('ConnectionSelector', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockConnect.mockResolvedValue({ success: true })
    mockFetchDatabases.mockResolvedValue(['app', 'analytics'])
    mockFetchSchemas.mockResolvedValue(['public', 'sales'])
  })

  it('lists connected connections and disconnected ones under a separate section', async () => {
    const user = userEvent.setup()
    renderSelector()

    await user.click(screen.getByRole('button', { name: /Prod/ }))
    const menu = await screen.findByRole('menu')

    expect(within(menu).getByRole('menuitem', { name: /Prod/ })).toBeInTheDocument()
    expect(within(menu).getByRole('menuitem', { name: /Staging/ })).toBeInTheDocument()

    const disconnectedGroup = within(menu).getByRole('group', { name: /disconnected/i })
    expect(within(disconnectedGroup).getByRole('menuitem', { name: /Local \(off\)/ })).toBeInTheDocument()
  })

  it('selecting a connected connection sets it as the tab connection', async () => {
    const user = userEvent.setup()
    renderSelector()

    await user.click(screen.getByRole('button', { name: /Prod/ }))
    await screen.findByRole('menu')
    await user.click(screen.getByRole('menuitem', { name: /Staging/ }))

    expect(mockSetTabConnection).toHaveBeenCalledWith('tab-1', 'conn-2')
    // Releases the old connection's session before switching.
    expect(window.electronAPI.invoke).toHaveBeenCalledWith('db:session:close', 'conn-1', 'tab-1')
  })

  it('selecting a disconnected connection connects first, then activates it', async () => {
    const user = userEvent.setup()
    renderSelector()

    await user.click(screen.getByRole('button', { name: /Prod/ }))
    await screen.findByRole('menu')
    await user.click(screen.getByRole('menuitem', { name: /Local \(off\)/ }))

    await waitFor(() => expect(mockConnect).toHaveBeenCalledWith('conn-3'))
    await waitFor(() => expect(mockSetTabConnection).toHaveBeenCalledWith('tab-1', 'conn-3'))
  })

  it('does not activate a disconnected connection when connecting fails', async () => {
    mockConnect.mockResolvedValueOnce({ success: false, error: 'refused' })
    const user = userEvent.setup()
    renderSelector()

    await user.click(screen.getByRole('button', { name: /Prod/ }))
    await screen.findByRole('menu')
    await user.click(screen.getByRole('menuitem', { name: /Local \(off\)/ }))

    await waitFor(() => expect(mockConnect).toHaveBeenCalledWith('conn-3'))
    expect(mockSetTabConnection).not.toHaveBeenCalled()
  })

  it('lists fetched databases and marks the active one as checked', async () => {
    const user = userEvent.setup()
    renderSelector({ database: 'app' })

    const dbTrigger = await screen.findByRole('button', { name: /app/ })
    await user.click(dbTrigger)
    const menu = await screen.findByRole('menu')

    const radios = within(menu).getAllByRole('menuitemradio')
    expect(radios).toHaveLength(2)
    const active = radios.find((r) => r.getAttribute('aria-checked') === 'true')
    expect(active).toHaveTextContent('app')
    expect(radios.find((r) => r.getAttribute('aria-checked') === 'false')).toHaveTextContent('analytics')
  })

  it('selecting a database switches it, calls the handler, and resets the schema', async () => {
    const user = userEvent.setup()
    renderSelector({ database: 'app' })

    const dbTrigger = await screen.findByRole('button', { name: /app/ })
    await user.click(dbTrigger)
    await screen.findByRole('menu')
    await user.click(screen.getByRole('menuitemradio', { name: /analytics/ }))

    expect(mockSwitchDatabase).toHaveBeenCalledWith('conn-1', 'analytics')
    expect(mockSetTabDatabase).toHaveBeenCalledWith('tab-1', 'analytics')
    expect(mockSetTabSchema).toHaveBeenCalledWith('tab-1', '')
  })

  it('lists fetched schemas and marks the active one as checked', async () => {
    const user = userEvent.setup()
    renderSelector({ schema: 'public' })

    const schemaTrigger = await screen.findByRole('button', { name: /public/ })
    await user.click(schemaTrigger)
    const menu = await screen.findByRole('menu')

    const radios = within(menu).getAllByRole('menuitemradio')
    expect(radios).toHaveLength(2)
    expect(radios.find((r) => r.getAttribute('aria-checked') === 'true')).toHaveTextContent('public')
  })

  it('selecting a schema calls the handler', async () => {
    const user = userEvent.setup()
    renderSelector({ schema: 'public' })

    const schemaTrigger = await screen.findByRole('button', { name: /public/ })
    await user.click(schemaTrigger)
    await screen.findByRole('menu')
    await user.click(screen.getByRole('menuitemradio', { name: /sales/ }))

    expect(mockSetTabSchema).toHaveBeenCalledWith('tab-1', 'sales')
  })

  it('only one of the three menus is open at a time', async () => {
    const user = userEvent.setup()
    renderSelector({ database: 'app', schema: 'public' })

    const connTrigger = screen.getByRole('button', { name: /Prod/ })
    const dbTrigger = await screen.findByRole('button', { name: /app/ })

    await user.click(connTrigger)
    expect(await screen.findAllByRole('menu')).toHaveLength(1)

    // Opening the database menu must close the connection menu — separate
    // DropdownMenus each own their state, and clicking a different trigger
    // dismisses whatever else was open via outside-click/focus-out dismissal.
    await user.click(dbTrigger)
    await waitFor(() => expect(screen.getAllByRole('menu')).toHaveLength(1))
    expect(within(screen.getByRole('menu')).queryByRole('menuitem', { name: /Staging/ })).not.toBeInTheDocument()
  })
})
