import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConnectionTestButton } from '../../../../src/renderer/src/components/connections/ConnectionTestButton'
import type { ConnectionProfile } from '../../../../shared/types'

const profile: ConnectionProfile = {
  id: 'test-1',
  name: 'Test DB',
  type: 'postgresql',
  host: 'localhost',
  port: 5432,
  database: 'testdb',
  username: 'postgres',
  password: '',
}

const mockInvoke = vi.fn()

describe('ConnectionTestButton', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers({ shouldAdvanceTime: true })
    Object.defineProperty(window, 'electronAPI', {
      value: { invoke: mockInvoke, on: vi.fn().mockReturnValue(vi.fn()) },
      writable: true,
      configurable: true,
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('disables the button while the test is in flight', async () => {
    let resolveInvoke: (v: unknown) => void
    mockInvoke.mockReturnValue(new Promise((resolve) => { resolveInvoke = resolve }))
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<ConnectionTestButton profile={profile} />)

    const button = screen.getByRole('button', { name: 'Test Connection' })
    await user.click(button)
    expect(button).toBeDisabled()

    resolveInvoke!({ success: true })
    await waitFor(() => expect(button).not.toBeDisabled())
  })

  it('shows a success alert including the version on a successful test', async () => {
    mockInvoke.mockResolvedValue({ success: true, version: 'PostgreSQL 16.1' })
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<ConnectionTestButton profile={profile} />)
    await user.click(screen.getByRole('button', { name: 'Test Connection' }))

    expect(await screen.findByText('Connection successful')).toBeInTheDocument()
    expect(screen.getByText('PostgreSQL 16.1')).toBeInTheDocument()
  })

  it('falls back to a generic "Connected" message when the driver reports no version', async () => {
    mockInvoke.mockResolvedValue({ success: true })
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<ConnectionTestButton profile={profile} />)
    await user.click(screen.getByRole('button', { name: 'Test Connection' }))

    expect(await screen.findByText('Connected')).toBeInTheDocument()
  })

  it('appends extra "key: value" details after the version, pipe-joined', async () => {
    mockInvoke.mockResolvedValue({
      success: true,
      version: 'MySQL 8.0',
      details: { latency: '12ms', ssl: 'on' },
    })
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<ConnectionTestButton profile={profile} />)
    await user.click(screen.getByRole('button', { name: 'Test Connection' }))

    expect(await screen.findByText('MySQL 8.0 | latency: 12ms | ssl: on')).toBeInTheDocument()
  })

  it('shows an error alert with the driver-reported message on failure', async () => {
    mockInvoke.mockResolvedValue({ success: false, error: 'password authentication failed' })
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<ConnectionTestButton profile={profile} />)
    await user.click(screen.getByRole('button', { name: 'Test Connection' }))

    expect(await screen.findByText('Connection failed')).toBeInTheDocument()
    expect(screen.getByText('password authentication failed')).toBeInTheDocument()
  })

  it('falls back to a generic failure message when the driver gives no error text', async () => {
    mockInvoke.mockResolvedValue({ success: false })
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<ConnectionTestButton profile={profile} />)
    await user.click(screen.getByRole('button', { name: 'Test Connection' }))

    // The alert title AND its body both read "Connection failed" — the body
    // falls back to the generic connections.connectionFailed string too.
    await waitFor(() => expect(screen.getAllByText('Connection failed')).toHaveLength(2))
  })

  it('auto-clears the result back to idle after 3 seconds', async () => {
    mockInvoke.mockResolvedValue({ success: true, version: 'v1' })
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<ConnectionTestButton profile={profile} />)
    await user.click(screen.getByRole('button', { name: 'Test Connection' }))
    await screen.findByText('Connection successful')

    vi.advanceTimersByTime(3000)
    await waitFor(() => expect(screen.queryByText('Connection successful')).toBeNull())
  })

  it('passes the exact profile object being edited to the test IPC call', async () => {
    mockInvoke.mockResolvedValue({ success: true })
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const customProfile = { ...profile, host: 'db.internal', port: 6543 }
    render(<ConnectionTestButton profile={customProfile} />)
    await user.click(screen.getByRole('button', { name: 'Test Connection' }))

    expect(mockInvoke).toHaveBeenCalledWith('db:test-connection', customProfile)
  })
})
