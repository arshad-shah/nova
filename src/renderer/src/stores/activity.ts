import { create } from 'zustand'
import type { ActivityEntry } from '@shared/activity'
import { IPC_CHANNELS, IPC_EVENTS } from '@shared/ipc'
import { ipc } from '@/platform/client'

const CAP = 1000

interface ActivityState {
  entries: ActivityEntry[]
  loaded: boolean
  /** Guards against double-subscribing when the panel mounts more than once. */
  started: boolean
  init: () => Promise<void>
  clear: () => Promise<void>
}

export const useActivityStore = create<ActivityState>((set, get) => ({
  entries: [],
  loaded: false,
  started: false,
  init: async () => {
    if (get().started) return
    set({ started: true })
    try {
      const list = await ipc.invoke(IPC_CHANNELS.ACTIVITY_LIST, { limit: CAP })
      set({ entries: list, loaded: true })
    } catch {
      set({ loaded: true })
    }
    // Live stream: the main process coalesces entries into batches (oldest-first
    // within a batch). Prepend the reversed batch so the store stays newest-first,
    // and apply each batch in a single update to avoid per-entry re-renders.
    ipc.on(IPC_EVENTS.ACTIVITY_BATCH, (batch: unknown) => {
      const entries = batch as ActivityEntry[]
      if (entries.length === 0) return
      set((s) => ({ entries: [...entries.slice().reverse(), ...s.entries].slice(0, CAP) }))
    })
  },
  clear: async () => {
    await ipc.invoke(IPC_CHANNELS.ACTIVITY_CLEAR)
    set({ entries: [] })
  },
}))
