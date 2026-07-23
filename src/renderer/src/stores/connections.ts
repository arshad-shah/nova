import { create } from 'zustand'
import type { ConnectionProfile } from '@shared/types'
import { useNotificationsStore } from './notifications'
import { useToastStore } from './toast'
import { useSchemaStore } from './schema'
import { useTabsStore } from './tabs'
import { IPC_CHANNELS } from '@shared/ipc'
import { t } from '@shared/i18n'
import { useDriverCapabilitiesStore } from './driver-capabilities'
import { ipc } from '@/platform/client'

interface ConnectionsState {
  connections: ConnectionProfile[]
  activeConnectionId: string | null
  connectedIds: Set<string>
  loading: boolean
  setConnections: (connections: ConnectionProfile[]) => void
  setActiveConnection: (id: string | null) => void
  addConnected: (id: string) => void
  removeConnected: (id: string) => void
  setLoading: (loading: boolean) => void
  loadConnections: () => Promise<void>
  saveConnection: (profile: ConnectionProfile) => Promise<void>
  deleteConnection: (id: string) => Promise<void>
  connect: (id: string) => Promise<{ success: boolean; error?: string }>
  disconnect: (id: string) => Promise<void>
}

export const useConnectionsStore = create<ConnectionsState>((set, get) => ({
  connections: [],
  activeConnectionId: null,
  connectedIds: new Set(),
  loading: false,
  setConnections: (connections) => set({ connections }),
  setActiveConnection: (id) => {
    set({ activeConnectionId: id })
    // Mirror the active connection into the main process so AI tools and the
    // MCP server target the connection the user is actually looking at — even
    // when switching between two already-connected connections (no db:connect).
    void ipc.optional(IPC_CHANNELS.DB_SET_ACTIVE_CONNECTION, id)
  },
  addConnected: (id) => set((s) => ({ connectedIds: new Set([...s.connectedIds, id]) })),
  removeConnected: (id) => set((s) => {
    const next = new Set(s.connectedIds)
    next.delete(id)
    return { connectedIds: next }
  }),
  setLoading: (loading) => set({ loading }),
  loadConnections: async () => {
    set({ loading: true })
    const connections = await ipc.invoke(IPC_CHANNELS.CONNECTIONS_LIST)
    set({ connections, loading: false })
  },
  saveConnection: async (profile) => {
    await ipc.invoke(IPC_CHANNELS.CONNECTIONS_SAVE, profile)
    await get().loadConnections()
  },
  deleteConnection: async (id) => {
    await ipc.invoke(IPC_CHANNELS.CONNECTIONS_DELETE, id)
    const state = get()
    if (state.activeConnectionId === id) set({ activeConnectionId: null })
    // The schema cache and any tabs anchored to this connection now point at
    // a profile that no longer exists. Drop the cache entries and detach the
    // tabs so the next query doesn't silently fail with a generic
    // "Not connected" — the user gets a clear "pick a connection" state.
    useSchemaStore.getState().clearCache(id)
    useTabsStore.getState().detachConnection(id)
    useDriverCapabilitiesStore.getState().clearConnection(id)
    await state.loadConnections()
  },
  connect: async (id) => {
    const conn = get().connections.find(c => c.id === id)
    const name = conn?.name ?? id
    const toast = useToastStore.getState()
    const toastId = toast.addToast({
      id: `connect-${id}`,
      type: 'info',
      title: t('connections.connecting', { name }),
      message: t('connections.establishing'),
      persistent: true,
    })

    const result = await ipc.invoke(IPC_CHANNELS.DB_CONNECT, id)
    if (result.success) {
      get().addConnected(id)
      set({ activeConnectionId: id })
      if (conn?.type) {
        useDriverCapabilitiesStore.getState().fetchConnection(id, conn.type).catch(() => {})
      }
      toast.updateToast(toastId, {
        type: 'success',
        title: t('connections.connected', { name }),
        message: undefined,
        persistent: false,
      })
      useNotificationsStore.getState().addNotification({
        type: 'success',
        title: t('connections.connectionEstablished'),
        message: t('connections.connected', { name }),
        source: { type: 'connection', id, label: name },
      })
    } else {
      toast.updateToast(toastId, {
        type: 'error',
        title: t('connections.connectionFailed'),
        message: result.error ?? t('connections.unknownError'),
        persistent: false,
      })
      useNotificationsStore.getState().addNotification({
        type: 'error',
        title: t('connections.connectionFailed'),
        message: result.error ?? t('connections.unknownError'),
        source: { type: 'connection', id, label: name },
      })
    }
    return result
  },
  disconnect: async (id) => {
    const conn = get().connections.find(c => c.id === id)
    const name = conn?.name ?? id
    const toast = useToastStore.getState()
    toast.addToast({
      id: `disconnect-${id}`,
      type: 'info',
      title: t('connections.disconnectedFrom', { name }),
    })
    await ipc.invoke(IPC_CHANNELS.DB_DISCONNECT, id)
    get().removeConnected(id)
    useDriverCapabilitiesStore.getState().clearConnection(id)
    // Drop the cached schema metadata so a re-connect re-fetches against the
    // live server instead of serving stale tables/columns from the prior
    // session — which becomes outright wrong if the user disconnected
    // *because* they pointed the profile at a different database.
    useSchemaStore.getState().clearCache(id)
    useNotificationsStore.getState().addNotification({
      type: 'info',
      title: t('connections.disconnected'),
      message: t('connections.disconnectedFrom', { name }),
      source: { type: 'connection', id, label: name },
    })
    if (get().activeConnectionId === id) set({ activeConnectionId: null })
  }
}))

// ─── Profile selectors ────────────────────────────────────────────────────
// Centralize the `connections.find(c => c.id === …)` lookup that was repeated
// across ~25 call sites. Hooks for components; plain getters for non-React
// contexts (store actions, app-action resolvers, getState() callers).

/** Resolve a profile by id from a connections snapshot (pure). */
function findProfile(
  connections: ConnectionProfile[],
  id: string | null | undefined,
): ConnectionProfile | null {
  return id ? connections.find((c) => c.id === id) ?? null : null
}

/** The active connection profile (reactive), or null when none is selected. */
export function useActiveProfile(): ConnectionProfile | null {
  return useConnectionsStore((s) => findProfile(s.connections, s.activeConnectionId))
}

/** The connection profile with `id` (reactive), or null. */
export function useProfile(id: string | null | undefined): ConnectionProfile | null {
  return useConnectionsStore((s) => findProfile(s.connections, id))
}

/** The driver type of a connection (reactive), e.g. 'postgresql', or null. */
export function useDbType(id: string | null | undefined): ConnectionProfile['type'] | null {
  return useConnectionsStore((s) => findProfile(s.connections, id)?.type ?? null)
}

/** Non-reactive: the active profile read from the current store state. */
export function getActiveProfile(): ConnectionProfile | null {
  const { connections, activeConnectionId } = useConnectionsStore.getState()
  return findProfile(connections, activeConnectionId)
}

/** Non-reactive: a profile by id read from the current store state. */
export function getProfile(id: string | null | undefined): ConnectionProfile | null {
  return findProfile(useConnectionsStore.getState().connections, id)
}
