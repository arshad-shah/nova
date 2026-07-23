import { create } from 'zustand'
import { IPC_CHANNELS, IPC_EVENTS } from '@shared/ipc'
import { ipc } from '@/platform/client'

export type PluginLifecycleEvent = 'activated' | 'deactivated' | 'installed' | 'uninstalled'

interface PendingChange {
  name: string
  event: PluginLifecycleEvent
}

interface PluginLifecycleState {
  /** Most recent plugin change since last restart. Null until something changes. */
  pending: PendingChange | null
  setPending: (change: PendingChange | null) => void
  restart: () => Promise<void>
  dismiss: () => void
}

export const usePluginLifecycleStore = create<PluginLifecycleState>((set) => ({
  pending: null,
  setPending: (change) => set({ pending: change }),
  restart: async () => {
    await ipc.invoke(IPC_CHANNELS.APP_RESTART)
  },
  dismiss: () => set({ pending: null })
}))

// Subscribe to main-process lifecycle broadcasts. The flag guards against
// HMR / test imports double-registering the listener.
declare global {
  // eslint-disable-next-line no-var
  var __pluginLifecycleListenerInstalled: boolean | undefined
}
if (ipc.available() && !globalThis.__pluginLifecycleListenerInstalled) {
  globalThis.__pluginLifecycleListenerInstalled = true
  ipc.on(IPC_EVENTS.PLUGINS_LIFECYCLE, (payload: unknown) => {
    const p = payload as PendingChange | undefined
    if (!p?.name || !p.event) return
    const current = usePluginLifecycleStore.getState().pending
    if (current && current.name === p.name && current.event === p.event) return
    usePluginLifecycleStore.setState({ pending: p })
  })
}
