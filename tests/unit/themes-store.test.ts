import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useThemesStore } from '@/stores/themes'
import { IPC_CHANNELS } from '@shared/ipc'

function stubInvoke(resolve: unknown) {
  ;(window as unknown as { electronAPI: unknown }).electronAPI = {
    invoke: vi.fn(async (ch: string) => (ch === IPC_CHANNELS.THEMES_LIST ? resolve : [])),
    on: () => () => {},
  }
}

describe('useThemesStore.fetch', () => {
  beforeEach(() => useThemesStore.setState({ themes: [], loaded: false }))

  it('treats an undefined IPC resolve as no plugin themes (does not throw)', async () => {
    stubInvoke(undefined)
    await expect(useThemesStore.getState().fetch()).resolves.toBeUndefined()
    // Baseline Ion is always present even when plugins contribute nothing.
    const { themes, loaded } = useThemesStore.getState()
    expect(loaded).toBe(true)
    expect(themes.length).toBeGreaterThanOrEqual(1)
  })

  it('keeps plugin themes when the IPC resolve is a valid array', async () => {
    stubInvoke([{ id: 'x', name: 'X', type: 'dark' }])
    await useThemesStore.getState().fetch()
    expect(useThemesStore.getState().themes.some((t) => t.id === 'x')).toBe(true)
  })
})
