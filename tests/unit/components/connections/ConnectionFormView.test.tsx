import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConnectionFormView } from '../../../../src/renderer/src/components/connections/ConnectionFormView'

// Plugin driver data matching what the real plugins register
const mockPluginDrivers = [
  {
    driverId: 'postgresql',
    driverName: 'PostgreSQL',
    connectionFields: [
      { key: 'host', label: 'Host', type: 'text', required: true, default: 'localhost' },
      { key: 'port', label: 'Port', type: 'number', required: true, default: 5432 },
      { key: 'database', label: 'Database', type: 'text', required: true },
      { key: 'username', label: 'Username', type: 'text' },
      { key: 'password', label: 'Password', type: 'password' },
      { key: 'ssl', label: 'SSL', type: 'boolean', default: false },
    ]
  },
  {
    driverId: 'sqlite',
    driverName: 'SQLite',
    connectionFields: [
      { key: 'database', label: 'Database File', type: 'file', required: true },
    ]
  }
]

// Mock electronAPI
const mockInvoke = vi.fn().mockImplementation((channel: string) => {
  if (channel === 'plugins:connection-fields') return Promise.resolve(mockPluginDrivers)
  if (channel === 'plugins:middleware-fields') return Promise.resolve([])
  return Promise.resolve([])
})
const mockOn = vi.fn().mockReturnValue(vi.fn())
Object.defineProperty(window, 'electronAPI', {
  value: { invoke: mockInvoke, on: mockOn },
  writable: true
})

// Mock stores
const mockSaveConnection = vi.fn().mockResolvedValue(undefined)
const mockCloseTab = vi.fn()
const mockConnections: any[] = []

vi.mock('../../../../src/renderer/src/stores/connections', () => ({
  useConnectionsStore: (selector: any) => selector({
    connections: mockConnections,
    saveConnection: mockSaveConnection
  })
}))

vi.mock('../../../../src/renderer/src/stores/tabs', () => ({
  useTabsStore: (selector: any) => selector({
    closeTab: mockCloseTab
  })
}))

describe('ConnectionFormView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'plugins:connection-fields') return Promise.resolve(mockPluginDrivers)
      if (channel === 'plugins:middleware-fields') return Promise.resolve([])
      return Promise.resolve([])
    })
  })

  it('renders the new connection heading', () => {
    render(<ConnectionFormView tabId="conn-form-new" />)
    expect(screen.getByText('New Connection')).toBeTruthy()
  })

  it('renders database type select', async () => {
    render(<ConnectionFormView tabId="conn-form-new" />)
    await waitFor(() => {
      const select = screen.getByRole('combobox', { name: 'Database Type' })
      expect(select).toBeTruthy()
    })
  })

  it('renders connection name input', () => {
    render(<ConnectionFormView tabId="conn-form-new" />)
    expect(screen.getByLabelText('Connection Name')).toBeTruthy()
  })

  it('renders host and port for postgresql', async () => {
    render(<ConnectionFormView tabId="conn-form-new" />)
    await waitFor(() => {
      expect(screen.getByLabelText('Host')).toBeTruthy()
      expect(screen.getByLabelText('Port')).toBeTruthy()
    })
  })

  it('renders password input for postgresql', async () => {
    render(<ConnectionFormView tabId="conn-form-new" />)
    await waitFor(() => {
      expect(screen.getByLabelText('Password')).toBeTruthy()
    })
  })

  // A checkbox, not a switch. Every boolean in this form writes to a draft that
  // only persists on Save and that Cancel discards, so a switch would promise
  // an immediacy it doesn't have. Settings keep their switches — those apply
  // the moment you flip them.
  it('renders the SSL field for postgresql as a checkbox, not a switch', async () => {
    render(<ConnectionFormView tabId="conn-form-new" />)
    await waitFor(() => {
      expect(screen.getByRole('checkbox', { name: /ssl/i })).toBeTruthy()
    })
    expect(screen.queryByRole('switch', { name: /ssl/i })).toBeNull()
  })

  it('leaves the SSL checkbox clickable via its label text', async () => {
    render(<ConnectionFormView tabId="conn-form-new" />)
    const box = await screen.findByRole('checkbox', { name: /ssl/i })
    expect((box as HTMLInputElement).checked).toBe(false)
    // The label wraps the box, so the browser forwards this to the input once —
    // no hand-reconciled row onClick.
    fireEvent.click(screen.getByText(/ssl/i))
    expect((box as HTMLInputElement).checked).toBe(true)
  })

  it('renders cancel and save buttons', () => {
    render(<ConnectionFormView tabId="conn-form-new" />)
    expect(screen.getByText('Cancel')).toBeTruthy()
    expect(screen.getByText('Add Connection')).toBeTruthy()
  })

  it('shows database file input for sqlite', async () => {
    render(<ConnectionFormView tabId="conn-form-new" />)
    // Wait for plugin drivers to load
    await waitFor(() => {
      expect(screen.getByRole('combobox', { name: 'Database Type' })).toBeTruthy()
    })
    const trigger = screen.getByRole('combobox', { name: 'Database Type' })
    await userEvent.click(trigger)
    const sqliteOption = await screen.findByRole('option', { name: 'SQLite' })
    await userEvent.click(sqliteOption)
    await waitFor(() => {
      expect(screen.getByText('Database File')).toBeTruthy()
      expect(screen.queryByText('Host')).toBeNull()
    })
  })

  it('closes tab on cancel click', async () => {
    render(<ConnectionFormView tabId="conn-form-new" />)
    await userEvent.click(screen.getByText('Cancel'))
    expect(mockCloseTab).toHaveBeenCalledWith('conn-form-new')
  })
})
