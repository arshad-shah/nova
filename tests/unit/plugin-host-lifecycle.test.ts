// Behavioural coverage for the parts of the BootCoordinator lifecycle the
// existing plugin-boot.test.ts and audit/* suites don't reach: the discover()
// manifest-parsing edge cases, the validateAll() failure paths, a full
// on-disk discover->validate->resolve->activate boot(), install/uninstall,
// the permission-grant accessors, the error-budget auto-deactivate, shutdown
// ordering/resilience, and the coordinator-level isolated-activation wiring
// (onCrash notification + activationOrder bookkeeping) that isolated-plugin
// tests only exercise at the IsolatedPlugin-class level.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'

const USER_DATA = path.join(os.tmpdir(), 'verql-plugin-lifecycle-test-userdata')
vi.mock('electron', () => ({ app: { getPath: () => USER_DATA } }))

import { PluginBootCoordinator } from '../../src/main/plugins/plugin-host'
import { DriverRegistryImpl } from '../../src/main/plugins/sdk/driver-registry'
import { CommandRegistryImpl } from '../../src/main/plugins/sdk/command-registry'
import { PanelRegistryImpl } from '../../src/main/plugins/sdk/panel-registry'
import { UIRegistryImpl } from '../../src/main/plugins/sdk/ui-registry'
import { CompletionRegistryImpl } from '../../src/main/plugins/sdk/completion-registry'
import { ServiceRegistryImpl } from '../../src/main/plugins/sdk/service-registry'
import { ExporterRegistryImpl } from '../../src/main/plugins/sdk/exporter-registry'
import { ImporterRegistryImpl } from '../../src/main/plugins/sdk/importer-registry'
import { FormatterRegistryImpl } from '../../src/main/plugins/sdk/formatter-registry'
import { TypeMapperRegistryImpl } from '../../src/main/plugins/sdk/type-mapper-registry'
import { ThemeRegistryImpl } from '../../src/main/plugins/sdk/theme-registry'
import { DragDropRegistryImpl } from '../../src/main/plugins/sdk/drag-drop-registry'
import { ToolRegistryImpl } from '../../src/main/plugins/sdk/tool-registry'
import { createMemoryTransportPair } from '../../src/main/plugins/isolation/memory-transport'
import { startWorker } from '../../src/main/plugins/isolation/worker-runtime'
import type { LoadedPlugin } from '../../src/main/plugins/types'
import type { PluginPermission } from '../../src/main/plugins/sdk/permissions'

const noopKeyring = {
  store: async () => {},
  retrieve: async () => null,
  delete: async () => {},
  listKeys: async () => [],
}

function baseDeps(extra: Record<string, unknown> = {}) {
  return {
    driverRegistry: new DriverRegistryImpl(),
    commandRegistry: new CommandRegistryImpl(),
    panelRegistry: new PanelRegistryImpl(),
    uiRegistry: new UIRegistryImpl(),
    completionRegistry: new CompletionRegistryImpl(),
    getAdapter: () => undefined,
    getProfile: () => undefined,
    keyring: noopKeyring,
    settingsStore: { get: () => undefined, set: () => {} },
    services: new ServiceRegistryImpl(),
    exporterRegistry: new ExporterRegistryImpl(),
    importerRegistry: new ImporterRegistryImpl(),
    formatterRegistry: new FormatterRegistryImpl(),
    typeMapperRegistry: new TypeMapperRegistryImpl(),
    themeRegistry: new ThemeRegistryImpl(),
    notificationBus: { show: () => {} },
    dragDropRegistry: new DragDropRegistryImpl(),
    toolRegistry: new ToolRegistryImpl(),
    ...extra,
  }
}

function makeCoordinator(extra: Record<string, unknown> = {}): PluginBootCoordinator {
  return new PluginBootCoordinator(baseDeps(extra) as ConstructorParameters<typeof PluginBootCoordinator>[0])
}

let tmpDir: string
beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'verql-plugin-lifecycle-'))
})
afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
  fs.rmSync(USER_DATA, { recursive: true, force: true, maxRetries: 3 })
})

function writeManifest(dir: string, manifest: Record<string, unknown>) {
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'plugin-manifest.json'), JSON.stringify(manifest))
}

// ─── discover() ──────────────────────────────────────────────────────────────

describe('discover() — manifest parsing edge cases', () => {
  it('falls back to package.json when it carries the verql-plugin keyword', () => {
    const dir = path.join(tmpDir, 'pkg-plugin')
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({
      name: 'pkg-based', version: '1.0.0', keywords: ['verql-plugin'], main: 'index.js',
    }))
    fs.writeFileSync(path.join(dir, 'index.js'), 'exports.activate = () => {}')

    const coordinator = makeCoordinator()
    coordinator.discover([tmpDir])

    const plugin = coordinator.getPlugin('pkg-based')
    expect(plugin).toBeDefined()
    expect(plugin!.manifest.main).toBe('index.js')
  })

  it('ignores a package.json folder that does not declare the verql-plugin keyword', () => {
    // Any ordinary npm package sitting in the plugin directory (e.g. a stray
    // node_modules copy) must not be mistaken for a plugin.
    const dir = path.join(tmpDir, 'ordinary-pkg')
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'lodash', version: '1.0.0' }))

    const coordinator = makeCoordinator()
    coordinator.discover([tmpDir])

    expect(coordinator.getPlugin('lodash')).toBeUndefined()
  })

  it('records an error-state entry for invalid manifest JSON instead of silently skipping it', () => {
    const dir = path.join(tmpDir, 'broken-manifest')
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'plugin-manifest.json'), '{ this is not json')

    const coordinator = makeCoordinator()
    coordinator.discover([tmpDir])

    const plugin = coordinator.getPlugin('broken-manifest')
    expect(plugin).toBeDefined()
    expect(plugin!.status.state).toBe('error')
    if (plugin!.status.state === 'error') {
      expect(plugin!.status.phase).toBe('discover')
      expect(plugin!.status.error).toContain('Invalid manifest JSON')
    }
  })

  it('records an error-state entry for invalid package.json in the fallback path', () => {
    const dir = path.join(tmpDir, 'broken-pkg')
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'package.json'), '{ not json either')

    const coordinator = makeCoordinator()
    coordinator.discover([tmpDir])

    const plugin = coordinator.getPlugin('broken-pkg')
    expect(plugin).toBeDefined()
    expect(plugin!.status.state).toBe('error')
    if (plugin!.status.state === 'error') expect(plugin!.status.error).toContain('Invalid package.json')
  })

  it('skips a stray file sitting alongside real plugin folders', () => {
    fs.writeFileSync(path.join(tmpDir, 'README.txt'), 'not a plugin')
    writeManifest(path.join(tmpDir, 'real-plugin'), {
      name: 'real-plugin', version: '1.0.0', displayName: 'Real', description: 'd', main: 'index.js', contributes: {},
    })
    fs.writeFileSync(path.join(tmpDir, 'real-plugin', 'index.js'), 'exports.activate = () => {}')

    const coordinator = makeCoordinator()
    coordinator.discover([tmpDir])

    expect(coordinator.getPlugin('real-plugin')).toBeDefined()
    expect(coordinator.getLoadedPlugins()).toHaveLength(1)
  })

  it('does not throw when a configured plugin directory is actually a file (readdirSync fails)', () => {
    const notADir = path.join(tmpDir, 'not-a-dir')
    fs.writeFileSync(notADir, 'oops')

    const coordinator = makeCoordinator()
    expect(() => coordinator.discover([notADir])).not.toThrow()
    expect(coordinator.getLoadedPlugins()).toHaveLength(0)
  })

  it('refuses to let a discovered plugin overwrite a bundled plugin of the same name', () => {
    // Security-critical: a third-party folder named e.g. `verql-plugin-postgresql`
    // must never shadow the trusted built-in driver of the same name (it could
    // then intercept every postgres connection's credentials).
    const coordinator = makeCoordinator()
    const bundledModule = { activate: () => {} }
    coordinator.registerBundledPlugin(
      { name: 'shadow-target', version: '1.0.0', displayName: 'Bundled', description: 'd', main: 'index.js', contributes: {} },
      bundledModule,
    )
    writeManifest(path.join(tmpDir, 'evil-imitator'), {
      name: 'shadow-target', version: '9.9.9', displayName: 'Evil', description: 'd', main: 'index.js', contributes: {},
    })
    fs.writeFileSync(path.join(tmpDir, 'evil-imitator', 'index.js'), 'exports.activate = () => {}')

    coordinator.discover([tmpDir])

    const plugin = coordinator.getPlugin('shadow-target')!
    expect(plugin.path).toBe('<bundled>')
    expect(plugin.module).toBe(bundledModule)
  })
})

// ─── validateAll() ───────────────────────────────────────────────────────────

describe('validateAll() — failure paths', () => {
  it('errors when the declared main file does not exist on disk', () => {
    writeManifest(path.join(tmpDir, 'missing-main'), {
      name: 'missing-main', version: '1.0.0', displayName: 'x', description: 'd', main: 'index.js', contributes: {},
    })
    // Note: no index.js written.

    const coordinator = makeCoordinator()
    coordinator.discover([tmpDir])
    coordinator.validateAll()

    const plugin = coordinator.getPlugin('missing-main')!
    expect(plugin.status.state).toBe('error')
    if (plugin.status.state === 'error') {
      expect(plugin.status.phase).toBe('validate')
      expect(plugin.status.error).toContain('main file not found')
    }
  })

  it('errors when require()-ing the main file throws (e.g. a syntax error)', () => {
    writeManifest(path.join(tmpDir, 'syntax-error'), {
      name: 'syntax-error', version: '1.0.0', displayName: 'x', description: 'd', main: 'index.js', contributes: {},
    })
    fs.writeFileSync(path.join(tmpDir, 'syntax-error', 'index.js'), 'this is not { valid javascript (')

    // An empty `contributes` is (vacuously) isolatable, which would otherwise
    // route this plugin to the worker and skip require() entirely — disable
    // isolation so this test actually exercises the in-process require() path.
    const coordinator = makeCoordinator({ settingsStore: { get: (k: string) => k === 'plugins.isolation' ? false : undefined, set: () => {} } })
    coordinator.discover([tmpDir])
    coordinator.validateAll()

    const plugin = coordinator.getPlugin('syntax-error')!
    expect(plugin.status.state).toBe('error')
    if (plugin.status.state === 'error') {
      expect(plugin.status.phase).toBe('validate')
      expect(plugin.status.error).toContain('Failed to load module')
    }
  })

  it('errors when the module has no activate() export', () => {
    writeManifest(path.join(tmpDir, 'no-activate'), {
      name: 'no-activate', version: '1.0.0', displayName: 'x', description: 'd', main: 'index.js', contributes: {},
    })
    fs.writeFileSync(path.join(tmpDir, 'no-activate', 'index.js'), 'module.exports = { notActivate: () => {} }')

    const coordinator = makeCoordinator({ settingsStore: { get: (k: string) => k === 'plugins.isolation' ? false : undefined, set: () => {} } })
    coordinator.discover([tmpDir])
    coordinator.validateAll()

    const plugin = coordinator.getPlugin('no-activate')!
    expect(plugin.status.state).toBe('error')
    if (plugin.status.state === 'error') expect(plugin.status.error).toBe('Missing activate() export')
  })

  it('an isolated (command/theme-only) plugin is never require()d during validation, even if its main is broken', () => {
    // canIsolate() is true for a commands-only manifest, so validateAll must
    // defer to the worker instead of loading the (here: intentionally broken)
    // module into the main process.
    writeManifest(path.join(tmpDir, 'iso-plugin'), {
      name: 'iso-plugin', version: '1.0.0', displayName: 'x', description: 'd', main: 'index.js',
      contributes: { commands: [{ id: 'cmd', title: 'Cmd' }] },
    })
    fs.writeFileSync(path.join(tmpDir, 'iso-plugin', 'index.js'), 'this is not { valid javascript (')

    const coordinator = makeCoordinator()
    coordinator.discover([tmpDir])
    coordinator.validateAll()

    const plugin = coordinator.getPlugin('iso-plugin')!
    expect(plugin.status.state).toBe('validated')
    expect(plugin.runIsolated).toBe(true)
    expect(plugin.module).toBeUndefined()
  })
})

// ─── Full boot() from disk ───────────────────────────────────────────────────

describe('boot() — full discover → validate → resolve → activate flow', () => {
  it('activates a real on-disk plugin end to end', async () => {
    writeManifest(path.join(tmpDir, 'e2e-plugin'), {
      name: 'e2e-plugin', version: '1.0.0', displayName: 'E2E', description: 'd', main: 'index.js',
      contributes: { commands: [{ id: 'hello', title: 'Hello' }] },
    })
    fs.writeFileSync(
      path.join(tmpDir, 'e2e-plugin', 'index.js'),
      'exports.activate = (ctx) => { ctx.commands.register("hello", () => "hi") }',
    )

    // Disable isolation: this manifest is commands-only (isolatable), and we
    // want to exercise the plain in-process activation path, not spawn a
    // real utilityProcess worker.
    const coordinator = makeCoordinator({ settingsStore: { get: (k: string) => k === 'plugins.isolation' ? false : undefined, set: () => {} } })
    // Point the coordinator's private plugin dir resolution at our tmpDir by
    // discovering directly, then running the rest of boot()'s phases plus
    // activation — boot() itself always targets userData/plugins, so we
    // replicate its phase sequence against our fixture directory.
    coordinator.discover([tmpDir])
    coordinator.validateAll()
    coordinator.resolveAll()
    const plugin = coordinator.getPlugin('e2e-plugin')!
    expect(plugin.status.state).toBe('resolved')
    await coordinator.activatePlugin(plugin)

    expect(plugin.status.state).toBe('active')
    if (plugin.status.state === 'active') expect(plugin.status.contributions).toContain('command:hello')
  })

  it('boot() itself discovers straight from userData/plugins and reports a failed plugin without activating it', async () => {
    const pluginsDir = path.join(USER_DATA, 'plugins')
    writeManifest(path.join(pluginsDir, 'bad-manifest'), {
      // invalid: name fails NAME_PATTERN
      name: 'Bad Name!', version: '1.0.0', displayName: 'x', description: 'd', main: 'index.js', contributes: {},
    })

    const coordinator = makeCoordinator()
    const report = await coordinator.boot()

    const entry = report.plugins.find(p => p.status.state === 'error')
    expect(entry).toBeDefined()
    expect(report.failed).toBeGreaterThanOrEqual(1)
    expect(report.active).toBe(0)
  })
})

// ─── install / uninstall ─────────────────────────────────────────────────────

describe('installFromZip — zip-slip guard wired end to end', () => {
  it('refuses to install and writes nothing when an archive entry traverses outside the extraction root', () => {
    const { execFileSync } = require('child_process') as typeof import('child_process')
    // A file living one level above `stage/`, so an entry name of `../evil.js`
    // genuinely climbs outside wherever installFromZip extracts to.
    fs.writeFileSync(path.join(tmpDir, 'evil.js'), 'pwned')
    const stage = path.join(tmpDir, 'stage')
    const pluginDir = path.join(stage, 'evil-plugin')
    fs.mkdirSync(pluginDir, { recursive: true })
    fs.writeFileSync(path.join(pluginDir, 'plugin-manifest.json'), JSON.stringify({
      name: 'evil-plugin', version: '1.0.0', displayName: 'x', description: 'd', main: 'index.js', contributes: {},
    }))
    fs.writeFileSync(path.join(pluginDir, 'index.js'), 'exports.activate = () => {}')

    const zipPath = path.join(tmpDir, 'evil.zip')
    // Run from inside `stage/` so `../evil.js` resolves relative to it and is
    // stored in the archive with that literal traversal entry name.
    execFileSync('zip', ['-r', '-q', zipPath, 'evil-plugin', '../evil.js'], { cwd: stage })

    const coordinator = makeCoordinator()
    const result = coordinator.installFromZip(zipPath)

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/traversal/)
    expect(fs.existsSync(path.join(USER_DATA, 'plugins', 'evil-plugin'))).toBe(false)
  })
})

describe('uninstall()', () => {
  it('removes the plugin directory from disk and drops it from the registry', () => {
    const pluginsDir = path.join(USER_DATA, 'plugins')
    const src = path.join(tmpDir, 'to-remove')
    writeManifest(src, {
      name: 'to-remove', version: '1.0.0', displayName: 'x', description: 'd', main: 'index.js', contributes: {},
    })
    fs.writeFileSync(path.join(src, 'index.js'), 'exports.activate = () => {}')

    const coordinator = makeCoordinator()
    const installed = coordinator.installFromPath(src)
    expect(installed.success).toBe(true)
    expect(fs.existsSync(path.join(pluginsDir, 'to-remove'))).toBe(true)

    coordinator.uninstall('to-remove')

    expect(fs.existsSync(path.join(pluginsDir, 'to-remove'))).toBe(false)
    expect(coordinator.getPlugin('to-remove')).toBeUndefined()
  })

  it('tears the plugin down (calls its deactivate hook) before deleting it, not just removing bookkeeping', async () => {
    // If uninstall() ever skips deactivatePlugin(), an active plugin's
    // teardown (module.deactivate, isolated worker kill, context dispose)
    // never runs — only the on-disk folder and registry map entry vanish.
    // For an isolated plugin that leaks a live utilityProcess for the whole
    // app lifetime; for an in-process one it skips any cleanup the plugin
    // relies on (closing file handles, clearing intervals, etc).
    let deactivated = false
    const coordinator = makeCoordinator()
    coordinator.registerBundledPlugin(
      { name: 'to-remove-active', version: '1.0.0', displayName: 'x', description: 'd', main: 'index.js', contributes: {} },
      { activate: () => {}, deactivate: () => { deactivated = true } },
    )
    // registerBundledPlugin always marks path '<bundled>' (which uninstall()
    // refuses to remove); flip it to simulate an installed, active
    // third-party plugin so uninstall's real deletion path runs.
    const plugin = coordinator.getPlugin('to-remove-active')!
    plugin.path = path.join(USER_DATA, 'plugins', 'to-remove-active')
    fs.mkdirSync(plugin.path, { recursive: true })
    await coordinator.activatePlugin(plugin)
    expect(plugin.status.state).toBe('active')

    coordinator.uninstall('to-remove-active')

    expect(deactivated).toBe(true)
    expect(coordinator.getPlugin('to-remove-active')).toBeUndefined()
  })

  it('is a no-op for an unknown plugin name (does not throw)', () => {
    const coordinator = makeCoordinator()
    expect(() => coordinator.uninstall('never-existed')).not.toThrow()
  })
})

// ─── Permission grants at the coordinator level ──────────────────────────────

describe('getPermissionState() / setGrants()', () => {
  it('returns undefined for an unregistered plugin', () => {
    const coordinator = makeCoordinator()
    expect(coordinator.getPermissionState('ghost')).toBeUndefined()
  })

  it('a trusted (bundled) plugin is reported as granted everything it declared, immutably', () => {
    const coordinator = makeCoordinator()
    coordinator.registerBundledPlugin(
      { name: 'trusted-one', version: '1.0.0', displayName: 'x', description: 'd', main: 'index.js', contributes: {}, permissions: ['keyring'] },
      { activate: () => {} },
    )
    const state = coordinator.getPermissionState('trusted-one')!
    expect(state.trusted).toBe(true)
    expect(state.granted).toEqual(['keyring'])

    // setGrants on a trusted plugin can't reduce its access.
    const result = coordinator.setGrants('trusted-one', [])
    expect(result).toEqual(['keyring'])
  })

  it('an untrusted plugin with no grants store starts fully ungranted despite declaring permissions', () => {
    const coordinator = makeCoordinator()
    // registerBundledPlugin always sets path '<bundled>'; flip it to simulate
    // a discovered/installed (third-party) plugin so the untrusted branch runs.
    coordinator.registerBundledPlugin(
      { name: 'untrusted-one', version: '1.0.0', displayName: 'x', description: 'd', main: 'index.js', contributes: {}, permissions: ['keyring', 'network'] },
      { activate: () => {} },
    )
    coordinator.getPlugin('untrusted-one')!.path = '/fake/untrusted/path'

    const state = coordinator.getPermissionState('untrusted-one')!
    expect(state.trusted).toBe(false)
    expect(state.declared).toEqual(['keyring', 'network'])
    expect(state.granted).toEqual([])
  })

  it('setGrants intersects requested grants with what the manifest declared', () => {
    const grantsStore = new Map<string, PluginPermission[]>()
    const coordinator = makeCoordinator({
      pluginGrantsStore: {
        getGrants: (name: string) => grantsStore.get(name) ?? [],
        setGrants: (name: string, perms: PluginPermission[]) => { grantsStore.set(name, perms) },
      },
    })
    coordinator.registerBundledPlugin(
      { name: 'declares-keyring-only', version: '1.0.0', displayName: 'x', description: 'd', main: 'index.js', contributes: {}, permissions: ['keyring'] },
      { activate: () => {} },
    )
    // Force this bundled-registered plugin to be treated as untrusted by
    // rewriting its path — exercising the non-bundled branch of setGrants.
    const plugin = coordinator.getPlugin('declares-keyring-only')!
    plugin.path = '/fake/untrusted/path'

    // Ask for 'network' too, which was never declared.
    const effective = coordinator.setGrants('declares-keyring-only', ['keyring', 'network'])

    expect(effective).toEqual(['keyring'])
    expect(grantsStore.get('declares-keyring-only')).toEqual(['keyring'])
  })

  it('getPermissionState reflects grants already persisted in the store', () => {
    const grantsStore = new Map<string, PluginPermission[]>([['pre-granted', ['keyring']]])
    const coordinator = makeCoordinator({
      pluginGrantsStore: {
        getGrants: (name: string) => grantsStore.get(name) ?? [],
        setGrants: (name: string, perms: PluginPermission[]) => { grantsStore.set(name, perms) },
      },
    })
    coordinator.registerBundledPlugin(
      { name: 'pre-granted', version: '1.0.0', displayName: 'x', description: 'd', main: 'index.js', contributes: {}, permissions: ['keyring', 'network'] },
      { activate: () => {} },
    )
    const plugin = coordinator.getPlugin('pre-granted')!
    plugin.path = '/fake/untrusted/path'

    const state = coordinator.getPermissionState('pre-granted')!
    expect(state.trusted).toBe(false)
    expect(state.declared).toEqual(['keyring', 'network'])
    expect(state.granted).toEqual(['keyring'])
  })
})

// ─── activatePlugin() — disabled-flag persistence ────────────────────────────

describe('activatePlugin() — clears the persisted disabled flag on activation', () => {
  it('calls disabledPluginsStore.markEnabled so the plugin stays active across restarts', async () => {
    // boot() only re-activates a resolved plugin when disabledPluginsStore
    // says it isn't disabled. Activating a plugin here (a user explicitly
    // re-enabling it) must clear that persisted flag, or the next boot()
    // silently skips it again despite the in-memory state looking active.
    const markEnabled = vi.fn()
    const coordinator = makeCoordinator({
      disabledPluginsStore: { isDisabled: () => false, markDisabled: () => {}, markEnabled },
    })
    coordinator.registerBundledPlugin(
      { name: 'was-disabled', version: '1.0.0', displayName: 'x', description: 'd', main: 'index.js', contributes: {} },
      { activate: () => {} },
    )
    const plugin = coordinator.getPlugin('was-disabled')!

    await coordinator.activatePlugin(plugin)

    expect(markEnabled).toHaveBeenCalledWith('was-disabled')
  })
})

// ─── Error budget / safeCallWithBudget ───────────────────────────────────────

describe('safeCallWithBudget() — auto-deactivate on repeated failures', () => {
  it('rethrows the underlying error while under budget, leaving the plugin active', async () => {
    const coordinator = makeCoordinator()
    coordinator.registerBundledPlugin(
      { name: 'flaky', version: '1.0.0', displayName: 'x', description: 'd', main: 'index.js', contributes: {} },
      { activate: () => {} },
    )
    const plugin = coordinator.getPlugin('flaky')!
    await coordinator.activatePlugin(plugin)

    await expect(coordinator.safeCallWithBudget('flaky', () => { throw new Error('boom') }))
      .rejects.toThrow('boom')
    expect(plugin.status.state).toBe('active')
  })

  it('auto-deactivates the plugin once its error budget (5 errors) is exceeded', async () => {
    const coordinator = makeCoordinator()
    coordinator.registerBundledPlugin(
      { name: 'chronically-broken', version: '1.0.0', displayName: 'x', description: 'd', main: 'index.js', contributes: {} },
      { activate: () => {} },
    )
    const plugin = coordinator.getPlugin('chronically-broken')!
    await coordinator.activatePlugin(plugin)
    expect(plugin.status.state).toBe('active')

    for (let i = 0; i < 5; i++) {
      await expect(coordinator.safeCallWithBudget('chronically-broken', () => { throw new Error(`fail ${i}`) }))
        .rejects.toThrow()
    }

    expect(plugin.status.state).toBe('error')
    if (plugin.status.state === 'error') {
      expect(plugin.status.error).toContain('Disabled due to repeated errors')
      expect(plugin.status.phase).toBe('runtime')
    }
  })
})

// ─── shutdown() ───────────────────────────────────────────────────────────────

describe('shutdown()', () => {
  it('deactivates plugins in the reverse of their activation order', async () => {
    const order: string[] = []
    const coordinator = makeCoordinator()
    for (const name of ['first', 'second', 'third']) {
      coordinator.registerBundledPlugin(
        { name, version: '1.0.0', displayName: name, description: 'd', main: 'index.js', contributes: {} },
        { activate: () => {}, deactivate: () => { order.push(name) } },
      )
      await coordinator.activatePlugin(coordinator.getPlugin(name)!)
    }

    await coordinator.shutdown()

    expect(order).toEqual(['third', 'second', 'first'])
  })

  it('swallows a deactivation failure and still marks the plugin inactive instead of throwing', async () => {
    const coordinator = makeCoordinator()
    coordinator.registerBundledPlugin(
      { name: 'hangs-on-teardown', version: '1.0.0', displayName: 'x', description: 'd', main: 'index.js', contributes: {} },
      { activate: () => {}, deactivate: () => { throw new Error('teardown exploded') } },
    )
    const plugin = coordinator.getPlugin('hangs-on-teardown')!
    await coordinator.activatePlugin(plugin)

    await expect(coordinator.shutdown()).resolves.not.toThrow()
    expect(plugin.status.state).toBe('inactive')
  })
})

// ─── Coordinator-level isolated activation wiring ────────────────────────────

function isolatedManifest(name: string, cmdId: string) {
  return {
    name, version: '1.0.0', displayName: name, description: 'd', main: 'index.js',
    contributes: { commands: [{ id: cmdId, title: 'Cmd' }] },
  }
}

describe('activateIsolated() via the coordinator (memory-transport bridge)', () => {
  it('activates successfully, registers a proxy command, and forwards the granted permissions to the worker', async () => {
    const requestedGrants: string[][] = []
    const { host, worker } = createMemoryTransportPair()
    startWorker(worker, {
      requireModule: () => ({
        activate: (ctx: { commands: { register: (id: string, h: () => unknown) => unknown } }) => {
          ctx.commands.register('greet', () => 'hi')
        },
      }),
      installSandbox: (granted) => { requestedGrants.push(granted); return () => {} },
    })

    // Declaring a permission in the manifest is not enough on its own — the
    // user must have explicitly granted it (pluginGrantsStore), same as the
    // in-process path. Without this the sandbox would see no grants at all.
    const coordinator = makeCoordinator({
      spawnWorkerTransport: () => host,
      pluginGrantsStore: { getGrants: () => ['network'], setGrants: () => {} },
    })
    const plugin: LoadedPlugin = {
      manifest: { ...isolatedManifest('greeter', 'greet'), permissions: ['network'] },
      path: '/fake/greeter',
      mainPath: '/fake/greeter/index.js',
      runIsolated: true,
      status: { state: 'resolved' },
    }

    await coordinator.activatePlugin(plugin)

    expect(plugin.status.state).toBe('active')
    if (plugin.status.state === 'active') expect(plugin.status.contributions).toContain('command:greet')
    expect(plugin.isolatedHandle).toBeDefined()
    // The user-granted (not merely declared) permission must reach the worker sandbox.
    expect(requestedGrants[0]).toEqual(['network'])
  })

  it('a worker crash surfaces an error notification, flips the plugin to error state, and drops it from activation order', async () => {
    const { host, worker } = createMemoryTransportPair()
    startWorker(worker, {
      requireModule: () => ({
        activate: (ctx: { commands: { register: (id: string, h: () => unknown) => unknown } }) => {
          ctx.commands.register('doomed', () => {})
        },
      }),
      installSandbox: () => () => {},
    })

    const shown: Array<{ kind?: string; title: string }> = []
    const coordinator = makeCoordinator({
      spawnWorkerTransport: () => host,
      notificationBus: { show: (n: { kind?: string; title: string }) => { shown.push(n) } },
    })
    const plugin: LoadedPlugin = {
      manifest: isolatedManifest('crasher', 'doomed'),
      path: '/fake/crasher',
      mainPath: '/fake/crasher/index.js',
      runIsolated: true,
      status: { state: 'resolved' },
    }

    await coordinator.activatePlugin(plugin)
    expect(plugin.status.state).toBe('active')

    // Simulate the worker process dying: close the WORKER's transport end.
    // MemoryTransport.close() only notifies its peer (it doesn't fire its own
    // onClose), so closing `worker` is what propagates a close to the host's
    // endpoint — exactly like a utilityProcess exit notifying the host side.
    worker.close()
    // Let the queued close notification propagate (memory-transport uses
    // queueMicrotask).
    await Promise.resolve()
    await Promise.resolve()

    expect(plugin.status.state).toBe('error')
    if (plugin.status.state === 'error') expect(plugin.status.phase).toBe('runtime')
    expect(shown.some(n => n.kind === 'error' && n.title.includes('crasher'))).toBe(true)

    // activationOrder is private; reach it directly rather than through
    // shutdown() (which looks plugins up by name in the coordinator's own
    // map — this test's `plugin` is a hand-built object never registered
    // there, so a shutdown()-based probe can't observe activationOrder at
    // all). Left out, a leaked name here means a *future* activation of a
    // same-named plugin would appear twice in shutdown()'s teardown order.
    expect((coordinator as any).activationOrder).not.toContain('crasher')
  })
})
