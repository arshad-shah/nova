import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PluginSettings } from '../../../../src/renderer/src/components/settings/categories/PluginSettings'

const PLUGINS = [
  { name: 'core-formats', displayName: 'Core Formats', version: '1.0.0', description: 'CSV/JSON', bundled: true, status: { state: 'active' }, contributions: ['exporter'] },
  { name: 'snowflake', displayName: 'Snowflake', version: '1.2.0', description: 'Snowflake driver', bundled: true, status: { state: 'inactive' }, contributions: ['driver'] },
]

const SETTINGS_BY_PLUGIN: Record<string, unknown> = {
  'core-formats': { schema: [{ key: 'delimiter', title: 'Delimiter', type: 'text' }], values: { delimiter: ',' } },
}

let invokeImpl: (channel: string, ...args: unknown[]) => unknown
const mockInvoke = vi.fn((channel: string, ...args: unknown[]) => Promise.resolve(invokeImpl(channel, ...args)))
const mockOn = vi.fn().mockReturnValue(vi.fn())

function setupIpc(overrides: Partial<Record<string, (...args: unknown[]) => unknown>> = {}) {
  const base: Record<string, (...args: unknown[]) => unknown> = {
    'plugins:list': () => PLUGINS,
    'plugins:get-settings': (name: unknown) => SETTINGS_BY_PLUGIN[name as string] ?? { schema: [], values: {} },
    'plugins:ui:get-contributions': () => [],
    ...overrides,
  }
  invokeImpl = (channel, ...args) => base[channel]?.(...args)
}

describe('PluginSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.defineProperty(window, 'electronAPI', { value: { invoke: mockInvoke, on: mockOn }, writable: true, configurable: true })
    setupIpc()
  })

  it('shows a loading spinner until the plugin list resolves', async () => {
    let resolveList: (v: unknown) => void
    setupIpc({ 'plugins:list': () => new Promise((r) => { resolveList = r }) })
    render(<PluginSettings />)
    // No plugin rows yet.
    expect(screen.queryByText('Core Formats')).toBeNull()
    resolveList!(PLUGINS)
    expect(await screen.findByText('Core Formats')).toBeInTheDocument()
  })

  it('fetches settings only for active/degraded plugins, not inactive ones', async () => {
    const getSettings = vi.fn((name: unknown) => SETTINGS_BY_PLUGIN[name as string] ?? { schema: [], values: {} })
    setupIpc({ 'plugins:get-settings': getSettings })
    render(<PluginSettings />)
    await screen.findByText('Snowflake')

    expect(getSettings).toHaveBeenCalledWith('core-formats')
    expect(getSettings).not.toHaveBeenCalledWith('snowflake')
  })

  it('renders an own-category setting row for an active plugin with a schema', async () => {
    render(<PluginSettings />)
    expect(await screen.findByText('Delimiter')).toBeInTheDocument()
  })

  it('an inactive plugin renders no own-setting rows underneath it, unlike the active plugin above it', async () => {
    setupIpc({
      'plugins:get-settings': () => ({ schema: [{ key: 'apiKey', title: 'API Key', type: 'text' }], values: {} }),
    })
    render(<PluginSettings />)
    const snowflakeName = await screen.findByText('Snowflake')
    const snowflakeRow = snowflakeName.closest('div')!.parentElement!.parentElement as HTMLElement
    // "API Key" would only show if settings were (incorrectly) fetched/rendered
    // for the inactive plugin too.
    expect(within(snowflakeRow).queryByText('API Key')).toBeNull()
  })

  it('shows the "Bundled" tag for bundled plugins', async () => {
    render(<PluginSettings />)
    const tags = await screen.findAllByText('Bundled')
    expect(tags).toHaveLength(2)
  })

  it('surfaces the plugin error message when status carries one', async () => {
    setupIpc({
      'plugins:list': () => [
        { ...PLUGINS[1], status: { state: 'degraded', error: 'failed to load native binding' } },
      ],
    })
    render(<PluginSettings />)
    expect(await screen.findByText('failed to load native binding')).toBeInTheDocument()
  })

  it('toggling a plugin on calls plugins:activate and refreshes the plugin-ui contribution surfaces', async () => {
    const activate = vi.fn()
    setupIpc({ 'plugins:activate': activate })
    const user = userEvent.setup()
    render(<PluginSettings />)
    const toggle = await screen.findByRole('switch', { name: 'Toggle Snowflake' })
    await user.click(toggle)

    expect(activate).toHaveBeenCalledWith('snowflake')
    // Contribution surfaces refreshed post-toggle (statusBar/activityBar/panels/contextMenu).
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('plugins:ui:get-contributions', 'statusBar')
      expect(mockInvoke).toHaveBeenCalledWith('plugins:ui:get-contributions', 'contextMenu')
    })
  })

  it('toggling a plugin off calls plugins:deactivate, not activate', async () => {
    const deactivate = vi.fn()
    setupIpc({ 'plugins:deactivate': deactivate })
    const user = userEvent.setup()
    render(<PluginSettings />)
    const toggle = await screen.findByRole('switch', { name: 'Toggle Core Formats' })
    await user.click(toggle)

    expect(deactivate).toHaveBeenCalledWith('core-formats')
  })

  it('editing an own-setting control persists via plugins:set-setting with the plugin name and key', async () => {
    const setSetting = vi.fn()
    setupIpc({ 'plugins:set-setting': setSetting })
    const user = userEvent.setup()
    render(<PluginSettings />)
    const row = (await screen.findByText('Delimiter')).closest('div')!.parentElement as HTMLElement
    const input = within(row).getByRole('textbox')
    await user.clear(input)
    await user.type(input, ';')

    await waitFor(() => expect(setSetting).toHaveBeenCalledWith('core-formats', 'delimiter', ';'))
  })

  it('refetches the plugin list when a PLUGINS_LIFECYCLE event fires', async () => {
    let lifecycleHandler: (() => void) | undefined
    mockOn.mockImplementation((_event: string, handler: () => void) => {
      lifecycleHandler = handler
      return vi.fn()
    })
    const list = vi.fn(() => PLUGINS)
    setupIpc({ 'plugins:list': list })
    render(<PluginSettings />)
    await screen.findByText('Core Formats')
    const callsBefore = list.mock.calls.length

    lifecycleHandler?.()
    await waitFor(() => expect(list.mock.calls.length).toBeGreaterThan(callsBefore))
  })
})
