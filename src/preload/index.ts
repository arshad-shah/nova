import { contextBridge, ipcRenderer } from 'electron'
import type { IpcChannelMap, IpcEventMap } from '@shared/ipc'

const electronAPI = {
  /** Host OS, so the renderer can lay out the title bar / window controls to
   *  match each platform's conventions without an extra IPC round-trip. */
  platform: process.platform,

  invoke: <K extends keyof IpcChannelMap>(
    channel: K,
    ...args: IpcChannelMap[K]['args']
  ): Promise<IpcChannelMap[K]['return']> =>
    ipcRenderer.invoke(channel, ...args),

  on: <E extends keyof IpcEventMap>(
    channel: E,
    callback: (...args: IpcEventMap[E]) => void
  ): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, ...args: unknown[]) =>
      (callback as (...a: unknown[]) => void)(...args)
    ipcRenderer.on(channel, listener)
    return () => { ipcRenderer.removeListener(channel, listener) }
  }
}

export type ElectronAPI = typeof electronAPI

contextBridge.exposeInMainWorld('electronAPI', electronAPI)
