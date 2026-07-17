import fs from 'fs'
import { errorMessage } from '@shared/errors'
import { ACTIVITY_KIND } from '@shared/activity'
import path from 'path'
import os from 'os'
import { execFileSync } from 'child_process'
import { app } from 'electron'
import { recordActivity } from '../activity/recorder'
import { resolveWithinPlugin } from './plugin-paths'
import type { PluginManifest, LoadedPlugin } from './types'
import { CONTRIBUTION_KIND } from './types'
import type { PluginStatus, BootReport, PluginContext } from './sdk/types'
import { PLUGIN_PHASE } from './sdk/types'
import { createPluginContext, disposePluginContext } from './sdk/index'
import { safeCall, ErrorBudget } from './sdk/safe-call'
import type { DriverRegistryImpl } from './sdk/driver-registry'
import type { CommandRegistryImpl } from './sdk/command-registry'
import type { PanelRegistryImpl } from './sdk/panel-registry'
import type { UIRegistryImpl } from './sdk/ui-registry'
import type { CompletionRegistryImpl } from './sdk/completion-registry'
import type { ToolRegistryImpl } from './sdk/tool-registry'
import { SchemaAccessImpl } from './sdk/schema-access'
import { ConnectionAccessImpl } from './sdk/connection-access'
import { validateTheme } from './sdk/theme-registry'
import { ALL_PERMISSIONS, effectiveGrants, isPluginPermission, type PluginPermission } from './sdk/permissions'
import { IsolatedPlugin, canIsolate } from './isolation/isolated-plugin'
import { spawnIsolatedWorker } from './isolation/worker-process'
import type { Transport } from './isolation/rpc'
import type { DbAdapter } from '../db/adapter'
import type { ConnectionProfile } from '@shared/types'

/** Bundled plugins the user cannot disable — without them core features break. */
const ESSENTIAL_BUNDLED = new Set(['verql-plugin-db-tools'])

/**
 * Reject archive entry names that would escape the extraction directory
 * (zip-slip): absolute paths, Windows drive letters, or any `..` traversal
 * segment. `unzip` strips these by default, but this explicit pre-extraction
 * check is defense-in-depth — it doesn't trust that behaviour across `unzip`
 * versions/platforms. Pure + exported for tests. Throws on the first bad entry.
 */
export function assertSafeArchivePaths(names: string[]): void {
  for (const name of names) {
    const trimmed = name.trim()
    if (!trimmed) continue
    if (path.isAbsolute(trimmed) || /^[a-zA-Z]:/.test(trimmed)) {
      throw new Error(`Archive contains an absolute path entry: ${trimmed}`)
    }
    if (trimmed.split(/[\\/]+/).includes('..')) {
      throw new Error(`Archive contains a path-traversal entry: ${trimmed}`)
    }
  }
}

// Manifest validation + the symlink walker live in ./manifest-validation (pure,
// separately tested). Re-export validateManifest/ValidationResult so existing
// importers (and tests) keep resolving them from the plugin-host barrel.
export { validateManifest } from './manifest-validation'
export type { ValidationResult } from './manifest-validation'
import { validateManifest, findSymlink, NAME_PATTERN } from './manifest-validation'

// ─── Boot Coordinator ─────────────────────────────────────────────────────────

interface BootDeps {
  driverRegistry: DriverRegistryImpl
  commandRegistry: CommandRegistryImpl
  panelRegistry: PanelRegistryImpl
  uiRegistry: UIRegistryImpl
  completionRegistry: CompletionRegistryImpl
  getAdapter: (connectionId: string) => DbAdapter | undefined
  getProfile: (connectionId: string) => ConnectionProfile | undefined
  /** The single, host-wide connection-access instance whose
   *  `setActiveConnectionId` is driven by `db:connect`/`db:disconnect`. It is
   *  shared by every plugin context so `ctx.connections.getActiveConnectionId()`
   *  actually reflects the active connection. When omitted (tests), the
   *  coordinator builds one internally so all plugins still share a single
   *  instance — it just never receives active-connection updates. */
  connectionAccess?: ConnectionAccessImpl
  keyring: import('./sdk/types').KeyringAccess
  settingsStore: { get(key: string): unknown; set(key: string, value: unknown): void }
  services: import('./sdk/service-registry').ServiceRegistry
  exporterRegistry: import('./sdk/exporter-registry').ExporterRegistry
  importerRegistry: import('./sdk/importer-registry').ImporterRegistry
  formatterRegistry: import('./sdk/formatter-registry').FormatterRegistry
  typeMapperRegistry: import('./sdk/type-mapper-registry').TypeMapperRegistry
  themeRegistry: import('./sdk/theme-registry').ThemeRegistry
  notificationBus: { show(n: { kind?: 'info' | 'success' | 'warning' | 'error'; title: string; message?: string; durationMs?: number }): void }
  dragDropRegistry: import('./sdk/drag-drop-registry').DragDropRegistry
  toolRegistry: ToolRegistryImpl
  /** Persistence for the user's enable/disable choice. Without this, the
   *  coordinator can flip status in memory but `boot()` re-activates every
   *  resolved plugin on next launch. */
  disabledPluginsStore?: {
    isDisabled(name: string): boolean
    markDisabled(name: string): void
    markEnabled(name: string): void
  }
  /** Persistence for the per-plugin capability grants the user has approved.
   *  Without it, third-party plugins fall back to no grants (deny by default)
   *  and any enforced capability they use throws. */
  pluginGrantsStore?: {
    getGrants(name: string): PluginPermission[]
    setGrants(name: string, permissions: PluginPermission[]): void
  }
  /** Spawn the duplex channel to a fresh plugin-worker process. Injectable so
   *  tests can drive the isolation bridge over an in-memory transport instead
   *  of forking a real Electron utilityProcess. Defaults to `spawnIsolatedWorker`. */
  spawnWorkerTransport?: () => Transport
}

export class PluginBootCoordinator {
  private plugins = new Map<string, LoadedPlugin>()
  private activationOrder: string[] = []
  private errorBudget = new ErrorBudget()
  private deps: BootDeps
  /** Shared across all plugin contexts (see BootDeps.connectionAccess). */
  private connectionAccess: ConnectionAccessImpl

  constructor(deps: BootDeps) {
    this.deps = deps
    this.connectionAccess =
      deps.connectionAccess ?? new ConnectionAccessImpl(deps.getAdapter, deps.getProfile)
  }

  // ── Phase 1: Discover ──────────────────────────────────────────────────────

  discover(dirs: string[]): void {
    // Preserve bundled plugins (path === '<bundled>'), clear discovered ones
    const bundled = new Map<string, LoadedPlugin>()
    for (const [name, plugin] of this.plugins) {
      if (plugin.path === '<bundled>') bundled.set(name, plugin)
    }
    this.plugins.clear()
    for (const [name, plugin] of bundled) {
      this.plugins.set(name, plugin)
    }

    for (const dir of dirs) {
      if (!fs.existsSync(dir)) continue

      let entries: string[]
      try {
        entries = fs.readdirSync(dir)
      } catch {
        continue
      }

      for (const entry of entries) {
        const pluginPath = path.join(dir, entry)
        try {
          const stat = fs.statSync(pluginPath)
          if (!stat.isDirectory()) continue
        } catch {
          continue
        }

        const manifest = this.parseManifest(pluginPath, entry)
        if (manifest) {
          // Bundled plugins (built-in drivers, themes, etc.) are trusted code
          // shipped with the app. A third-party plugin folder claiming the
          // same `name` MUST NOT be allowed to overwrite it — otherwise a
          // user-installed plugin called `verql-plugin-postgresql` could
          // shadow the built-in postgres driver and intercept credentials
          // for every postgres connection.
          const existing = this.plugins.get(manifest.name)
          if (existing && existing.path === '<bundled>') {
            console.warn(
              `[plugins] refusing to load ${manifest.name} from ${pluginPath}: ` +
                `name collides with a bundled plugin`,
            )
            continue
          }
          this.plugins.set(manifest.name, {
            manifest,
            path: pluginPath,
            status: { state: 'discovered' }
          })
        }
      }
    }
  }

  private parseManifest(pluginPath: string, fallbackName: string): PluginManifest | null {
    const manifestPath = path.join(pluginPath, 'plugin-manifest.json')
    const pkgPath = path.join(pluginPath, 'package.json')

    if (fs.existsSync(manifestPath)) {
      try {
        return JSON.parse(fs.readFileSync(manifestPath, 'utf-8'))
      } catch (err) {
        this.plugins.set(fallbackName, {
          manifest: { name: fallbackName, version: '0.0.0', displayName: fallbackName, description: '', main: '', contributes: {} },
          path: pluginPath,
          status: { state: 'error', error: `Invalid manifest JSON: ${errorMessage(err)}`, phase: PLUGIN_PHASE.DISCOVER }
        })
        return null
      }
    }

    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'))
        if (!pkg.keywords?.includes('verql-plugin')) return null
        return {
          name: pkg.name,
          version: pkg.version ?? '0.0.0',
          displayName: pkg.displayName ?? pkg.name,
          description: pkg.description ?? '',
          main: pkg.main ?? 'index.js',
          contributes: pkg.contributes ?? {}
        }
      } catch (err) {
        this.plugins.set(fallbackName, {
          manifest: { name: fallbackName, version: '0.0.0', displayName: fallbackName, description: '', main: '', contributes: {} },
          path: pluginPath,
          status: { state: 'error', error: `Invalid package.json: ${errorMessage(err)}`, phase: PLUGIN_PHASE.DISCOVER }
        })
        return null
      }
    }

    return null
  }

  // ── Phase 2: Validate ──────────────────────────────────────────────────────

  validateAll(): void {
    for (const [, plugin] of this.plugins) {
      if (plugin.status.state !== 'discovered') continue

      const result = validateManifest(plugin.manifest)
      if (!result.valid) {
        plugin.status = { state: 'error', error: result.error!, phase: PLUGIN_PHASE.VALIDATE }
        continue
      }

      // Path-traversal guard: a hostile manifest can specify `main` as
      // `../../../etc/anything.js` or as an absolute path. `require()` would
      // happily load whichever file the joined path resolves to, so pin it to
      // the plugin's own directory. Shared with the icon read in
      // `ipc/plugins.ts` — this check used to live only here, which is exactly
      // why `manifest.icon` shipped without it.
      const mainPath = resolveWithinPlugin(plugin.path, plugin.manifest.main)
      if (!mainPath) {
        plugin.status = {
          state: 'error',
          error: `Invalid main: '${plugin.manifest.main}' resolves outside the plugin directory`,
          phase: PLUGIN_PHASE.VALIDATE,
        }
        continue
      }
      if (!fs.existsSync(mainPath)) {
        plugin.status = { state: 'error', error: `main file not found: ${plugin.manifest.main}`, phase: PLUGIN_PHASE.VALIDATE }
        continue
      }

      plugin.mainPath = mainPath

      // Process isolation: a plugin that will run in a separate process must
      // NOT be require()'d here — loading its code into the main process is
      // exactly what isolation avoids. We defer the activate()-export check to
      // the worker. In-process plugins are require()'d as before.
      if (this.shouldIsolate(plugin)) {
        plugin.runIsolated = true
        plugin.status = { state: 'validated' }
        continue
      }

      try {
        const mod = require(mainPath)
        if (typeof mod.activate !== 'function') {
          plugin.status = { state: 'error', error: 'Missing activate() export', phase: PLUGIN_PHASE.VALIDATE }
          continue
        }
        plugin.module = mod
      } catch (err) {
        plugin.status = { state: 'error', error: `Failed to load module: ${errorMessage(err)}`, phase: PLUGIN_PHASE.VALIDATE }
        continue
      }

      plugin.status = { state: 'validated' }
    }
  }

  // ── Phase 3: Resolve (no-op for now) ───────────────────────────────────────

  resolveAll(): void {
    for (const plugin of this.plugins.values()) {
      if (plugin.status.state === 'validated') {
        plugin.status = { state: 'resolved' }
      }
    }
  }

  // ── Phase 4: Activate ──────────────────────────────────────────────────────

  /** Should this plugin run in a separate process? Untrusted plugins whose
   *  contributions are marshalling-compatible, when isolation is enabled. */
  private shouldIsolate(plugin: LoadedPlugin): boolean {
    if (plugin.path === '<bundled>') return false
    if (this.deps.settingsStore.get('plugins.isolation') === false) return false
    return canIsolate(plugin.manifest)
  }

  /** Effective capability grants for a plugin: trusted (bundled) plugins get
   *  everything; third-party plugins get granted ∩ declared. */
  private grantsFor(plugin: LoadedPlugin): PluginPermission[] {
    if (plugin.path === '<bundled>') return [...ALL_PERMISSIONS]
    return [...effectiveGrants(
      plugin.manifest.permissions,
      this.deps.pluginGrantsStore?.getGrants(plugin.manifest.name),
    )]
  }

  /** Build the guarded PluginContext for a plugin. Trusted (bundled) plugins
   *  get every capability; third-party plugins get the granted ∩ declared set. */
  private buildPluginContext(plugin: LoadedPlugin): PluginContext {
    const trusted = plugin.path === '<bundled>'
    const grantedPermissions = this.grantsFor(plugin)
    return createPluginContext({
      pluginName: plugin.manifest.name,
      trusted,
      grantedPermissions,
      driverRegistry: this.deps.driverRegistry,
      commandRegistry: this.deps.commandRegistry,
      panelRegistry: this.deps.panelRegistry,
      uiRegistry: this.deps.uiRegistry,
      completionRegistry: this.deps.completionRegistry,
      schemaAccess: new SchemaAccessImpl(this.deps.getAdapter),
      connectionAccess: this.connectionAccess,
      settingsStore: this.deps.settingsStore,
      keyring: this.deps.keyring,
      services: this.deps.services,
      exporterRegistry: this.deps.exporterRegistry,
      importerRegistry: this.deps.importerRegistry,
      formatterRegistry: this.deps.formatterRegistry,
      typeMapperRegistry: this.deps.typeMapperRegistry,
      themeRegistry: this.deps.themeRegistry,
      notificationBus: this.deps.notificationBus,
      dragDropRegistry: this.deps.dragDropRegistry,
      toolRegistry: this.deps.toolRegistry
    })
  }

  async activatePlugin(plugin: LoadedPlugin): Promise<LoadedPlugin> {
    if (!plugin.runIsolated && !plugin.module) {
      plugin.status = { state: 'error', error: 'No module loaded', phase: PLUGIN_PHASE.ACTIVATE }
      return plugin
    }

    plugin.status = { state: 'activating' }

    // User explicitly enabled this plugin — clear any persisted disabled flag
    // so it stays active across restarts.
    this.deps.disabledPluginsStore?.markEnabled(plugin.manifest.name)

    if (plugin.runIsolated) {
      return this.activateIsolated(plugin)
    }

    // Set the current plugin name so registries can track ownership
    this.deps.uiRegistry.currentPluginName = plugin.manifest.name
    this.deps.completionRegistry.currentPluginName = plugin.manifest.name

    const context = this.buildPluginContext(plugin)
    plugin.context = context

    try {
      await safeCall(plugin.manifest.name, () => plugin.module!.activate(context), { timeoutMs: 10_000 })
    } catch (err) {
      disposePluginContext(context)
      plugin.context = undefined
      plugin.status = {
        state: 'error',
        error: errorMessage(err),
        phase: PLUGIN_PHASE.ACTIVATE
      }
      return plugin
    }

    const verification = this.verifyContributions(plugin)
    plugin.status = verification
    if (verification.state === 'active' || verification.state === 'degraded') {
      this.activationOrder.push(plugin.manifest.name)
    }

    return plugin
  }

  /** Activate an untrusted plugin in a separate process. Its code never runs in
   *  the main process; contributions become host-side proxies and every
   *  capability call is dispatched through the gated context (so permission
   *  enforcement is identical to the in-process path). */
  private async activateIsolated(plugin: LoadedPlugin): Promise<LoadedPlugin> {
    const context = this.buildPluginContext(plugin)
    plugin.context = context

    const transport = (this.deps.spawnWorkerTransport ?? spawnIsolatedWorker)()
    const isolated = new IsolatedPlugin(transport, {
      pluginName: plugin.manifest.name,
      mainPath: plugin.mainPath!,
      grantedPermissions: this.grantsFor(plugin),
      context,
      commandRegistry: this.deps.commandRegistry,
      themeRegistry: this.deps.themeRegistry,
      onCrash: (error) => {
        plugin.status = { state: 'error', error: error.message, phase: PLUGIN_PHASE.RUNTIME }
        plugin.isolatedHandle = undefined
        this.activationOrder = this.activationOrder.filter(n => n !== plugin.manifest.name)
        this.deps.notificationBus.show({
          kind: 'error',
          title: `Plugin "${plugin.manifest.displayName}" stopped`,
          message: error.message,
          durationMs: 8000,
        })
      },
    })

    try {
      await isolated.activate()
    } catch (err) {
      try { await isolated.deactivate() } catch { /* ignore */ }
      disposePluginContext(context)
      plugin.context = undefined
      plugin.status = {
        state: 'error',
        error: errorMessage(err),
        phase: PLUGIN_PHASE.ACTIVATE,
      }
      return plugin
    }

    plugin.isolatedHandle = isolated
    const verification = this.verifyContributions(plugin)
    plugin.status = verification
    if (verification.state === 'active' || verification.state === 'degraded') {
      this.activationOrder.push(plugin.manifest.name)
    } else {
      // Activation produced no usable contributions. `shutdown()` only iterates
      // `activationOrder`, so without an explicit teardown here the forked
      // worker process (and its live RPC bridge) would leak for the whole app
      // lifetime — a hostile plugin could fail verification on purpose to keep
      // a child process around. Mirror the catch block's cleanup.
      try { await isolated.deactivate() } catch { /* best-effort */ }
      disposePluginContext(context)
      plugin.context = undefined
      plugin.isolatedHandle = undefined
    }
    return plugin
  }

  // ── Phase 5: Verify ────────────────────────────────────────────────────────

  private verifyContributions(plugin: LoadedPlugin): PluginStatus {
    const declared: string[] = []
    const registered: string[] = []
    const missing: string[] = []
    const c = plugin.manifest.contributes

    if (c.drivers) {
      for (const d of c.drivers) {
        declared.push(`${CONTRIBUTION_KIND.DRIVER}:${d.id}`)
        if (this.deps.driverRegistry.has(d.id)) {
          registered.push(`${CONTRIBUTION_KIND.DRIVER}:${d.id}`)
        } else {
          missing.push(`${CONTRIBUTION_KIND.DRIVER}:${d.id}`)
        }
      }
    }

    if (c.commands) {
      for (const cmd of c.commands) {
        const namespacedId = `${plugin.manifest.name}:${cmd.id}`
        declared.push(`${CONTRIBUTION_KIND.COMMAND}:${cmd.id}`)
        if (this.deps.commandRegistry.has(namespacedId)) {
          registered.push(`${CONTRIBUTION_KIND.COMMAND}:${cmd.id}`)
        } else {
          missing.push(`${CONTRIBUTION_KIND.COMMAND}:${cmd.id}`)
        }
      }
    }

    if (c.panels) {
      const uiPanelIds = new Set(this.deps.uiRegistry.getAllPanels().map((p) => p.id))
      for (const p of c.panels) {
        declared.push(`${CONTRIBUTION_KIND.PANEL}:${p.id}`)
        // Panels can register via either the new UIRegistry (ctx.ui.registerPanel)
        // or the legacy PanelRegistry (ctx.panels.register); accept both.
        if (uiPanelIds.has(p.id) || this.deps.panelRegistry.has(p.id)) {
          registered.push(`${CONTRIBUTION_KIND.PANEL}:${p.id}`)
        } else {
          missing.push(`${CONTRIBUTION_KIND.PANEL}:${p.id}`)
        }
      }
    }

    if (c.connectionMiddleware) {
      for (const mw of c.connectionMiddleware) {
        declared.push(`${CONTRIBUTION_KIND.MIDDLEWARE}:${mw.id}`)
        if (this.deps.driverRegistry.hasMiddleware(mw.id)) {
          registered.push(`${CONTRIBUTION_KIND.MIDDLEWARE}:${mw.id}`)
        } else {
          missing.push(`${CONTRIBUTION_KIND.MIDDLEWARE}:${mw.id}`)
        }
      }
    }

    if (c.exporters) {
      for (const ex of c.exporters) {
        // ctx.exporters.register namespaces ids as `${pluginName}:${id}` so
        // multiple plugins can each contribute an exporter with the same
        // short id (e.g. several drivers register their own "sql" exporter).
        const namespacedId = `${plugin.manifest.name}:${ex.id}`
        declared.push(`${CONTRIBUTION_KIND.EXPORTER}:${ex.id}`)
        if (this.deps.exporterRegistry.get(namespacedId)) {
          registered.push(`${CONTRIBUTION_KIND.EXPORTER}:${ex.id}`)
        } else {
          missing.push(`${CONTRIBUTION_KIND.EXPORTER}:${ex.id}`)
        }
      }
    }

    if (c.importers) {
      for (const im of c.importers) {
        const namespacedId = `${plugin.manifest.name}:${im.id}`
        declared.push(`${CONTRIBUTION_KIND.IMPORTER}:${im.id}`)
        if (this.deps.importerRegistry.get(namespacedId)) {
          registered.push(`${CONTRIBUTION_KIND.IMPORTER}:${im.id}`)
        } else {
          missing.push(`${CONTRIBUTION_KIND.IMPORTER}:${im.id}`)
        }
      }
    }

    if (c.formatters) {
      for (const fmt of c.formatters) {
        const namespacedId = `${plugin.manifest.name}:${fmt.id}`
        declared.push(`${CONTRIBUTION_KIND.FORMATTER}:${fmt.id}`)
        if (this.deps.formatterRegistry.get(namespacedId)) {
          registered.push(`${CONTRIBUTION_KIND.FORMATTER}:${fmt.id}`)
        } else {
          missing.push(`${CONTRIBUTION_KIND.FORMATTER}:${fmt.id}`)
        }
      }
    }

    if (c.themes) {
      for (const t of c.themes) {
        declared.push(`${CONTRIBUTION_KIND.THEME}:${t.id}`)
        const entry = this.deps.themeRegistry.get(t.id)
        if (!entry) {
          missing.push(`${CONTRIBUTION_KIND.THEME}:${t.id}`)
          continue
        }
        // The registry has already run validateTheme() at register time
        // (so the picker has an authoritative report). The boot phase
        // additionally surfaces required-token gaps as a toast and
        // demotes the theme to a missing contribution.
        const report = entry.validation ?? validateTheme(entry)

        if (report.missingRequired.length > 0) {
          this.deps.notificationBus.show({
            kind: 'error',
            title: `Theme "${entry.name}" is missing required tokens`,
            message: `${plugin.manifest.name}: ${report.missingRequired.join(', ')}`,
            durationMs: 8000,
          })
          missing.push(`${CONTRIBUTION_KIND.THEME}:${t.id}`)
          continue
        }

        if (report.missingRecommended.length > 0) {
          this.deps.notificationBus.show({
            kind: 'warning',
            title: `Theme "${entry.name}" is missing recommended tokens`,
            message: `${plugin.manifest.name}: ${report.missingRecommended.join(', ')}`,
            durationMs: 6000,
          })
        }

        registered.push(`${CONTRIBUTION_KIND.THEME}:${t.id}`)
      }
    }

    if (declared.length === 0) {
      return { state: 'active', contributions: [] }
    }

    if (missing.length === 0) {
      return { state: 'active', contributions: registered }
    }

    if (registered.length === 0) {
      return { state: 'error', error: `Plugin activated but registered no contributions. Expected: ${declared.join(', ')}`, phase: PLUGIN_PHASE.VERIFY }
    }

    return { state: 'degraded', error: `Missing contributions: ${missing.join(', ')}`, contributions: registered }
  }

  // ── Full Boot ──────────────────────────────────────────────────────────────

  async boot(): Promise<BootReport> {
    const pluginDir = this.getPluginDir()
    this.discover([pluginDir])
    this.validateAll()
    this.resolveAll()

    const report: BootReport = { total: 0, active: 0, degraded: 0, failed: 0, plugins: [] }

    for (const plugin of this.plugins.values()) {
      report.total++
      if (plugin.status.state !== 'resolved') {
        report.failed++
        report.plugins.push({ name: plugin.manifest.name, status: plugin.status, durationMs: 0 })
        continue
      }

      if (!ESSENTIAL_BUNDLED.has(plugin.manifest.name) && this.deps.disabledPluginsStore?.isDisabled(plugin.manifest.name)) {
        plugin.status = { state: 'inactive' }
        report.plugins.push({ name: plugin.manifest.name, status: plugin.status, durationMs: 0 })
        continue
      }

      const start = performance.now()
      await this.activatePlugin(plugin)
      const durationMs = Math.round(performance.now() - start)

      const state = plugin.status.state as string
      if (state === 'active') report.active++
      else if (state === 'degraded') report.degraded++
      else report.failed++

      report.plugins.push({ name: plugin.manifest.name, status: plugin.status, durationMs })
    }

    this.logBootReport(report)
    return report
  }

  // ── Deactivate ─────────────────────────────────────────────────────────────

  async deactivatePlugin(plugin: LoadedPlugin, opts: { persist?: boolean } = {}): Promise<void> {
    if (opts.persist && ESSENTIAL_BUNDLED.has(plugin.manifest.name)) return
    if (plugin.isolatedHandle) {
      // Isolated plugin: tell the worker to deactivate, then kill the process.
      try {
        await plugin.isolatedHandle.deactivate()
      } catch {
        // Ignore deactivation errors
      }
      plugin.isolatedHandle = undefined
    } else if (plugin.module?.deactivate) {
      try {
        await plugin.module.deactivate()
      } catch {
        // Ignore deactivation errors
      }
    }
    if (plugin.context) {
      disposePluginContext(plugin.context)
      plugin.context = undefined
    }
    plugin.status = { state: 'inactive' }
    this.activationOrder = this.activationOrder.filter(n => n !== plugin.manifest.name)
    // Only persist disabled-state for user-initiated deactivations. Shutdown
    // and auto-tear-down also funnel through here, and those must not mark
    // every active plugin disabled.
    if (opts.persist) {
      this.deps.disabledPluginsStore?.markDisabled(plugin.manifest.name)
    }
  }

  async shutdown(): Promise<void> {
    const reversed = [...this.activationOrder].reverse()
    for (const name of reversed) {
      const plugin = this.plugins.get(name)
      if (plugin) {
        try {
          await safeCall(name, async () => this.deactivatePlugin(plugin), { timeoutMs: 5_000 })
        } catch {
          if (plugin.context) {
            disposePluginContext(plugin.context)
            plugin.context = undefined
          }
          plugin.status = { state: 'inactive' }
        }
      }
    }
    this.activationOrder = []
  }

  // ── Public Accessors ───────────────────────────────────────────────────────

  getLoadedPlugins(): LoadedPlugin[] {
    return Array.from(this.plugins.values())
  }

  getPlugin(name: string): LoadedPlugin | undefined {
    return this.plugins.get(name)
  }

  getErrorBudget(): ErrorBudget {
    return this.errorBudget
  }

  /**
   * Capability state for a plugin, for the consent UI. `trusted` plugins
   * (bundled) are implicitly granted everything and the user cannot change it.
   */
  getPermissionState(name: string): {
    trusted: boolean
    declared: PluginPermission[]
    granted: PluginPermission[]
  } | undefined {
    const plugin = this.plugins.get(name)
    if (!plugin) return undefined
    const trusted = plugin.path === '<bundled>'
    const declared = plugin.manifest.permissions ?? []
    const granted = trusted
      ? [...declared]
      : [...effectiveGrants(declared, this.deps.pluginGrantsStore?.getGrants(name))]
    return { trusted, declared, granted }
  }

  /**
   * Persist the user's capability grants for a third-party plugin. Grants are
   * intersected with what the manifest declared, so a plugin can never be
   * granted something it didn't ask for. Returns the effective granted set.
   * Trusted plugins are immutable (returns their full declared set).
   */
  setGrants(name: string, permissions: PluginPermission[]): PluginPermission[] {
    const plugin = this.plugins.get(name)
    if (!plugin) return []
    if (plugin.path === '<bundled>') return plugin.manifest.permissions ?? []
    const effective = [...effectiveGrants(plugin.manifest.permissions, permissions)]
    this.deps.pluginGrantsStore?.setGrants(name, effective)
    return effective
  }

  /** Wrap a plugin call with error budget tracking. Auto-deactivates on budget exceeded. */
  async safeCallWithBudget<T>(pluginName: string, fn: () => T | Promise<T>, options?: { timeoutMs?: number }): Promise<T> {
    try {
      return await safeCall(pluginName, fn, options)
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err))
      const exceeded = this.errorBudget.record(pluginName, error)
      if (exceeded) {
        const plugin = this.plugins.get(pluginName)
        if (plugin && plugin.status.state !== 'error' && plugin.status.state !== 'inactive') {
          await this.deactivatePlugin(plugin)
          plugin.status = { state: 'error', error: `Disabled due to repeated errors (${this.errorBudget.getErrors(pluginName).length} in window)`, phase: PLUGIN_PHASE.RUNTIME }
          console.warn(`[plugins] ${pluginName} auto-deactivated due to repeated errors`)
        }
      }
      throw err
    }
  }

  // ── Bundled Plugin Registration ────────────────────────────────────────────

  registerBundledPlugin(
    manifest: PluginManifest,
    module: { activate: (ctx: any) => void | Promise<void>; deactivate?: () => void | Promise<void> }
  ): void {
    // Even trusted/bundled plugins are run through manifest validation so a
    // typo in the manifest (missing name, malformed semver, etc.) is caught
    // at registration time rather than silently activating a broken plugin.
    const validation = validateManifest(manifest)
    if (!validation.valid) {
      throw new Error(`Invalid bundled plugin manifest '${manifest.name}': ${validation.error}`)
    }
    if (this.plugins.has(manifest.name)) {
      throw new Error(`Plugin '${manifest.name}' is already registered`)
    }
    this.plugins.set(manifest.name, {
      manifest,
      path: '<bundled>',
      status: { state: 'validated' },
      module
    })
  }

  // ── Install / Uninstall ────────────────────────────────────────────────────

  installFromPath(sourcePath: string): { success: boolean; name?: string; error?: string } {
    try {
      const manifestPath = path.join(sourcePath, 'plugin-manifest.json')
      const pkgPath = path.join(sourcePath, 'package.json')

      let manifest: PluginManifest
      if (fs.existsSync(manifestPath)) {
        try {
          manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) as PluginManifest
        } catch (err) {
          return { success: false, error: `Invalid manifest JSON: ${errorMessage(err)}` }
        }
      } else if (fs.existsSync(pkgPath)) {
        let pkg: Record<string, unknown>
        try {
          pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'))
        } catch (err) {
          return { success: false, error: `Invalid package.json: ${errorMessage(err)}` }
        }
        manifest = {
          name: pkg.name as string,
          version: (pkg.version as string) ?? '0.0.0',
          displayName: (pkg.displayName as string) ?? (pkg.name as string),
          description: (pkg.description as string) ?? '',
          main: (pkg.main as string) ?? 'index.js',
          contributes: (pkg.contributes as PluginManifest['contributes']) ?? {},
        }
      } else {
        return { success: false, error: 'No plugin-manifest.json or package.json found' }
      }

      const name = manifest?.name
      if (typeof name !== 'string' || !NAME_PATTERN.test(name)) {
        // Defend the destination join below: `name` becomes a path segment
        // under the plugin dir. A name like '../evil' or with separators must
        // never escape it.
        return { success: false, error: `Invalid plugin name: "${name}"` }
      }

      // Fully validate the manifest BEFORE copying anything into the trusted
      // plugin directory. Otherwise a package with a bad version, an
      // unknown/garbage `permissions` entry, a non-.js `main`, or a missing
      // required field gets written to disk and only rejected later at
      // validateAll() — leaving junk in the trusted folder and reporting a
      // misleading "installed" result for a plugin that will never load.
      const validation = validateManifest(manifest)
      if (!validation.valid) {
        return { success: false, error: validation.error }
      }

      // Same protection as discover(): refuse to install a plugin whose name
      // collides with a bundled plugin. The user is asking to drop a folder
      // onto disk, but we won't let it shadow the built-in driver of the
      // same name even if discover() later runs.
      const collidingBundled = this.plugins.get(name)
      if (collidingBundled && collidingBundled.path === '<bundled>') {
        return { success: false, error: `Cannot install: '${name}' is a bundled plugin name` }
      }

      // Reject symlinks anywhere in the source tree. fs.cpSync would otherwise
      // copy a symlink that points at, e.g., the user's keychain dir or /etc
      // into the trusted plugin folder, and a later read would follow it out
      // of the sandbox. Plugins are plain files; a symlink is never legitimate.
      const offending = findSymlink(sourcePath)
      if (offending) {
        return { success: false, error: `Refusing to install: contains a symlink (${offending})` }
      }

      const destDir = path.join(this.getPluginDir(), name)
      if (fs.existsSync(destDir)) {
        fs.rmSync(destDir, { recursive: true })
      }
      fs.cpSync(sourcePath, destDir, { recursive: true })

      // Parse and add only the new plugin (don't clear existing state)
      const installedManifest = this.parseManifest(destDir, name)
      if (installedManifest) {
        this.plugins.set(installedManifest.name, {
          manifest: installedManifest,
          path: destDir,
          status: { state: 'discovered' }
        })
      }
      return { success: true, name }
    } catch (err) {
      return { success: false, error: errorMessage(err) }
    }
  }

  installFromZip(zipPath: string): { success: boolean; name?: string; error?: string } {
    // mkdtempSync atomically creates a unique, owner-only (0700) directory.
    // A predictable name like `verql-plugin-${Date.now()}` + recursive
    // mkdir lets a local attacker pre-create the dir (or plant a symlink
    // inside it) on a shared machine before `unzip -o` overwrites into it.
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'verql-plugin-'))
    try {
      // Defense-in-depth zip-slip guard: read the entry names (without
      // extracting) and reject traversal/absolute paths before `unzip` writes
      // anything to disk.
      const listing = execFileSync('unzip', ['-Z1', zipPath], {
        encoding: 'utf-8',
        maxBuffer: 16 * 1024 * 1024,
      })
      assertSafeArchivePaths(listing.split('\n'))
      execFileSync('unzip', ['-o', '-q', zipPath, '-d', tmpDir])
      // The zip may contain a single top-level directory or files at root.
      // Check if there's exactly one subdirectory — if so, install from that.
      const entries = fs.readdirSync(tmpDir).filter(e => fs.statSync(path.join(tmpDir, e)).isDirectory())
      const installDir = entries.length === 1 ? path.join(tmpDir, entries[0]) : tmpDir
      return this.installFromPath(installDir)
    } catch (err) {
      return { success: false, error: errorMessage(err) }
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    }
  }

  uninstall(name: string): void {
    const plugin = this.plugins.get(name)
    if (!plugin) return
    if (plugin.path === '<bundled>') {
      throw new Error(`Cannot uninstall bundled plugin '${name}'`)
    }
    this.deactivatePlugin(plugin)
    fs.rmSync(plugin.path, { recursive: true, force: true })
    this.plugins.delete(name)
  }

  // ── Internal ───────────────────────────────────────────────────────────────

  private getPluginDir(): string {
    const dir = path.join(app.getPath('userData'), 'plugins')
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    return dir
  }

  private logBootReport(report: BootReport): void {
    console.log(`[plugins] Discovered ${report.total} plugins`)
    for (const p of report.plugins) {
      if (p.status.state === 'active') {
        const contribs = p.status.contributions.length > 0
          ? ` (${p.status.contributions.join(', ')})`
          : ''
        console.log(`[plugins] \u2713 ${p.name}: active${contribs} [${p.durationMs}ms]`)
      } else if (p.status.state === 'degraded') {
        console.log(`[plugins] ~ ${p.name}: degraded — ${p.status.error} [${p.durationMs}ms]`)
      } else if (p.status.state === 'error') {
        console.log(`[plugins] \u2717 ${p.name}: error(${p.status.phase}) — ${p.status.error} [${p.durationMs}ms]`)
      }
      // Mirror each plugin's final boot state into the activity stream so devs
      // can see what loaded (and what failed) without reading the terminal.
      const st = p.status
      const level = st.state === 'error' ? 'error' : st.state === 'degraded' ? 'warn' : 'success'
      recordActivity({
        kind: ACTIVITY_KIND.PLUGIN,
        level,
        title: `${p.name}: ${st.state}`,
        source: p.name,
        durationMs: p.durationMs,
        detail: st.state === 'error' || st.state === 'degraded' ? st.error : undefined,
        metadata: {
          state: st.state,
          ...(st.state === 'active' ? { contributions: st.contributions } : {}),
          ...(st.state === 'error' ? { phase: st.phase } : {}),
        },
      })
    }
    console.log(`[plugins] Boot complete: ${report.active} active, ${report.degraded} degraded, ${report.failed} failed`)
    recordActivity({
      kind: ACTIVITY_KIND.PLUGIN,
      level: report.failed > 0 ? 'error' : report.degraded > 0 ? 'warn' : 'info',
      title: `Boot complete: ${report.active} active, ${report.degraded} degraded, ${report.failed} failed`,
      source: 'plugin-host',
      metadata: { total: report.total, active: report.active, degraded: report.degraded, failed: report.failed },
    })
  }
}
