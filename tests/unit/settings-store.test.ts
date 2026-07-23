import { describe, it, expect, beforeEach, vi } from 'vitest'
import { IPC_CHANNELS, IPC_EVENTS } from '../../shared/ipc'
import { defaultSettings } from '../../shared/settings'
import type { AppSettings } from '../../shared/settings'

const mockInvoke = vi.fn()
const mockOn = vi.fn(() => vi.fn())
vi.stubGlobal('window', {
  electronAPI: {
    invoke: mockInvoke,
    on: mockOn
  }
})

import { useSettingsStore, initSettingsListener } from '../../src/renderer/src/stores/settings'

function resetStore(): void {
  useSettingsStore.setState({ settings: defaultSettings, loaded: false })
}

describe('useSettingsStore', () => {
  beforeEach(() => {
    mockInvoke.mockReset()
    mockOn.mockClear()
    resetStore()
  })

  it('starts with the default settings and loaded=false', () => {
    const s = useSettingsStore.getState()
    expect(s.settings).toEqual(defaultSettings)
    expect(s.loaded).toBe(false)
  })

  it('hydrate fetches settings over IPC, merges with defaults, and marks loaded', async () => {
    const persisted = { general: { ...defaultSettings.general, queryTimeout: 5000 } } as Partial<AppSettings>
    mockInvoke.mockResolvedValueOnce(persisted)
    await useSettingsStore.getState().hydrate()
    expect(mockInvoke).toHaveBeenCalledWith(IPC_CHANNELS.SETTINGS_GET_ALL)
    const s = useSettingsStore.getState()
    expect(s.loaded).toBe(true)
    expect(s.settings.general.queryTimeout).toBe(5000)
    // Fields not present in the persisted partial fall back to defaults.
    expect(s.settings.appearance).toEqual(defaultSettings.appearance)
  })

  it('set() optimistically updates a nested key path before persisting', async () => {
    mockInvoke.mockResolvedValueOnce(undefined)
    await useSettingsStore.getState().set('general.queryTimeout', 9999)
    expect(useSettingsStore.getState().settings.general.queryTimeout).toBe(9999)
    expect(mockInvoke).toHaveBeenCalledWith(IPC_CHANNELS.SETTINGS_SET, 'general.queryTimeout', 9999)
  })

  it('set() does not mutate the previous settings object (immutable update)', async () => {
    mockInvoke.mockResolvedValueOnce(undefined)
    const before = useSettingsStore.getState().settings
    await useSettingsStore.getState().set('general.maxHistoryItems', 42)
    const after = useSettingsStore.getState().settings
    expect(after).not.toBe(before)
    expect(before.general.maxHistoryItems).toBe(defaultSettings.general.maxHistoryItems)
    expect(after.general.maxHistoryItems).toBe(42)
  })

  it('set() only touches the target leaf, leaving sibling keys in the category intact', async () => {
    mockInvoke.mockResolvedValueOnce(undefined)
    const originalConfirm = defaultSettings.general.confirmOnUnsavedClose
    await useSettingsStore.getState().set('general.queryTimeout', 111)
    expect(useSettingsStore.getState().settings.general.confirmOnUnsavedClose).toBe(originalConfirm)
  })

  it('resetCategory replaces the category with the IPC-returned value', async () => {
    const resetGeneral = { ...defaultSettings.general, queryTimeout: 30000 }
    mockInvoke.mockResolvedValueOnce(resetGeneral)
    await useSettingsStore.getState().resetCategory('general')
    expect(mockInvoke).toHaveBeenCalledWith(IPC_CHANNELS.SETTINGS_RESET, 'general')
    expect(useSettingsStore.getState().settings.general).toEqual(resetGeneral)
  })

  it('resetCategory leaves other categories untouched', async () => {
    mockInvoke.mockResolvedValueOnce(defaultSettings.general)
    await useSettingsStore.getState().resetCategory('general')
    expect(useSettingsStore.getState().settings.appearance).toEqual(defaultSettings.appearance)
  })

  it('initSettingsListener registers a SETTINGS_CHANGED handler and applies broadcast updates', () => {
    const unsubscribe = initSettingsListener()
    expect(mockOn).toHaveBeenCalledWith(IPC_EVENTS.SETTINGS_CHANGED, expect.any(Function))
    const handler = mockOn.mock.calls[mockOn.mock.calls.length - 1][1] as (
      keyPath: unknown,
      value: unknown
    ) => void
    handler('general.queryTimeout', 7777)
    expect(useSettingsStore.getState().settings.general.queryTimeout).toBe(7777)
    unsubscribe()
  })

  it('initSettingsListener returns the unsubscribe function supplied by electronAPI.on', () => {
    const unsub = vi.fn()
    mockOn.mockReturnValueOnce(unsub)
    const result = initSettingsListener()
    expect(result).toBe(unsub)
  })
})
