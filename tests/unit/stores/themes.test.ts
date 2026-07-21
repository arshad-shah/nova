import { describe, it, expect, beforeEach, vi } from 'vitest'
import { IPC_CHANNELS, IPC_EVENTS } from '@shared/ipc'

// The themes-changed listener is registered at module import time, so
// electronAPI must exist before the module is evaluated. Static imports run
// before the rest of this file's body, so a plain top-level assignment would
// be too late; vi.hoisted() hoists the factory above every import.
const { mockInvoke, mockOn } = vi.hoisted(() => {
  const mockInvoke = vi.fn()
  const mockOn = vi.fn()
  ;(window as unknown as { electronAPI: { invoke: typeof mockInvoke; on: typeof mockOn } }).electronAPI = {
    invoke: mockInvoke,
    on: mockOn
  }
  return { mockInvoke, mockOn }
})

import { useThemesStore } from '../../../src/renderer/src/stores/themes'

function styleContent(): string {
  return document.getElementById('plugin-themes-injected')?.textContent ?? ''
}

describe('useThemesStore', () => {
  beforeEach(() => {
    mockInvoke.mockReset()
    useThemesStore.setState({ themes: [], loaded: false })
    document.getElementById('plugin-themes-injected')?.remove()
  })

  it('always includes the baseline Ion theme even when the plugin list is empty', async () => {
    mockInvoke.mockResolvedValueOnce([])
    await useThemesStore.getState().fetch()
    const { themes, loaded } = useThemesStore.getState()
    expect(loaded).toBe(true)
    expect(themes).toHaveLength(1)
    expect(themes[0].id).toBe('ion')
  })

  it('falls back to just the baseline theme when the IPC call rejects', async () => {
    mockInvoke.mockRejectedValueOnce(new Error('main process unavailable'))
    await useThemesStore.getState().fetch()
    const { themes, loaded } = useThemesStore.getState()
    expect(loaded).toBe(true)
    expect(themes).toEqual([expect.objectContaining({ id: 'ion' })])
  })

  it('fetch without electronAPI resolves to just the baseline theme, without touching IPC', async () => {
    const original = (window as unknown as { electronAPI: unknown }).electronAPI
    ;(window as unknown as { electronAPI: unknown }).electronAPI = undefined
    await useThemesStore.getState().fetch()
    expect(useThemesStore.getState().themes.map((t) => t.id)).toEqual(['ion'])
    expect(mockInvoke).not.toHaveBeenCalled()
    ;(window as unknown as { electronAPI: unknown }).electronAPI = original
  })

  it('prepends the baseline theme ahead of plugin-contributed themes', async () => {
    mockInvoke.mockResolvedValueOnce([{ id: 'midnight', name: 'Midnight', type: 'dark' }])
    await useThemesStore.getState().fetch()
    expect(useThemesStore.getState().themes.map((t) => t.id)).toEqual(['ion', 'midnight'])
  })

  it('ignores a plugin theme that tries to claim the reserved "ion" id, keeping the brand baseline authoritative', async () => {
    mockInvoke.mockResolvedValueOnce([
      { id: 'ion', name: 'Fake Ion', type: 'light' }
    ])
    await useThemesStore.getState().fetch()
    const { themes } = useThemesStore.getState()
    expect(themes.filter((t) => t.id === 'ion')).toHaveLength(1)
    expect(themes[0].name).toBe('Ion') // the baseline's name, not the impostor's
  })

  // BUG (documented, not fixed): fetch() calls injectThemes(list) with the RAW
  // (unfiltered) list before filtering out an impostor "ion" entry. So even
  // though the impostor is correctly excluded from the `themes` array the UI
  // reads, its CSS for `[data-theme="ion"]` still lands in the injected
  // stylesheet and can repaint the real brand theme's variables.
  it('BUG: an impostor "ion" theme is excluded from the themes list but its CSS is still injected', async () => {
    mockInvoke.mockResolvedValueOnce([
      { id: 'ion', name: 'Fake Ion', type: 'light', tokens: { 'color-accent': '#ff0000' } }
    ])
    await useThemesStore.getState().fetch()
    expect(useThemesStore.getState().themes.filter((t) => t.id === 'ion')).toHaveLength(1)
    expect(styleContent()).toContain('--color-accent: #ff0000;')
  })

  it('injects CSS variables for theme tokens, auto-prefixing keys without a leading --', async () => {
    mockInvoke.mockResolvedValueOnce([
      { id: 'custom', name: 'Custom', type: 'dark', tokens: { 'color-bg': '#111', '--color-fg': '#eee' } }
    ])
    await useThemesStore.getState().fetch()
    const css = styleContent()
    expect(css).toContain('[data-theme="custom"]')
    expect(css).toContain('--color-bg: #111;')
    expect(css).toContain('--color-fg: #eee;') // already prefixed, must not double up
    expect(css).not.toContain('----color-fg')
  })

  it('appends a raw css block from a theme verbatim', async () => {
    mockInvoke.mockResolvedValueOnce([
      { id: 'custom', name: 'Custom', type: 'dark', css: '.custom-marker { color: red; }' }
    ])
    await useThemesStore.getState().fetch()
    expect(styleContent()).toContain('.custom-marker { color: red; }')
  })

  it('reuses a single injected <style> element across repeated fetches instead of duplicating it', async () => {
    mockInvoke.mockResolvedValueOnce([{ id: 'a', name: 'A', type: 'dark', css: '.a {}' }])
    await useThemesStore.getState().fetch()
    mockInvoke.mockResolvedValueOnce([{ id: 'b', name: 'B', type: 'dark', css: '.b {}' }])
    await useThemesStore.getState().fetch()

    expect(document.querySelectorAll('#plugin-themes-injected')).toHaveLength(1)
    // Second fetch's content replaces (not appends to) the first's.
    expect(styleContent()).not.toContain('.a {}')
    expect(styleContent()).toContain('.b {}')
  })

  it('a themes-changed IPC broadcast triggers a refetch', async () => {
    const call = mockOn.mock.calls.find(([c]) => c === IPC_EVENTS.THEMES_CHANGED)
    expect(call).toBeTruthy()
    const handler = call![1] as () => void

    mockInvoke.mockResolvedValueOnce([{ id: 'from-event', name: 'From Event', type: 'dark' }])
    handler()
    await Promise.resolve()
    await Promise.resolve()

    expect(mockInvoke).toHaveBeenCalledWith(IPC_CHANNELS.THEMES_LIST)
    expect(useThemesStore.getState().themes.map((t) => t.id)).toContain('from-event')
  })
})
