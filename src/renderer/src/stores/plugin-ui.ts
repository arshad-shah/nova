import { create } from 'zustand'
import type { UIContribution, ContributionSurface } from '@shared/plugin-ui-types'
import { IPC_CHANNELS, IPC_EVENTS } from '@shared/ipc'
import { ipc } from '@/platform/client'

interface ResolverCache {
  [key: string]: { value: string; label: string }[] | undefined
}

interface PluginUIState {
  contributions: Record<string, UIContribution[]>
  resolverCache: ResolverCache
  fetchContributions: (surface: ContributionSurface) => Promise<void>
  resolveOptions: (pluginId: string, resolverId: string, connectionId: string) => Promise<{ value: string; label: string }[]>
  executeAction: (pluginId: string, commandId: string, payload: Record<string, unknown>) => Promise<void>
  invalidateResolver: (resolverId: string, connectionId: string) => void
  invalidateAll: () => void
}

// Stable empty array — avoids creating new references in selectors
const EMPTY: UIContribution[] = []

export const usePluginUIStore = create<PluginUIState>((set, get) => ({
  contributions: {},
  resolverCache: {},

  fetchContributions: async (surface) => {
    const result = await ipc.invoke(IPC_CHANNELS.PLUGINS_UI_GET_CONTRIBUTIONS, surface)
    set((state) => ({
      contributions: { ...state.contributions, [surface]: result }
    }))
  },

  resolveOptions: async (pluginId, resolverId, connectionId) => {
    const cacheKey = `${resolverId}:${connectionId}`
    const cached = get().resolverCache[cacheKey]
    if (cached) return cached

    const result = await ipc.invoke(IPC_CHANNELS.PLUGINS_UI_RESOLVE, pluginId, resolverId, { connectionId })
    set((state) => ({
      resolverCache: { ...state.resolverCache, [cacheKey]: result }
    }))
    return result
  },

  executeAction: async (pluginId, commandId, payload) => {
    await ipc.invoke(IPC_CHANNELS.PLUGINS_UI_ACTION, pluginId, commandId, payload)
  },

  invalidateResolver: (resolverId, connectionId) => {
    const cacheKey = `${resolverId}:${connectionId}`
    set((state) => {
      const next = { ...state.resolverCache }
      delete next[cacheKey]
      return { resolverCache: next }
    })
  },

  invalidateAll: () => {
    set({ resolverCache: {}, contributions: {} })
  },
}))

/** Stable selector — returns EMPTY instead of creating a new [] each render */
export function selectContributions(surface: string) {
  return (state: PluginUIState) => state.contributions[surface] ?? EMPTY
}

// Listen for contribution changes from main process.
// Debounce to avoid re-render storms during plugin boot.
if (ipc.available()) {
  let debounceTimer: ReturnType<typeof setTimeout> | null = null
  ipc.on(IPC_EVENTS.PLUGINS_UI_CONTRIBUTIONS_CHANGED, () => {
    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(async () => {
      const store = usePluginUIStore.getState()
      store.invalidateAll()
      // Re-fetch all surfaces so components get fresh data
      await Promise.all([
        store.fetchContributions('statusBar'),
        store.fetchContributions('activityBar'),
        store.fetchContributions('panels'),
        store.fetchContributions('contextMenu'),
        store.fetchContributions('slot'),
      ])
    }, 300)
  })
}
