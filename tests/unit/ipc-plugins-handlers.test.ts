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
import { IPC_CHANNELS, IPC_EVENTS } from '../../shared/ipc'
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

describe('plugins:get-permissions / set-permissions', () => {
  it('returns null for a plugin with no permission state', async () => {
    const { invoke } = buildHarness([])
    const result = await invoke('plugins:get-permissions', 'ghost')
    expect(result).toBeNull()
  })

  it('merges the permission-info catalogue into an existing permission state', async () => {
    const plugin: LoadedPlugin = { manifest: makeManifest(), path: '<bundled>', status: { state: 'active', contributions: [] } }
    const handlers = new Map<string, (...a: unknown[]) => unknown>()
    const handle = ((ch: string, fn: (...a: unknown[]) => unknown) => handlers.set(ch, fn)) as unknown as Handle
    const pluginCoordinator = {
      getLoadedPlugins: () => [plugin],
      getPlugin: (name: string) => (name === plugin.manifest.name ? plugin : undefined),
      getPermissionState: () => ({ declared: ['keyring'], granted: [] }),
    } as unknown as PluginBootCoordinator
    const ctx = { configStore: { getSettingsCategory: () => ({}) }, driverRegistry: { getDriverIds: () => [] } } as unknown as IpcContext
    registerPluginHandlers(ctx, handle, {
      uiRegistry: new UIRegistryImpl(), completionRegistry: new CompletionRegistryImpl(),
      commandRegistry: new CommandRegistryImpl(), pluginCoordinator,
    })
    const result = await Promise.resolve(handlers.get(IPC_CHANNELS.PLUGINS_GET_PERMISSIONS)!(plugin.manifest.name)) as { declared: string[]; granted: string[]; info: unknown }
    expect(result.declared).toEqual(['keyring'])
    expect(result.info).toBeDefined()
  })

  it('sets grants through the coordinator and returns the granted list back', async () => {
    const setGrants = vi.fn(() => ['keyring'])
    const handlers = new Map<string, (...a: unknown[]) => unknown>()
    const handle = ((ch: string, fn: (...a: unknown[]) => unknown) => handlers.set(ch, fn)) as unknown as Handle
    const pluginCoordinator = { getLoadedPlugins: () => [], setGrants } as unknown as PluginBootCoordinator
    const ctx = { configStore: { getSettingsCategory: () => ({}) }, driverRegistry: { getDriverIds: () => [] } } as unknown as IpcContext
    registerPluginHandlers(ctx, handle, {
      uiRegistry: new UIRegistryImpl(), completionRegistry: new CompletionRegistryImpl(),
      commandRegistry: new CommandRegistryImpl(), pluginCoordinator,
    })
    const result = await Promise.resolve(handlers.get(IPC_CHANNELS.PLUGINS_SET_PERMISSIONS)!('sample', ['keyring']))
    expect(setGrants).toHaveBeenCalledWith('sample', ['keyring'])
    expect(result).toEqual({ granted: ['keyring'] })
  })
})

describe('plugins:install-from-path / install-from-zip — broadcast on success only', () => {
  // broadcast() (src/main/ipc/broadcast.ts) fans out over
  // BrowserWindow.getAllWindows() and calls webContents.send() on each live
  // window. We give it one fake window and assert on that window's send()
  // calls, rather than mocking the broadcast module itself.
  function fakeWindow() {
    return { isDestroyed: () => false, webContents: { send: vi.fn() } }
  }

  it('broadcasts an "installed" lifecycle event when installFromPath succeeds', async () => {
    const plugin: LoadedPlugin = { manifest: makeManifest(), path: '<bundled>', status: { state: 'active', contributions: [] } }
    const handlers = new Map<string, (...a: unknown[]) => unknown>()
    const handle = ((ch: string, fn: (...a: unknown[]) => unknown) => handlers.set(ch, fn)) as unknown as Handle
    const pluginCoordinator = {
      getLoadedPlugins: () => [plugin],
      installFromPath: async () => ({ success: true, name: 'sample' }),
    } as unknown as PluginBootCoordinator
    const ctx = { configStore: { getSettingsCategory: () => ({}) }, driverRegistry: { getDriverIds: () => [] } } as unknown as IpcContext
    const { BrowserWindow } = await import('electron')
    const win = fakeWindow()
    vi.mocked(BrowserWindow.getAllWindows).mockReturnValue([win] as never)
    registerPluginHandlers(ctx, handle, {
      uiRegistry: new UIRegistryImpl(), completionRegistry: new CompletionRegistryImpl(),
      commandRegistry: new CommandRegistryImpl(), pluginCoordinator,
    })
    const result = await Promise.resolve(handlers.get(IPC_CHANNELS.PLUGINS_INSTALL_FROM_PATH)!('/some/path'))
    expect(result).toEqual({ success: true, name: 'sample' })
    expect(win.webContents.send).toHaveBeenCalledWith(IPC_EVENTS.PLUGINS_LIFECYCLE, { name: 'sample', event: 'installed' })
  })

  it('does not broadcast when installFromZip fails', async () => {
    const handlers = new Map<string, (...a: unknown[]) => unknown>()
    const handle = ((ch: string, fn: (...a: unknown[]) => unknown) => handlers.set(ch, fn)) as unknown as Handle
    const pluginCoordinator = {
      getLoadedPlugins: () => [],
      installFromZip: async () => ({ success: false, error: 'bad zip' }),
    } as unknown as PluginBootCoordinator
    const ctx = { configStore: { getSettingsCategory: () => ({}) }, driverRegistry: { getDriverIds: () => [] } } as unknown as IpcContext
    const { BrowserWindow } = await import('electron')
    const win = fakeWindow()
    vi.mocked(BrowserWindow.getAllWindows).mockReturnValue([win] as never)
    registerPluginHandlers(ctx, handle, {
      uiRegistry: new UIRegistryImpl(), completionRegistry: new CompletionRegistryImpl(),
      commandRegistry: new CommandRegistryImpl(), pluginCoordinator,
    })
    const result = await Promise.resolve(handlers.get(IPC_CHANNELS.PLUGINS_INSTALL_FROM_ZIP)!('/bad.zip'))
    expect(result).toEqual({ success: false, error: 'bad zip' })
    expect(win.webContents.send).not.toHaveBeenCalled()
  })
})

describe('plugins:open-install-dialog', () => {
  it('returns null when the dialog is cancelled', async () => {
    const { dialog } = await import('electron')
    vi.mocked(dialog.showOpenDialog).mockResolvedValueOnce({ canceled: true, filePaths: [] } as never)
    const { invoke } = buildHarness([])
    const result = await invoke('plugins:open-install-dialog')
    expect(result).toBeNull()
  })

  it('returns the first selected file path', async () => {
    const { dialog } = await import('electron')
    vi.mocked(dialog.showOpenDialog).mockResolvedValueOnce({ canceled: false, filePaths: ['/chosen/plugin.zip'] } as never)
    const { invoke } = buildHarness([])
    const result = await invoke('plugins:open-install-dialog')
    expect(result).toBe('/chosen/plugin.zip')
  })
})

describe('plugins:uninstall', () => {
  it('calls coordinator.uninstall and broadcasts an "uninstalled" lifecycle event', async () => {
    const uninstall = vi.fn()
    const handlers = new Map<string, (...a: unknown[]) => unknown>()
    const handle = ((ch: string, fn: (...a: unknown[]) => unknown) => handlers.set(ch, fn)) as unknown as Handle
    const pluginCoordinator = { getLoadedPlugins: () => [], uninstall } as unknown as PluginBootCoordinator
    const ctx = { configStore: { getSettingsCategory: () => ({}) }, driverRegistry: { getDriverIds: () => [] } } as unknown as IpcContext
    const { BrowserWindow } = await import('electron')
    const win = { isDestroyed: () => false, webContents: { send: vi.fn() } }
    vi.mocked(BrowserWindow.getAllWindows).mockReturnValue([win] as never)
    registerPluginHandlers(ctx, handle, {
      uiRegistry: new UIRegistryImpl(), completionRegistry: new CompletionRegistryImpl(),
      commandRegistry: new CommandRegistryImpl(), pluginCoordinator,
    })
    await Promise.resolve(handlers.get(IPC_CHANNELS.PLUGINS_UNINSTALL)!('sample'))
    expect(uninstall).toHaveBeenCalledWith('sample')
    expect(win.webContents.send).toHaveBeenCalledWith(IPC_EVENTS.PLUGINS_LIFECYCLE, { name: 'sample', event: 'uninstalled' })
  })
})

describe('plugins:errors', () => {
  it('delegates to the error budget for the named plugin', async () => {
    const getErrors = vi.fn(() => [{ message: 'boom', at: 123 }])
    const handlers = new Map<string, (...a: unknown[]) => unknown>()
    const handle = ((ch: string, fn: (...a: unknown[]) => unknown) => handlers.set(ch, fn)) as unknown as Handle
    const pluginCoordinator = { getLoadedPlugins: () => [], getErrorBudget: () => ({ getErrors }) } as unknown as PluginBootCoordinator
    const ctx = { configStore: { getSettingsCategory: () => ({}) }, driverRegistry: { getDriverIds: () => [] } } as unknown as IpcContext
    registerPluginHandlers(ctx, handle, {
      uiRegistry: new UIRegistryImpl(), completionRegistry: new CompletionRegistryImpl(),
      commandRegistry: new CommandRegistryImpl(), pluginCoordinator,
    })
    const result = await Promise.resolve(handlers.get(IPC_CHANNELS.PLUGINS_ERRORS)!('sample'))
    expect(getErrors).toHaveBeenCalledWith('sample')
    expect(result).toEqual([{ message: 'boom', at: 123 }])
  })
})

describe('plugins:get-settings / set-setting', () => {
  it('returns an empty schema/values shape for an unknown plugin', async () => {
    const { invoke } = buildHarness([])
    const result = await invoke('plugins:get-settings', 'ghost')
    expect(result).toEqual({ schema: [], values: {} })
  })

  it('falls back to each setting default when nothing is stored', async () => {
    const plugin: LoadedPlugin = {
      manifest: makeManifest({ contributes: { settings: [{ key: 'x', title: 'X', type: 'boolean', category: 'general', default: true }] } }),
      path: '<bundled>',
      status: { state: 'active', contributions: [] },
    }
    const { invoke } = buildHarness([plugin])
    const result = await invoke('plugins:get-settings', 'sample')
    expect(result).toEqual({
      schema: [{ key: 'x', title: 'X', type: 'boolean', category: 'general', default: true }],
      values: { x: true },
    })
  })

  it('prefers a stored value over the declared default', async () => {
    const plugin: LoadedPlugin = {
      manifest: makeManifest({ contributes: { settings: [{ key: 'x', title: 'X', type: 'boolean', category: 'general', default: true }] } }),
      path: '<bundled>',
      status: { state: 'active', contributions: [] },
    }
    const handlers = new Map<string, (...a: unknown[]) => unknown>()
    const handle = ((ch: string, fn: (...a: unknown[]) => unknown) => handlers.set(ch, fn)) as unknown as Handle
    const pluginCoordinator = { getLoadedPlugins: () => [plugin], getPlugin: () => plugin } as unknown as PluginBootCoordinator
    const ctx = {
      configStore: { getSettingsCategory: () => ({ sample: { x: false } }) },
      driverRegistry: { getDriverIds: () => [] },
    } as unknown as IpcContext
    registerPluginHandlers(ctx, handle, {
      uiRegistry: new UIRegistryImpl(), completionRegistry: new CompletionRegistryImpl(),
      commandRegistry: new CommandRegistryImpl(), pluginCoordinator,
    })
    const result = await Promise.resolve(handlers.get(IPC_CHANNELS.PLUGINS_GET_SETTINGS)!('sample'))
    expect(result).toEqual({ schema: plugin.manifest.contributes.settings, values: { x: false } })
  })

  it('writes a namespaced settings key (plugins.<name>.<key>)', async () => {
    const setSetting = vi.fn()
    const handlers = new Map<string, (...a: unknown[]) => unknown>()
    const handle = ((ch: string, fn: (...a: unknown[]) => unknown) => handlers.set(ch, fn)) as unknown as Handle
    const pluginCoordinator = { getLoadedPlugins: () => [] } as unknown as PluginBootCoordinator
    const ctx = { configStore: { getSettingsCategory: () => ({}), setSetting }, driverRegistry: { getDriverIds: () => [] } } as unknown as IpcContext
    registerPluginHandlers(ctx, handle, {
      uiRegistry: new UIRegistryImpl(), completionRegistry: new CompletionRegistryImpl(),
      commandRegistry: new CommandRegistryImpl(), pluginCoordinator,
    })
    await Promise.resolve(handlers.get(IPC_CHANNELS.PLUGINS_SET_SETTING)!('sample', 'x', false))
    expect(setSetting).toHaveBeenCalledWith('plugins.sample.x', false)
  })
})

describe('plugins:get-commands', () => {
  it('collects commands only from active/degraded plugins, attaching plugin identity', async () => {
    const active: LoadedPlugin = {
      manifest: makeManifest({ name: 'a', displayName: 'A', contributes: { commands: [{ id: 'run', title: 'Run', keybinding: 'Ctrl+R' }] } }),
      path: '<bundled>',
      status: { state: 'active', contributions: [] },
    }
    const inactive: LoadedPlugin = {
      manifest: makeManifest({ name: 'b', displayName: 'B', contributes: { commands: [{ id: 'skip', title: 'Skip' }] } }),
      path: '<bundled>',
      status: { state: 'inactive' },
    }
    const { invoke } = buildHarness([active, inactive])
    const result = await invoke('plugins:get-commands')
    expect(result).toEqual([{ pluginId: 'a', pluginDisplayName: 'A', commandId: 'run', title: 'Run', keybinding: 'Ctrl+R' }])
  })
})

describe('plugins:connection-fields', () => {
  it('maps each registered driver id to its factory-declared connection fields', async () => {
    const handlers = new Map<string, (...a: unknown[]) => unknown>()
    const handle = ((ch: string, fn: (...a: unknown[]) => unknown) => handlers.set(ch, fn)) as unknown as Handle
    const pluginCoordinator = { getLoadedPlugins: () => [] } as unknown as PluginBootCoordinator
    const factory = { connectionFields: [{ key: 'host', label: 'Host', type: 'string' }] }
    const ctx = {
      configStore: { getSettingsCategory: () => ({}) },
      driverRegistry: { getDriverIds: () => ['postgresql'], get: () => factory },
    } as unknown as IpcContext
    registerPluginHandlers(ctx, handle, {
      uiRegistry: new UIRegistryImpl(), completionRegistry: new CompletionRegistryImpl(),
      commandRegistry: new CommandRegistryImpl(), pluginCoordinator,
    })
    const result = await Promise.resolve(handlers.get(IPC_CHANNELS.PLUGINS_CONNECTION_FIELDS)!())
    expect(result).toEqual([{ driverId: 'postgresql', driverName: 'postgresql', connectionFields: factory.connectionFields }])
  })
})

describe('plugins:middleware-fields', () => {
  it('flattens connectionFields contributed by every loaded plugin', async () => {
    const withFields: LoadedPlugin = {
      manifest: makeManifest({ contributes: { connectionFields: [{ key: 'sshHost', label: 'SSH Host', type: 'string' }] } }),
      path: '<bundled>', status: { state: 'active', contributions: [] },
    }
    const withoutFields: LoadedPlugin = { manifest: makeManifest({ name: 'plain' }), path: '<bundled>', status: { state: 'active', contributions: [] } }
    const { invoke } = buildHarness([withFields, withoutFields])
    const result = await invoke('plugins:middleware-fields')
    expect(result).toEqual([{ key: 'sshHost', label: 'SSH Host', type: 'string' }])
  })
})

describe('plugins:ui:get-contributions', () => {
  it('returns statusBar contributions registered on the ui registry', async () => {
    const uiRegistry = new UIRegistryImpl()
    const handlers = new Map<string, (...a: unknown[]) => unknown>()
    const handle = ((ch: string, fn: (...a: unknown[]) => unknown) => handlers.set(ch, fn)) as unknown as Handle
    const plugin: LoadedPlugin = { manifest: makeManifest({ displayName: 'Sample' }), path: '<bundled>', status: { state: 'active', contributions: [] } }
    const pluginCoordinator = { getLoadedPlugins: () => [plugin], getPlugin: () => plugin } as unknown as PluginBootCoordinator
    const ctx = { configStore: { getSettingsCategory: () => ({}) }, driverRegistry: { getDriverIds: () => [] } } as unknown as IpcContext
    uiRegistry.currentPluginName = 'sample'
    uiRegistry.registerStatusBar('bar-1', [{ type: 'text', text: 'hi' }] as never)
    registerPluginHandlers(ctx, handle, {
      uiRegistry, completionRegistry: new CompletionRegistryImpl(), commandRegistry: new CommandRegistryImpl(), pluginCoordinator,
    })
    const result = await Promise.resolve(handlers.get(IPC_CHANNELS.PLUGINS_UI_GET_CONTRIBUTIONS)!('statusBar')) as Array<{ surface: string; pluginId: string }>
    expect(result).toHaveLength(1)
    expect(result[0].surface).toBe('statusBar')
    expect(result[0].pluginId).toBe('sample')
  })

  it('returns contextMenu contributions only from active/degraded plugins', async () => {
    const plugin: LoadedPlugin = {
      manifest: makeManifest({ contributes: { contextMenus: [{ id: 'ctx-1', target: 'row', label: 'Do it', command: 'sample:do' }] } }),
      path: '<bundled>', status: { state: 'active', contributions: [] },
    }
    const { invoke } = buildHarness([plugin])
    const result = await invoke('plugins:ui:get-contributions', 'contextMenu')
    expect(result).toEqual([{
      pluginId: 'sample', pluginName: 'Sample', surface: 'contextMenu', contributionId: 'ctx-1',
      widgets: [], meta: { target: 'row', label: 'Do it', command: 'sample:do' },
    }])
  })

  it('returns an empty array for a surface with no contributions', async () => {
    const { invoke } = buildHarness([])
    const result = await invoke('plugins:ui:get-contributions', 'toolbar')
    expect(result).toEqual([])
  })
})

describe('plugins:ui:resolve / plugins:ui:action', () => {
  it('resolves through the ui registry, routed through safeCallWithBudget', async () => {
    const uiRegistry = new UIRegistryImpl()
    uiRegistry.currentPluginName = 'sample'
    uiRegistry.registerResolver('resolver-1', (async () => [{ value: 'v', label: 'l' }]) as never)
    const handlers = new Map<string, (...a: unknown[]) => unknown>()
    const handle = ((ch: string, fn: (...a: unknown[]) => unknown) => handlers.set(ch, fn)) as unknown as Handle
    const safeCallWithBudget = vi.fn(async (_id: string, fn: () => unknown) => fn())
    const pluginCoordinator = { getLoadedPlugins: () => [], safeCallWithBudget } as unknown as PluginBootCoordinator
    const ctx = { configStore: { getSettingsCategory: () => ({}) }, driverRegistry: { getDriverIds: () => [] } } as unknown as IpcContext
    registerPluginHandlers(ctx, handle, {
      uiRegistry, completionRegistry: new CompletionRegistryImpl(), commandRegistry: new CommandRegistryImpl(), pluginCoordinator,
    })
    const result = await Promise.resolve(handlers.get(IPC_CHANNELS.PLUGINS_UI_RESOLVE)!('sample', 'resolver-1', {}))
    expect(safeCallWithBudget).toHaveBeenCalledWith('sample', expect.any(Function))
    expect(result).toEqual([{ value: 'v', label: 'l' }])
  })

  it('executes the given command via the command registry, routed through safeCallWithBudget', async () => {
    const commandRegistry = new CommandRegistryImpl()
    const cmdHandler = vi.fn()
    commandRegistry.register('sample:do', cmdHandler)
    const handlers = new Map<string, (...a: unknown[]) => unknown>()
    const handle = ((ch: string, fn: (...a: unknown[]) => unknown) => handlers.set(ch, fn)) as unknown as Handle
    const safeCallWithBudget = vi.fn(async (_id: string, fn: () => unknown) => fn())
    const pluginCoordinator = { getLoadedPlugins: () => [], safeCallWithBudget } as unknown as PluginBootCoordinator
    const ctx = { configStore: { getSettingsCategory: () => ({}) }, driverRegistry: { getDriverIds: () => [] } } as unknown as IpcContext
    registerPluginHandlers(ctx, handle, {
      uiRegistry: new UIRegistryImpl(), completionRegistry: new CompletionRegistryImpl(), commandRegistry, pluginCoordinator,
    })
    await Promise.resolve(handlers.get(IPC_CHANNELS.PLUGINS_UI_ACTION)!('sample', 'sample:do', { foo: 1 }))
    expect(safeCallWithBudget).toHaveBeenCalledWith('sample', expect.any(Function))
    expect(cmdHandler).toHaveBeenCalledWith({ foo: 1 })
  })
})
