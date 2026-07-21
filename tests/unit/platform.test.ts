// lib/platform.ts computes its exports ONCE at module load time from
// `window.electronAPI.platform`, so each scenario needs a fresh module
// instance with the bridge mocked before import.
import { describe, it, expect, vi, afterEach } from 'vitest'

async function freshModule() {
  vi.resetModules()
  return import('../../src/renderer/src/lib/platform')
}

const originalElectronAPI = globalThis.window.electronAPI

afterEach(() => {
  // @ts-expect-error test override
  globalThis.window.electronAPI = originalElectronAPI
})

describe('platform detection', () => {
  it('reports darwin as mac, and not windows/linux', async () => {
    // @ts-expect-error test override
    globalThis.window.electronAPI = { platform: 'darwin' }
    const mod = await freshModule()
    expect(mod.platform).toBe('darwin')
    expect(mod.isMac).toBe(true)
    expect(mod.isWindows).toBe(false)
    expect(mod.isLinux).toBe(false)
  })

  it('reports win32 as windows, and not mac/linux', async () => {
    // @ts-expect-error test override
    globalThis.window.electronAPI = { platform: 'win32' }
    const mod = await freshModule()
    expect(mod.platform).toBe('win32')
    expect(mod.isWindows).toBe(true)
    expect(mod.isMac).toBe(false)
    expect(mod.isLinux).toBe(false)
  })

  it('reports linux as linux, and not mac/windows', async () => {
    // @ts-expect-error test override
    globalThis.window.electronAPI = { platform: 'linux' }
    const mod = await freshModule()
    expect(mod.platform).toBe('linux')
    expect(mod.isLinux).toBe(true)
    expect(mod.isMac).toBe(false)
    expect(mod.isWindows).toBe(false)
  })

  it('falls back to "web" when electronAPI has no platform field (Storybook/tests outside Electron)', async () => {
    // @ts-expect-error test override
    globalThis.window.electronAPI = {}
    const mod = await freshModule()
    expect(mod.platform).toBe('web')
    expect(mod.isMac).toBe(false)
    expect(mod.isWindows).toBe(false)
    expect(mod.isLinux).toBe(false)
  })

  it('falls back to "web" when electronAPI itself is absent', async () => {
    // @ts-expect-error test override
    delete globalThis.window.electronAPI
    const mod = await freshModule()
    expect(mod.platform).toBe('web')
  })
})
