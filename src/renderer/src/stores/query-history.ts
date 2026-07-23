import { create } from 'zustand'
import type { QueryHistoryEntry } from '@shared/appdata'
import { IPC_CHANNELS } from '@shared/ipc'
import { useSettingsStore } from './settings'
import { ipc } from '@/platform/client'

// Query history is persisted in the SQLite app-data store (main process), which
// owns the cap/pruning. This store keeps an in-memory mirror for the History
// panel and write-throughs via IPC. Hydrated once at boot.
interface QueryHistoryState {
  entries: QueryHistoryEntry[]
  hydrated: boolean
  hydrate: () => Promise<void>
  /** Record one executed run. id + executedAt are filled in here. */
  record: (run: Omit<QueryHistoryEntry, 'id' | 'executedAt'>) => void
  remove: (id: string) => void
  clear: () => void
}

const hasIpc = (): boolean => ipc.available()
const maxItems = (): number =>
  Math.max(1, useSettingsStore.getState().settings.general.maxHistoryItems)

export const useQueryHistoryStore = create<QueryHistoryState>((set, get) => ({
  entries: [],
  hydrated: false,

  hydrate: async () => {
    if (get().hydrated || !hasIpc()) return
    const entries = await ipc.invoke(
      IPC_CHANNELS.APPDATA_QUERY_HISTORY_LIST,
      maxItems(),
    )
    set({ entries, hydrated: true })
  },

  record: (run) => {
    const max = maxItems()
    const entry: QueryHistoryEntry = {
      ...run,
      id: `qh-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      executedAt: Date.now(),
    }
    // Optimistic prepend, trimmed to the same cap the store enforces.
    set((s) => ({ entries: [entry, ...s.entries].slice(0, max) }))
    if (hasIpc()) {
      void ipc.invoke(IPC_CHANNELS.APPDATA_QUERY_HISTORY_ADD, entry, max)
    }
  },

  remove: (id) => {
    set((s) => ({ entries: s.entries.filter((e) => e.id !== id) }))
    if (hasIpc()) void ipc.invoke(IPC_CHANNELS.APPDATA_QUERY_HISTORY_DELETE, id)
  },

  clear: () => {
    set({ entries: [] })
    if (hasIpc()) void ipc.invoke(IPC_CHANNELS.APPDATA_QUERY_HISTORY_CLEAR)
  },
}))
