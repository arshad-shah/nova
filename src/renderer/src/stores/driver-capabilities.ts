import { create } from 'zustand'
import { IPC_CHANNELS, type IpcChannelMap } from '@shared/ipc'
import { mergeCapabilities } from '@shared/driver-capabilities'
import type { RuntimeCapabilityOverlay } from '@shared/driver-capabilities'
import { ipc } from '@/platform/client'

export type DriverCapabilities = NonNullable<IpcChannelMap[typeof IPC_CHANNELS.DB_DRIVER_CAPABILITIES]['return']>

interface DriverCapsState {
  /** Cache keyed by driver type ('postgresql', 'mongodb', …). `null` means
   *  "we asked the main process and the driver wasn't registered" — distinct
   *  from `undefined` which means "we haven't asked yet". */
  byType: Record<string, DriverCapabilities | null>
  /** Per-connection runtime overlays, keyed by profileId. Cleared on disconnect. */
  byConnection: Record<string, RuntimeCapabilityOverlay | null>
  inflight: Record<string, Promise<DriverCapabilities | null> | undefined>
  /** Fetch driver capabilities by type, with single-flight caching. The
   *  renderer NEVER branches on db type directly — it reads the capability
   *  flags returned here. */
  fetch: (type: string) => Promise<DriverCapabilities | null>
  /** Synchronous lookup — returns the cached value or undefined if it hasn't
   *  been fetched yet. Useful in render paths that have already pre-fetched. */
  get: (type: string) => DriverCapabilities | null | undefined
  /** Fetch + cache the per-connection overlay (after connect). */
  fetchConnection: (profileId: string, type: string) => Promise<void>
  /** Drop a connection's overlay (on disconnect). */
  clearConnection: (profileId: string) => void
  /** THE single capability accessor for components. Merges the connection
   *  overlay over the static type caps. Components never merge by hand. */
  resolveCapabilities: (profileId: string | null, type: string) => DriverCapabilities | null
}

export const useDriverCapabilitiesStore = create<DriverCapsState>((set, get) => ({
  byType: {},
  byConnection: {},
  inflight: {},

  get(type: string) {
    return get().byType[type]
  },

  async fetch(type: string) {
    const cached = get().byType[type]
    if (cached !== undefined) return cached
    const inflight = get().inflight[type]
    if (inflight) return inflight
    const p = ipc
      .invoke(IPC_CHANNELS.DB_DRIVER_CAPABILITIES, type)
      .then((caps) => {
        set((s) => ({
          byType: { ...s.byType, [type]: caps },
          inflight: { ...s.inflight, [type]: undefined }
        }))
        return caps
      })
      .catch((err) => {
        set((s) => ({ inflight: { ...s.inflight, [type]: undefined } }))
        throw err
      })
    set((s) => ({ inflight: { ...s.inflight, [type]: p } }))
    return p
  },

  async fetchConnection(profileId: string, type: string) {
    await get().fetch(type) // ensure static caps are cached
    const overlay = await ipc.invoke(IPC_CHANNELS.DB_CONNECTION_CAPABILITIES, profileId)
    set((s) => ({ byConnection: { ...s.byConnection, [profileId]: overlay } }))
  },

  clearConnection(profileId: string) {
    set((s) => {
      const next = { ...s.byConnection }
      delete next[profileId]
      return { byConnection: next }
    })
  },

  resolveCapabilities(profileId: string | null, type: string) {
    const base = get().byType[type]
    if (!base) return base ?? null
    const overlay = profileId ? get().byConnection[profileId] : null
    return mergeCapabilities(base, overlay)
  },
}))
