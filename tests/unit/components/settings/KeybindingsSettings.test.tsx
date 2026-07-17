import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { KeybindingsSettings } from '../../../../src/renderer/src/components/settings/categories/KeybindingsSettings'
import { defaultSettings, KEYBINDING_ACTION } from '../../../../shared/settings'

let keybindings = defaultSettings.keybindings.map((k) => ({ ...k }))
const mockSet = vi.fn(async (keyPath: string, value: unknown) => {
  if (keyPath === 'keybindings') keybindings = value as typeof keybindings
})
let pluginCommands: { pluginId: string; pluginDisplayName: string; commandId: string; title: string; keybinding?: string }[] = []
const mockFetch = vi.fn()

vi.mock('../../../../src/renderer/src/stores/settings', () => ({
  useSettingsStore: (selector: any) => selector({ settings: { keybindings }, set: mockSet }),
}))

vi.mock('../../../../src/renderer/src/stores/plugin-commands', () => ({
  usePluginCommands: (selector: any) => selector({ commands: pluginCommands, fetch: mockFetch }),
}))

function isMac(value: boolean) {
  Object.defineProperty(navigator, 'platform', { value: value ? 'MacIntel' : 'Win32', configurable: true })
}

describe('KeybindingsSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    keybindings = defaultSettings.keybindings.map((k) => ({ ...k }))
    pluginCommands = []
    isMac(false)
  })

  it('fetches plugin commands on mount so plugin-owned shortcuts are current', () => {
    render(<KeybindingsSettings />)
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  it('groups built-in bindings by category into separate tables', () => {
    render(<KeybindingsSettings />)
    expect(screen.getByText('Query Execution')).toBeInTheDocument()
    expect(screen.getByText('Navigation')).toBeInTheDocument()
    expect(screen.getByText('Panels')).toBeInTheDocument()
  })

  it('on a non-Mac platform, only Ctrl-prefixed variants render (not the Cmd twin)', () => {
    isMac(false)
    render(<KeybindingsSettings />)
    expect(screen.getByLabelText('Ctrl+Enter')).toBeInTheDocument()
    expect(screen.queryByLabelText('Cmd+Enter')).toBeNull()
  })

  it('on macOS, only Cmd-prefixed variants render', () => {
    isMac(true)
    render(<KeybindingsSettings />)
    expect(screen.getByLabelText('Cmd+Enter')).toBeInTheDocument()
    expect(screen.queryByLabelText('Ctrl+Enter')).toBeNull()
  })

  it('search filters bindings by label or category (case-insensitive), hiding non-matches', () => {
    render(<KeybindingsSettings />)
    fireEvent.change(screen.getByPlaceholderText('Search keybindings...'), { target: { value: 'sidebar' } })
    expect(screen.getByText('Toggle Sidebar')).toBeInTheDocument()
    expect(screen.queryByText('Execute Query')).toBeNull()
    // The category the surviving row belongs to is still shown as a heading.
    expect(screen.getByText('Panels')).toBeInTheDocument()
  })

  it('an unmodified binding has no reset button (nothing to reset to)', () => {
    render(<KeybindingsSettings />)
    expect(screen.queryByRole('button', { name: /Reset.*Execute Query/i })).toBeNull()
  })

  it('pressing a valid chord while recording persists it under the recorded binding\'s id, leaving others untouched', async () => {
    const user = userEvent.setup()
    render(<KeybindingsSettings />)
    await user.click(screen.getByRole('button', { name: /Rebind.*Execute Query/i }))
    expect(screen.getByText('Press shortcut… (Esc to cancel)')).toBeInTheDocument()

    fireEvent.keyDown(window, { key: 'k', ctrlKey: true })

    expect(mockSet).toHaveBeenCalledWith('keybindings', expect.any(Array))
    const saved = mockSet.mock.calls.find(([k]) => k === 'keybindings')![1] as typeof keybindings
    const execute = saved.find((k) => k.id === KEYBINDING_ACTION.EXECUTE_QUERY)!
    const newTab = saved.find((k) => k.id === KEYBINDING_ACTION.NEW_TAB)!
    expect(execute.keys).toEqual(['Ctrl+K', 'Cmd+K'])
    expect(newTab.keys).toEqual(['Ctrl+T', 'Cmd+T']) // untouched
  })

  it('Escape cancels recording without persisting anything', async () => {
    const user = userEvent.setup()
    render(<KeybindingsSettings />)
    await user.click(screen.getByRole('button', { name: /Rebind.*Execute Query/i }))
    fireEvent.keyDown(window, { key: 'Escape' })

    expect(screen.queryByText('Press shortcut… (Esc to cancel)')).toBeNull()
    expect(mockSet).not.toHaveBeenCalled()
  })

  it('an invalid chord (bare letter, no modifier) is ignored and recording stays open', () => {
    render(<KeybindingsSettings />)
    fireEvent.click(screen.getAllByRole('button', { name: /Rebind/i })[0])
    fireEvent.keyDown(window, { key: 'k' }) // no ctrl/meta ⇒ rejected by chordFromEvent

    expect(screen.getByText('Press shortcut… (Esc to cancel)')).toBeInTheDocument()
    expect(mockSet).not.toHaveBeenCalled()
  })

  it('after a rebind persists, a Reset button appears for that row and restores the default on click', async () => {
    const user = userEvent.setup()
    const { rerender } = render(<KeybindingsSettings />)
    await user.click(screen.getByRole('button', { name: /Rebind.*Execute Query/i }))
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true })
    // Simulate the store round-trip: apply what `set` was called with, then
    // re-render so the component reads the "persisted" (now custom) binding.
    keybindings = mockSet.mock.calls.at(-1)![1] as typeof keybindings
    rerender(<KeybindingsSettings />)

    const resetBtn = screen.getByRole('button', { name: /Reset.*Execute Query/i })
    await user.click(resetBtn)

    const finalCall = mockSet.mock.calls.at(-1)!
    const restored = (finalCall[1] as typeof keybindings).find((k) => k.id === KEYBINDING_ACTION.EXECUTE_QUERY)!
    expect(restored.keys).toEqual(['Ctrl+Enter', 'Cmd+Enter'])
  })

  it('"Reset all" writes back the full default keybindings array verbatim', async () => {
    const user = userEvent.setup()
    render(<KeybindingsSettings />)
    await user.click(screen.getByRole('button', { name: 'Reset all to defaults' }))
    expect(mockSet).toHaveBeenCalledWith('keybindings', defaultSettings.keybindings)
  })

  it('plugin commands render read-only (no rebind control) grouped by their plugin\'s display name', () => {
    pluginCommands = [
      { pluginId: 'ai', pluginDisplayName: 'AI Assistant', commandId: 'ask', title: 'Ask AI', keybinding: 'Ctrl+Shift+A' },
    ]
    render(<KeybindingsSettings />)
    expect(screen.getByText('AI Assistant')).toBeInTheDocument()
    expect(screen.getByText('Ask AI')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Rebind.*Ask AI/i })).toBeNull()
  })

  it('plugin commands without a keybinding are omitted entirely', () => {
    pluginCommands = [
      { pluginId: 'ai', pluginDisplayName: 'AI Assistant', commandId: 'noop', title: 'No Shortcut' },
    ]
    render(<KeybindingsSettings />)
    expect(screen.queryByText('No Shortcut')).toBeNull()
  })
})
