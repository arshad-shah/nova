// transport.ts wires the persistence engine to either the real IPC bridge or
// a safe no-op backend, chosen at call time by whether window.electronAPI
// exists. Nothing in tab-persistence's other suites exercises this file
// directly — engine/select/diff/migrate tests all inject a fake transport.
import { describe, it, expect, afterEach } from 'vitest'
import { ipcTabStore, noopTabStore, resolveTabStore } from '@/lib/tab-persistence/transport'
import { IPC_CHANNELS } from '@shared/ipc'

const originalElectronAPI = globalThis.window.electronAPI

afterEach(() => {
  // @ts-expect-error test override
  globalThis.window.electronAPI = originalElectronAPI
})

describe('resolveTabStore', () => {
  it('resolves to the IPC-backed store when window.electronAPI is present', () => {
    // @ts-expect-error test override
    globalThis.window.electronAPI = { invoke: () => Promise.resolve(), on: () => () => {} }
    expect(resolveTabStore()).toBe(ipcTabStore)
  })

  it('resolves to the no-op store when window.electronAPI is absent', () => {
    // @ts-expect-error test override
    delete globalThis.window.electronAPI
    expect(resolveTabStore()).toBe(noopTabStore)
  })
})

describe('noopTabStore', () => {
  it('list() resolves to an empty snapshot', async () => {
    await expect(noopTabStore.list()).resolves.toEqual({ tabs: [], activeId: null })
  })

  it('apply() resolves without doing anything observable', async () => {
    await expect(noopTabStore.apply([{ kind: 'active', id: 'x' }])).resolves.toBeUndefined()
  })
})

describe('ipcTabStore', () => {
  it('list() forwards to the APPDATA_OPEN_TABS_LIST IPC channel', async () => {
    const invoke = (channel: string) => {
      expect(channel).toBe(IPC_CHANNELS.APPDATA_OPEN_TABS_LIST)
      return Promise.resolve({ tabs: [], activeId: null })
    }
    // @ts-expect-error test override
    globalThis.window.electronAPI = { invoke, on: () => () => {} }
    await ipcTabStore.list()
  })

  it('apply() forwards the ops to the APPDATA_OPEN_TABS_APPLY IPC channel', async () => {
    const ops = [{ kind: 'active', id: 'x' } as const]
    let called: unknown[] = []
    const invoke = (channel: string, ...args: unknown[]) => {
      called = [channel, ...args]
      return Promise.resolve()
    }
    // @ts-expect-error test override
    globalThis.window.electronAPI = { invoke, on: () => () => {} }
    await ipcTabStore.apply(ops)
    expect(called).toEqual([IPC_CHANNELS.APPDATA_OPEN_TABS_APPLY, ops])
  })
})
