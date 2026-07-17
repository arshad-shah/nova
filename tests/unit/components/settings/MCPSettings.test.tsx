import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MCPSettings } from '../../../../src/renderer/src/components/settings/categories/MCPSettings'

const mcpSettings = { port: 3100, autoPort: true, readOnly: false, maxRows: 500, token: '', disabledTools: [] as string[] }
const mockSet = vi.fn().mockResolvedValue(undefined)

vi.mock('../../../../src/renderer/src/stores/settings', () => ({
  useSettingsStore: (selector: any) => selector({ settings: { mcp: mcpSettings }, set: mockSet }),
}))

const STOPPED = { running: false, port: 3100, clients: 0, token: '', autoSelectedPort: false }
const RUNNING = { running: true, port: 3100, clients: 2, token: 'tok-abc', autoSelectedPort: false }

let invokeImpl: (channel: string, ...args: unknown[]) => unknown
const mockInvoke = vi.fn((channel: string, ...args: unknown[]) => Promise.resolve(invokeImpl(channel, ...args)))
const mockOn = vi.fn().mockReturnValue(vi.fn())

function setupIpc(overrides: Partial<Record<string, (...args: unknown[]) => unknown>> = {}) {
  const base: Record<string, (...args: unknown[]) => unknown> = {
    'mcp:status': () => STOPPED,
    'mcp:tools': () => [],
    'mcp:activity': () => [],
    'plugins:get-categorized-settings': () => [],
    ...overrides,
  }
  invokeImpl = (channel: string, ...args: unknown[]) => base[channel]?.(...args)
}

describe('MCPSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: vi.fn().mockResolvedValue(undefined) }, configurable: true })
    Object.defineProperty(window, 'electronAPI', { value: { invoke: mockInvoke, on: mockOn }, writable: true, configurable: true })
    setupIpc()
  })

  it('polls status/tools/activity on mount and shows the stopped state', async () => {
    render(<MCPSettings />)
    expect(await screen.findByText('Server is stopped')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Start Server' })).toBeInTheDocument()
  })

  it('shows the running state with live port + client count once started', async () => {
    setupIpc({ 'mcp:status': () => RUNNING })
    render(<MCPSettings />)
    expect(await screen.findByText('Running on port 3100 · 2 clients connected')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Stop Server' })).toBeInTheDocument()
  })

  it('clicking Start Server calls mcp:start then refreshes to the now-running status', async () => {
    // A live flag the status stub reads, so status only flips to "running"
    // once mcp:start has actually been invoked — like the real main process.
    let running = false
    const start = vi.fn(() => { running = true })
    setupIpc({ 'mcp:start': start, 'mcp:status': () => (running ? RUNNING : STOPPED) })
    const user = userEvent.setup()
    render(<MCPSettings />)
    await screen.findByText('Server is stopped')
    await user.click(screen.getByRole('button', { name: 'Start Server' }))

    expect(start).toHaveBeenCalledTimes(1)
    expect(await screen.findByRole('button', { name: 'Stop Server' })).toBeInTheDocument()
  })

  it('a port-in-use failure renders the friendly "already in use" message, not the raw error', async () => {
    setupIpc({ 'mcp:start': () => { throw new Error('Port 3100 is already in use') } })
    const user = userEvent.setup()
    render(<MCPSettings />)
    await screen.findByText('Server is stopped')
    await user.click(screen.getByRole('button', { name: 'Start Server' }))

    expect(await screen.findByText('Port 3100 is already in use. Enable auto-port or pick another.')).toBeInTheDocument()
  })

  it('a non-port-conflict start failure surfaces the raw error message', async () => {
    setupIpc({ 'mcp:start': () => { throw new Error('unexpected boom') } })
    const user = userEvent.setup()
    render(<MCPSettings />)
    await screen.findByText('Server is stopped')
    await userEvent.setup().click(screen.getByRole('button', { name: 'Start Server' }))

    expect(await screen.findByText('unexpected boom')).toBeInTheDocument()
  })

  it('the port input is disabled while the server is running', async () => {
    setupIpc({ 'mcp:status': () => RUNNING })
    render(<MCPSettings />)
    expect(await screen.findByRole('spinbutton', { name: 'MCP server port' })).toBeDisabled()
  })

  it('regenerating the token calls mcp:regenerate-token and refreshes', async () => {
    const regen = vi.fn().mockResolvedValue({ ...RUNNING, token: 'new-token' })
    setupIpc({ 'mcp:regenerate-token': regen, 'mcp:status': () => RUNNING })
    const user = userEvent.setup()
    render(<MCPSettings />)
    await screen.findByText('Running on port 3100 · 2 clients connected')
    await user.click(screen.getByRole('button', { name: 'Regenerate token' }))
    expect(regen).toHaveBeenCalledTimes(1)
  })

  it('toggling a tool optimistically flips its switch and persists via mcp:set-tool-enabled', async () => {
    const setEnabled = vi.fn().mockResolvedValue(undefined)
    setupIpc({
      'mcp:tools': () => [{ id: 'query', name: 'Query', description: 'Run a query', enabled: true }],
      'mcp:set-tool-enabled': setEnabled,
    })
    const user = userEvent.setup()
    render(<MCPSettings />)
    const toggle = await screen.findByRole('switch', { name: 'Enable Query' })
    expect(toggle).toBeChecked()
    await user.click(toggle)

    expect(setEnabled).toHaveBeenCalledWith('query', false)
  })

  it('enabling read-only mode while running reloads the server', async () => {
    const reload = vi.fn().mockResolvedValue(undefined)
    setupIpc({ 'mcp:status': () => RUNNING, 'mcp:reload': reload })
    const user = userEvent.setup()
    render(<MCPSettings />)
    await screen.findByText('Running on port 3100 · 2 clients connected')
    await user.click(screen.getByRole('switch', { name: 'Read-only mode' }))

    expect(mockSet).toHaveBeenCalledWith('mcp.readOnly', true)
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('toggling read-only while stopped does not reload (nothing running to reload)', async () => {
    const reload = vi.fn()
    setupIpc({ 'mcp:reload': reload })
    const user = userEvent.setup()
    render(<MCPSettings />)
    await screen.findByText('Server is stopped')
    await user.click(screen.getByRole('switch', { name: 'Read-only mode' }))

    expect(mockSet).toHaveBeenCalledWith('mcp.readOnly', true)
    expect(reload).not.toHaveBeenCalled()
  })

  it('shows the empty-activity copy when the activity log is empty', async () => {
    render(<MCPSettings />)
    expect(await screen.findByText('No MCP tool calls yet.')).toBeInTheDocument()
  })

  it('renders recent activity newest-first', async () => {
    setupIpc({
      'mcp:activity': () => [
        { id: '1', toolId: 'first', status: 'ok', paramsSummary: '', durationMs: 5 },
        { id: '2', toolId: 'second', status: 'ok', paramsSummary: '', durationMs: 7 },
      ],
    })
    render(<MCPSettings />)
    const rows = await screen.findAllByText(/first|second/)
    expect(rows.map((r) => r.textContent)).toEqual(['second', 'first'])
  })
})
