// src/main/ipc/plugins.ts is the glue between the renderer's Plugins panel and
// the PluginBootCoordinator. We fake the coordinator (a collaborator, not the
// unit under test) and drive the handlers exactly like the renderer would:
// with attacker-shaped inputs (a manifest with a path-traversing icon, an
// unknown plugin name, a plugin sitting in a non-active state).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'

vi.mock('electron', () => ({
  dialog: { showOpenDialog: vi.fn() },
  // registerPluginHandlers's broadcastLifecycle() calls through to
  // src/main/ipc/broadcast.ts, which touches BrowserWindow — stub it so a
  // handler that *shouldn't* broadcast (e.g. a failed activation) still runs
  // cleanly if a regression makes it broadcast anyway, instead of masking the
  // bug behind an unrelated "no BrowserWindow export" crash.
  BrowserWindow: { getAllWindows: vi.fn(() => []) },
}))

import { registerPluginHandlers } from '../../src/main/ipc/plugins'
import { UIRegistryImpl } from '../../src/main/plugins/sdk/ui-registry'
import { CompletionRegistryImpl } from '../../src/main/plugins/sdk/completion-registry'
import { CommandRegistryImpl } from '../../src/main/plugins/sdk/command-registry'
import { IPC_CHANNELS } from '../../shared/ipc'
import type { IpcContext, Handle } from '../../src/main/ipc/context'
import type { IpcChannelMap } from '../../shared/ipc'
import type { LoadedPlugin } from '../../src/main/plugins/types'
import type { PluginBootCoordinator } from '../../src/main/plugins/plugin-host'

function makeManifest(overrides: Partial<LoadedPlugin['manifest']> = {}): LoadedPlugin['manifest'] {
  return {
    name: 'sample',
    version: '1.0.0',
    displayName: 'Sample',
    description: 'A sample plugin',
    main: 'index.js',
    contributes: {},
    ...overrides,
  }
}

function buildHarness(plugins: LoadedPlugin[]) {
  const handlers = new Map<string, (...a: unknown[]) => unknown>()
  const handle = ((channel: string, fn: (...a: unknown[]) => unknown) => {
    handlers.set(channel, fn)
  }) as unknown as Handle

  const uiRegistry = new UIRegistryImpl()
  const completionRegistry = new CompletionRegistryImpl()
  const commandRegistry = new CommandRegistryImpl()

  const pluginCoordinator = {
    getLoadedPlugins: () => plugins,
    getPlugin: (name: string) => plugins.find(p => p.manifest.name === name),
    getPermissionState: () => undefined,
    setGrants: () => [],
    activatePlugin: async () => ({ status: { state: 'active', contributions: [] } }),
    deactivatePlugin: async () => {},
    installFromPath: async () => ({ success: true, name: 'sample' }),
    installFromZip: async () => ({ success: true, name: 'sample' }),
    uninstall: () => {},
    getErrorBudget: () => ({ getErrors: () => [] }),
    safeCallWithBudget: async (_id: string, fn: () => unknown) => fn(),
  } as unknown as PluginBootCoordinator

  const ctx = {
    configStore: { getSettingsCategory: () => ({}), setSetting: () => {} },
    driverRegistry: { getDriverIds: () => [] },
  } as unknown as IpcContext

  registerPluginHandlers(ctx, handle, { uiRegistry, completionRegistry, commandRegistry, pluginCoordinator })

  const invoke = (<K extends keyof IpcChannelMap>(channel: K, ...args: IpcChannelMap[K]['args']) => {
    const fn = handlers.get(channel)
    if (!fn) throw new Error(`No handler for ${channel}`)
    return Promise.resolve(fn(...args))
  }) as <K extends keyof IpcChannelMap>(channel: K, ...args: IpcChannelMap[K]['args']) => Promise<IpcChannelMap[K]['return']>

  return { invoke }
}

describe('plugins:list — icon resolution (resolvePluginIcon)', () => {
  let pluginDir: string
  let secretFile: string

  beforeEach(() => {
    pluginDir = fs.mkdtempSync(path.join(os.tmpdir(), 'verql-plugin-'))
    // Simulate a sensitive file elsewhere on disk that a plugin has no
    // business reading, e.g. one directory above the plugin's own folder.
    secretFile = path.join(path.dirname(pluginDir), `secret-${Date.now()}.txt`)
    fs.writeFileSync(secretFile, 'top-secret-contents')
  })

  afterEach(() => {
    fs.rmSync(pluginDir, { recursive: true, force: true })
    try { fs.unlinkSync(secretFile) } catch { /* already gone */ }
  })

  it('resolves a well-behaved relative icon inside the plugin directory', async () => {
    fs.writeFileSync(path.join(pluginDir, 'icon.png'), Buffer.from('fake-png-bytes'))
    const plugin: LoadedPlugin = {
      manifest: makeManifest({ icon: 'icon.png' }),
      path: pluginDir,
      status: { state: 'active', contributions: [] },
    }
    const { invoke } = buildHarness([plugin])
    const [entry] = await invoke('plugins:list')
    expect(entry.icon).toMatch(/^data:image\/png;base64,/)
  })

  it('returns undefined (no icon) for a bundled plugin regardless of its manifest icon field', async () => {
    const plugin: LoadedPlugin = {
      manifest: makeManifest({ icon: 'icon.png' }),
      path: '<bundled>',
      status: { state: 'active', contributions: [] },
    }
    const { invoke } = buildHarness([plugin])
    const [entry] = await invoke('plugins:list')
    expect(entry.icon).toBeUndefined()
  })

  it('returns undefined when the declared icon file does not exist', async () => {
    const plugin: LoadedPlugin = {
      manifest: makeManifest({ icon: 'missing.png' }),
      path: pluginDir,
      status: { state: 'active', contributions: [] },
    }
    const { invoke } = buildHarness([plugin])
    const [entry] = await invoke('plugins:list')
    expect(entry.icon).toBeUndefined()
  })

  // SECURITY REGRESSION. `manifest.icon` is attacker-controlled for any
  // third-party plugin. resolvePluginIcon used to `path.resolve(plugin.path,
  // icon)` with no containment check, so `icon: "../secret.txt"` escaped the
  // plugin's own directory and the handler base64-encoded whatever it found and
  // handed it to the renderer as the plugin's "icon" — an arbitrary file read
  // for anything the main process can open, from any installed plugin, with no
  // prompt. `manifest.main` had this guard from the start; icon never got it.
  it('does NOT follow a path-traversing icon field outside the plugin directory', async () => {
    const plugin: LoadedPlugin = {
      manifest: makeManifest({ icon: `../${path.basename(secretFile)}` }),
      path: pluginDir,
      status: { state: 'active', contributions: [] },
    }
    const { invoke } = buildHarness([plugin])
    const [entry] = await invoke('plugins:list')
    expect(entry.icon).toBeUndefined()
  })

  it('does NOT read an absolute icon path', async () => {
    const plugin: LoadedPlugin = {
      manifest: makeManifest({ icon: secretFile }),
      path: pluginDir,
      status: { state: 'active', contributions: [] },
    }
    const { invoke } = buildHarness([plugin])
    const [entry] = await invoke('plugins:list')
    expect(entry.icon).toBeUndefined()
  })

  it('does NOT leak a traversed file even when it wears an image extension', async () => {
    // The extension only ever chose a MIME type; it restricted nothing. A
    // traversal to `../secret.png` would still have been read and returned.
    const png = path.join(path.dirname(pluginDir), `secret-${Date.now()}.png`)
    fs.writeFileSync(png, 'top-secret-contents')
    try {
      const plugin: LoadedPlugin = {
        manifest: makeManifest({ icon: `../${path.basename(png)}` }),
        path: pluginDir,
        status: { state: 'active', contributions: [] },
      }
      const { invoke } = buildHarness([plugin])
      const [entry] = await invoke('plugins:list')
      expect(entry.icon).toBeUndefined()
    } finally {
      fs.rmSync(png, { force: true })
    }
  })

  it('does NOT read a non-image file even inside the plugin directory', async () => {
    // An unknown extension now means the file is never opened at all, rather
    // than being read and mislabelled as image/jpeg.
    fs.writeFileSync(path.join(pluginDir, 'notes.txt'), 'not an image')
    const plugin: LoadedPlugin = {
      manifest: makeManifest({ icon: 'notes.txt' }),
      path: pluginDir,
      status: { state: 'active', contributions: [] },
    }
    const { invoke } = buildHarness([plugin])
    const [entry] = await invoke('plugins:list')
    expect(entry.icon).toBeUndefined()
  })

  it('still resolves a legitimate icon in a nested subdirectory', async () => {
    // The guard must not break the normal case it exists to protect.
    fs.mkdirSync(path.join(pluginDir, 'assets'), { recursive: true })
    fs.writeFileSync(path.join(pluginDir, 'assets', 'icon.svg'), '<svg/>')
    const plugin: LoadedPlugin = {
      manifest: makeManifest({ icon: 'assets/icon.svg' }),
      path: pluginDir,
      status: { state: 'active', contributions: [] },
    }
    const { invoke } = buildHarness([plugin])
    const [entry] = await invoke('plugins:list')
    expect(entry.icon).toMatch(/^data:image\/svg\+xml;base64,/)
  })
})

describe('plugins:list — contribution visibility by lifecycle state', () => {
  it('surfaces contributions for an active plugin', async () => {
    const plugin: LoadedPlugin = {
      manifest: makeManifest(),
      path: '<bundled>',
      status: { state: 'active', contributions: ['driver:sample'] },
    }
    const { invoke } = buildHarness([plugin])
    const [entry] = await invoke('plugins:list')
    expect(entry.contributions).toEqual(['driver:sample'])
  })

  it('still surfaces contributions for a degraded plugin (partial activation)', async () => {
    const plugin: LoadedPlugin = {
      manifest: makeManifest(),
      path: '<bundled>',
      status: { state: 'degraded', error: 'boom', contributions: ['driver:sample'] },
    }
    const { invoke } = buildHarness([plugin])
    const [entry] = await invoke('plugins:list')
    expect(entry.contributions).toEqual(['driver:sample'])
  })

  it('reports an empty contributions list for an inactive plugin, not the shape of an active one', async () => {
    const plugin: LoadedPlugin = {
      manifest: makeManifest(),
      path: '<bundled>',
      status: { state: 'inactive' },
    }
    const { invoke } = buildHarness([plugin])
    const [entry] = await invoke('plugins:list')
    expect(entry.contributions).toEqual([])
  })
})

describe('plugins:activate / deactivate', () => {
  it('returns success:false with the coordinator error message for an unknown plugin', async () => {
    const { invoke } = buildHarness([])
    const result = await invoke('plugins:activate', 'does-not-exist')
    expect(result).toEqual({ success: false, error: 'Plugin not found' })
  })

  it('is a silent no-op (does not throw) when deactivating an unknown plugin', async () => {
    const { invoke } = buildHarness([])
    await expect(invoke('plugins:deactivate', 'does-not-exist')).resolves.toBeUndefined()
  })

  // Regression: a mutant that dropped the `result.status.state === 'error'`
  // check (always broadcasting 'activated' and returning success:true) passed
  // every other test in this suite, because they only exercise the "plugin
  // not found" branch. A plugin whose activate() throws/degrades to 'error'
  // must be reported back to the renderer as a failure, not swallowed.
  it('returns success:false with the coordinator error message when activation itself fails', async () => {
    const plugin: LoadedPlugin = {
      manifest: makeManifest(),
      path: '<bundled>',
      status: { state: 'inactive' },
    }
    const handlers = new Map<string, (...a: unknown[]) => unknown>()
    const handle = ((channel: string, fn: (...a: unknown[]) => unknown) => {
      handlers.set(channel, fn)
    }) as unknown as Handle
    const pluginCoordinator = {
      getLoadedPlugins: () => [plugin],
      getPlugin: (name: string) => (name === plugin.manifest.name ? plugin : undefined),
      getPermissionState: () => undefined,
      activatePlugin: async () => ({ status: { state: 'error', error: 'native module failed to load' } }),
    } as unknown as PluginBootCoordinator
    const ctx = { configStore: { getSettingsCategory: () => ({}) }, driverRegistry: { getDriverIds: () => [] } } as unknown as IpcContext
    registerPluginHandlers(ctx, handle, {
      uiRegistry: new UIRegistryImpl(),
      completionRegistry: new CompletionRegistryImpl(),
      commandRegistry: new CommandRegistryImpl(),
      pluginCoordinator,
    })
    const result = await handlers.get(IPC_CHANNELS.PLUGINS_ACTIVATE)!(plugin.manifest.name)
    expect(result).toEqual({ success: false, error: 'native module failed to load' })
  })
})

describe('plugins:get-categorized-settings', () => {
  it('excludes settings from a plugin that is not active or degraded', async () => {
    const plugin: LoadedPlugin = {
      manifest: makeManifest({
        contributes: { settings: [{ key: 'x', title: 'X', type: 'boolean', category: 'general' }] },
      }),
      path: '<bundled>',
      status: { state: 'error', error: 'crashed', phase: 'activate' },
    }
    const { invoke } = buildHarness([plugin])
    const result = await invoke('plugins:get-categorized-settings', 'general')
    expect(result).toEqual([])
  })

  it('excludes settings targeting a different category', async () => {
    const plugin: LoadedPlugin = {
      manifest: makeManifest({
        contributes: { settings: [{ key: 'x', title: 'X', type: 'boolean', category: 'ai' }] },
      }),
      path: '<bundled>',
      status: { state: 'active', contributions: [] },
    }
    const { invoke } = buildHarness([plugin])
    const result = await invoke('plugins:get-categorized-settings', 'general')
    expect(result).toEqual([])
  })

  it('includes a matching-category setting from an active plugin, falling back to its declared default', async () => {
    const plugin: LoadedPlugin = {
      manifest: makeManifest({
        contributes: { settings: [{ key: 'x', title: 'X', type: 'boolean', category: 'general', default: true }] },
      }),
      path: '<bundled>',
      status: { state: 'active', contributions: [] },
    }
    const { invoke } = buildHarness([plugin])
    const result = await invoke('plugins:get-categorized-settings', 'general')
    expect(result).toEqual([
      { pluginName: 'sample', pluginDisplayName: 'Sample', schema: [{ key: 'x', title: 'X', type: 'boolean', category: 'general', default: true }], values: { x: true } },
    ])
  })
})

describe('plugins:completions', () => {
  it('returns an empty array when no loaded plugin owns the given driverId', async () => {
    const { invoke } = buildHarness([])
    const result = await invoke('plugins:completions', 'unknown-driver', 'conn-1', { text: 'SELECT' } as never)
    expect(result).toEqual([])
  })
})
