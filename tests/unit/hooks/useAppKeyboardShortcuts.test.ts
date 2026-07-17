import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAppKeyboardShortcuts } from '@/hooks/useAppKeyboardShortcuts'
import { useConnectionsStore } from '@/stores/connections'
import { useSettingsStore } from '@/stores/settings'
import { useUiStore } from '@/stores/ui'
import { usePluginCommands } from '@/stores/plugin-commands'
import { tabActions } from '@/stores/tab-actions'
import { defaultSettings } from '@shared/settings'
import { IPC_CHANNELS } from '@shared/ipc'

function key(k: string, mods: Partial<KeyboardEventInit> = {}) {
  return new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...mods })
}

function mockElectronAPI(commands: unknown[] = []) {
  const invoke = vi.fn(async (channel: string) => {
    if (channel === IPC_CHANNELS.PLUGINS_GET_COMMANDS) return commands
    return undefined
  })
  // @ts-expect-error mocked global for the test
  globalThis.window.electronAPI = { invoke, on: vi.fn(() => () => {}) }
  return invoke
}

function baseOptions(overrides: Partial<Parameters<typeof useAppKeyboardShortcuts>[0]> = {}) {
  return {
    activeConnectionId: null,
    activeTabId: null,
    addQueryTab: vi.fn(),
    closeTab: vi.fn(),
    reopenTab: vi.fn(),
    ...overrides,
  }
}

beforeEach(() => {
  useConnectionsStore.setState({ connections: [], activeConnectionId: null, connectedIds: new Set(), loading: false })
  useSettingsStore.setState({ settings: defaultSettings })
  useUiStore.setState((s) => ({ ...s, sidebarVisible: true, commandPaletteOpen: false }))
  usePluginCommands.setState({ commands: [], loaded: false })
})
afterEach(() => vi.restoreAllMocks())

describe('useAppKeyboardShortcuts', () => {
  it('dispatches NEW_TAB (Ctrl+T) to addQueryTab with the active connection', () => {
    mockElectronAPI()
    const opts = baseOptions({ activeConnectionId: 'conn-1' })
    renderHook(() => useAppKeyboardShortcuts(opts))
    window.dispatchEvent(key('t', { ctrlKey: true }))
    expect(opts.addQueryTab).toHaveBeenCalledExactlyOnceWith('conn-1', null, { autoCommit: true })
  })

  it('prevents the default browser action when a built-in keybinding matches', () => {
    mockElectronAPI()
    const opts = baseOptions()
    renderHook(() => useAppKeyboardShortcuts(opts))
    const e = key('t', { ctrlKey: true })
    const spy = vi.spyOn(e, 'preventDefault')
    window.dispatchEvent(e)
    expect(spy).toHaveBeenCalled()
  })

  it('CLOSE_TAB (Ctrl+W) is a no-op when there is no active tab', () => {
    mockElectronAPI()
    const opts = baseOptions({ activeTabId: null })
    renderHook(() => useAppKeyboardShortcuts(opts))
    window.dispatchEvent(key('w', { ctrlKey: true }))
    expect(opts.closeTab).not.toHaveBeenCalled()
  })

  it('CLOSE_TAB (Ctrl+W) closes a clean active tab immediately (no confirm needed)', () => {
    mockElectronAPI()
    const opts = baseOptions({ activeTabId: 'tab-1' })
    renderHook(() => useAppKeyboardShortcuts(opts))
    window.dispatchEvent(key('w', { ctrlKey: true }))
    expect(opts.closeTab).toHaveBeenCalledExactlyOnceWith('tab-1')
  })

  it('CLOSE_TAB defers to the confirm flow (does not call closeTab directly) for a dirty tab', () => {
    mockElectronAPI()
    tabActions.register('tab-dirty', { isDirty: () => true })
    const opts = baseOptions({ activeTabId: 'tab-dirty' })
    renderHook(() => useAppKeyboardShortcuts(opts))
    window.dispatchEvent(key('w', { ctrlKey: true }))
    expect(opts.closeTab).not.toHaveBeenCalled()
    tabActions.unregister('tab-dirty')
  })

  it('COMMAND_PALETTE (Ctrl+Shift+P) toggles the palette open', () => {
    mockElectronAPI()
    renderHook(() => useAppKeyboardShortcuts(baseOptions()))
    expect(useUiStore.getState().commandPaletteOpen).toBe(false)
    window.dispatchEvent(key('p', { ctrlKey: true, shiftKey: true }))
    expect(useUiStore.getState().commandPaletteOpen).toBe(true)
  })

  it('TOGGLE_SIDEBAR (Ctrl+B) toggles sidebar visibility', () => {
    mockElectronAPI()
    renderHook(() => useAppKeyboardShortcuts(baseOptions()))
    expect(useUiStore.getState().sidebarVisible).toBe(true)
    window.dispatchEvent(key('b', { ctrlKey: true }))
    expect(useUiStore.getState().sidebarVisible).toBe(false)
  })

  it('SAVE_QUERY (Ctrl+S) routes through tabActions to the registered handler', async () => {
    mockElectronAPI()
    const onSave = vi.fn()
    tabActions.register('tab-1', { onSave })
    renderHook(() => useAppKeyboardShortcuts(baseOptions({ activeTabId: 'tab-1' })))
    window.dispatchEvent(key('s', { ctrlKey: true }))
    await Promise.resolve()
    expect(onSave).toHaveBeenCalledTimes(1)
    tabActions.unregister('tab-1')
  })

  it('a plain, unmodified key that matches no keybinding does nothing and does not throw', () => {
    mockElectronAPI()
    const opts = baseOptions()
    expect(() => {
      renderHook(() => useAppKeyboardShortcuts(opts))
      window.dispatchEvent(key('t')) // no modifier: not "Ctrl+T"/"Cmd+T"
    }).not.toThrow()
    expect(opts.addQueryTab).not.toHaveBeenCalled()
  })

  it('falls through to the fixed reopen-closed-tab chord (Ctrl+Shift+T) since it is not a rebindable keybinding', () => {
    mockElectronAPI()
    const opts = baseOptions()
    renderHook(() => useAppKeyboardShortcuts(opts))
    window.dispatchEvent(key('t', { ctrlKey: true, shiftKey: true }))
    expect(opts.reopenTab).toHaveBeenCalledTimes(1)
    expect(opts.addQueryTab).not.toHaveBeenCalled()
  })

  it('fetches plugin commands on mount and dispatches a matching plugin keybinding', async () => {
    const invoke = mockElectronAPI([
      { pluginId: 'demo', pluginDisplayName: 'Demo', commandId: 'do-thing', title: 'Do Thing', keybinding: 'Ctrl+Alt+K' },
    ])
    renderHook(() => useAppKeyboardShortcuts(baseOptions()))
    await vi.waitFor(() => expect(usePluginCommands.getState().loaded).toBe(true))
    window.dispatchEvent(key('k', { ctrlKey: true, altKey: true }))
    expect(invoke).toHaveBeenCalledWith(IPC_CHANNELS.PLUGINS_UI_ACTION, 'demo', 'do-thing', {})
  })

  // BUG: the built-in handler and the plugin-keybinding handler are two
  // independent `keydown` listeners on `window`. The built-in one calls
  // `e.preventDefault()` and `return`s out of *its own* callback when it
  // matches, but that has no effect on the second listener — DOM
  // `preventDefault()` suppresses the browser's default action, it does not
  // stop other listeners on the same event from running. So a plugin that
  // declares the same accelerator as a built-in (e.g. `Ctrl+T`) does not get
  // silently shadowed as one might expect; it fires *in addition to* the
  // built-in action on every keypress. This test documents that actual,
  // surprising behavior rather than the priority a reader would assume from
  // "built-ins are checked in the first listener".
  it('BUG: a plugin keybinding that collides with a built-in fires in addition to it, not instead of it', async () => {
    const invoke = mockElectronAPI([
      { pluginId: 'demo', pluginDisplayName: 'Demo', commandId: 'steal-new-tab', title: 'Steal', keybinding: 'Ctrl+T' },
    ])
    const opts = baseOptions()
    renderHook(() => useAppKeyboardShortcuts(opts))
    await vi.waitFor(() => expect(usePluginCommands.getState().loaded).toBe(true))
    window.dispatchEvent(key('t', { ctrlKey: true }))
    expect(opts.addQueryTab).toHaveBeenCalledTimes(1)
    expect(invoke).toHaveBeenCalledWith(IPC_CHANNELS.PLUGINS_UI_ACTION, 'demo', 'steal-new-tab', {})
  })

  it('removes both keydown listeners on unmount', () => {
    mockElectronAPI()
    const opts = baseOptions()
    const removeSpy = vi.spyOn(window, 'removeEventListener')
    const { unmount } = renderHook(() => useAppKeyboardShortcuts(opts))
    unmount()
    const removedKeydownCount = removeSpy.mock.calls.filter((c) => c[0] === 'keydown').length
    expect(removedKeydownCount).toBe(2)
    window.dispatchEvent(key('t', { ctrlKey: true }))
    expect(opts.addQueryTab).not.toHaveBeenCalled()
  })
})
