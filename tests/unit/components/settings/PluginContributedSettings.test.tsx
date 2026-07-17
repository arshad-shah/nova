import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PluginContributedSettings } from '../../../../src/renderer/src/components/settings/PluginContributedSettings'

let invokeImpl: (channel: string, ...args: unknown[]) => unknown
const mockInvoke = vi.fn((channel: string, ...args: unknown[]) => Promise.resolve(invokeImpl(channel, ...args)))
const mockOn = vi.fn().mockReturnValue(vi.fn())

function setupIpc(overrides: Partial<Record<string, (...args: unknown[]) => unknown>> = {}) {
  const base: Record<string, (...args: unknown[]) => unknown> = {
    'plugins:get-categorized-settings': () => [],
    ...overrides,
  }
  invokeImpl = (channel, ...args) => base[channel]?.(...args)
}

describe('PluginContributedSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.defineProperty(window, 'electronAPI', { value: { invoke: mockInvoke, on: mockOn }, writable: true, configurable: true })
    setupIpc()
  })

  it('requests settings scoped to the given category', async () => {
    render(<PluginContributedSettings category="ai" />)
    await waitFor(() => expect(mockInvoke).toHaveBeenCalledWith('plugins:get-categorized-settings', 'ai'))
  })

  it('renders nothing at all when no plugin contributes to this category', () => {
    const { container } = render(<PluginContributedSettings category="editor" />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders a "From <plugin>" heading plus each contributed setting row', async () => {
    setupIpc({
      'plugins:get-categorized-settings': () => [{
        pluginName: 'verql-plugin-ai',
        pluginDisplayName: 'AI Assistant',
        schema: [{ key: 'temperature', title: 'Temperature', type: 'number', min: 0, max: 2 }],
        values: { temperature: 0.7 },
      }],
    })
    render(<PluginContributedSettings category="ai" />)
    expect(await screen.findByText('From AI Assistant')).toBeInTheDocument()
    expect(screen.getByText('Temperature')).toBeInTheDocument()
  })

  it('a boolean schema entry renders as a Switch reflecting the current value', async () => {
    setupIpc({
      'plugins:get-categorized-settings': () => [{
        pluginName: 'p', pluginDisplayName: 'P',
        schema: [{ key: 'flag', title: 'Flag', type: 'boolean' }],
        values: { flag: true },
      }],
    })
    render(<PluginContributedSettings category="general" />)
    expect(await screen.findByRole('switch', { name: 'Flag' })).toBeChecked()
  })

  it('changing a setting persists via plugins:set-setting with the owning plugin name and key', async () => {
    const setSetting = vi.fn()
    setupIpc({
      'plugins:set-setting': setSetting,
      'plugins:get-categorized-settings': () => [{
        pluginName: 'verql-plugin-ai', pluginDisplayName: 'AI Assistant',
        schema: [{ key: 'flag', title: 'Flag', type: 'boolean' }],
        values: { flag: false },
      }],
    })
    const user = userEvent.setup()
    render(<PluginContributedSettings category="ai" />)
    const toggle = await screen.findByRole('switch', { name: 'Flag' })
    await user.click(toggle)

    expect(setSetting).toHaveBeenCalledWith('verql-plugin-ai', 'flag', true)
  })

  // updateValue awaits the IPC round-trip BEFORE patching local state — the
  // control stays at its old value while the write is in flight, and only
  // flips once plugins:set-setting resolves. Not optimistic, despite reading
  // like it might be at a glance.
  it('a pending edit does NOT flip the control until plugins:set-setting resolves', async () => {
    let resolveSet: (() => void) | undefined
    setupIpc({
      'plugins:set-setting': () => new Promise<void>((r) => { resolveSet = r }),
      'plugins:get-categorized-settings': () => [{
        pluginName: 'p', pluginDisplayName: 'P',
        schema: [{ key: 'flag', title: 'Flag', type: 'boolean' }],
        values: { flag: false },
      }],
    })
    const user = userEvent.setup()
    render(<PluginContributedSettings category="general" />)
    const toggle = await screen.findByRole('switch', { name: 'Flag' })
    await user.click(toggle)

    expect(toggle).not.toBeChecked()
    resolveSet?.()
    await waitFor(() => expect(toggle).toBeChecked())
  })

  it('falls back to an empty (no) render when the IPC call rejects', async () => {
    setupIpc({ 'plugins:get-categorized-settings': () => Promise.reject(new Error('boom')) })
    const { container } = render(<PluginContributedSettings category="general" />)
    await waitFor(() => expect(container).toBeEmptyDOMElement())
  })

  it('refetches when a PLUGINS_LIFECYCLE event fires (a plugin was toggled elsewhere)', async () => {
    let lifecycleHandler: (() => void) | undefined
    mockOn.mockImplementation((_event: string, handler: () => void) => {
      lifecycleHandler = handler
      return vi.fn()
    })
    const getCategorized = vi.fn(() => [])
    setupIpc({ 'plugins:get-categorized-settings': getCategorized })
    render(<PluginContributedSettings category="general" />)
    await waitFor(() => expect(getCategorized).toHaveBeenCalledTimes(1))

    lifecycleHandler?.()
    await waitFor(() => expect(getCategorized).toHaveBeenCalledTimes(2))
  })
})
