import { IPC_CHANNELS } from '@shared/ipc'
import type { OpenTabsSnapshot, TabOp } from '@shared/appdata'
import type { TabPersistenceTransport } from './engine'
import { ipc } from '@/platform/client'

/** Read + write surface over the app-data store. Extends the engine's
 *  write-only transport with the startup read used to hydrate the baseline. */
export interface TabPersistenceStore extends TabPersistenceTransport {
  list: () => Promise<OpenTabsSnapshot>
}

const EMPTY: OpenTabsSnapshot = { tabs: [], activeId: null }

/** Backed by the main-process SQLite app-data store over IPC. */
export const ipcTabStore: TabPersistenceStore = {
  list: () => ipc.invoke(IPC_CHANNELS.APPDATA_OPEN_TABS_LIST),
  apply: (ops: TabOp[]) => ipc.invoke(IPC_CHANNELS.APPDATA_OPEN_TABS_APPLY, ops),
}

/** No-op store for environments without the IPC bridge (SSR, some tests). */
export const noopTabStore: TabPersistenceStore = {
  list: async () => EMPTY,
  apply: async () => {},
}

/** The IPC store when the bridge is present, else a safe no-op. */
export function resolveTabStore(): TabPersistenceStore {
  return ipc.available() ? ipcTabStore : noopTabStore
}
