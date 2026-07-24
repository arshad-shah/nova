import { contextBridge, ipcRenderer } from 'electron'
import { randomUUID } from 'node:crypto'
import type { IpcChannelMap, IpcEventMap } from '@shared/ipc'
import { makeTraceEnvelope } from '@shared/trace'

const electronAPI = {
  /** Host OS, so the renderer can lay out the title bar / window controls to
   *  match each platform's conventions without an extra IPC round-trip. */
  platform: process.platform,

  /**
   * Every invoke carries a freshly-minted **trace id** as a trailing envelope
   * argument. This is the one place renderer→main traces are born: the preload
   * is the actual wire boundary (the platform client runs in the main world and
   * can only reach main through this exposed API, so a trace envelope attached
   * there would be an observable app-level argument — here it is a transparent
   * transport concern). The main-side handler wrappers strip the envelope and
   * set it as the ambient trace so every activity entry the call causes
   * correlates, without any recorder threading the id. Each invoke is its own
   * trace root: unrelated actions get distinct ids; a single action's downstream
   * entries (a query's `ipc`/`query`/driver/`perf`) share one.
   */
  invoke: <K extends keyof IpcChannelMap>(
    channel: K,
    ...args: IpcChannelMap[K]['args']
  ): Promise<IpcChannelMap[K]['return']> =>
    ipcRenderer.invoke(channel, ...args, makeTraceEnvelope(randomUUID())),

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
