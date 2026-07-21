// src/main/plugins/sdk/index.ts
import { ipcMain } from 'electron'
import type { PluginContext, Disposable, PluginIpc, BroadcastFn, ToolRegistry } from './types'
import { broadcast as broadcastEvent } from '../../ipc/broadcast'
import type { IpcEventMap } from '@shared/ipc'
import { DriverRegistryImpl } from './driver-registry'
import { CommandRegistryImpl } from './command-registry'
import { PanelRegistryImpl } from './panel-registry'
import { UIRegistryImpl } from './ui-registry'
import { CompletionRegistryImpl } from './completion-registry'
import { SchemaAccessImpl } from './schema-access'
import { ConnectionAccessImpl } from './connection-access'
import { PluginSettingsImpl } from './settings'
import { ServiceRegistryImpl, type ServiceRegistry } from './service-registry'
import { createAIAccess } from './ai-access'
import { ExporterRegistryImpl, type ExporterRegistry } from './exporter-registry'
import { ImporterRegistryImpl, type ImporterRegistry } from './importer-registry'
import { FormatterRegistryImpl, type FormatterRegistry } from './formatter-registry'
import { TypeMapperRegistryImpl, type TypeMapperRegistry } from './type-mapper-registry'
import { ThemeRegistryImpl, type ThemeRegistry, type RegisteredTheme } from './theme-registry'
import { DragDropRegistryImpl } from './drag-drop-registry'
import { ToolRegistryImpl } from './tool-registry'
import {
  guardKeyring,
  guardConnections,
  hasPermission,
  PermissionDeniedError,
  PLUGIN_PERMISSION,
  type PermissionGrant,
  type PluginPermission,
} from './permissions'

// ─── Registry implementations (most plugins don't need these directly,
//     but driver authors writing tests against fake registries do) ─────────
export { DriverRegistryImpl } from './driver-registry'
export { ThemeRegistryImpl } from './theme-registry'
export { DragDropRegistryImpl } from './drag-drop-registry'
export { CommandRegistryImpl } from './command-registry'
export { PanelRegistryImpl } from './panel-registry'
export { UIRegistryImpl } from './ui-registry'
export { CompletionRegistryImpl } from './completion-registry'
export { SchemaAccessImpl } from './schema-access'
export { ConnectionAccessImpl } from './connection-access'
export { PluginSettingsImpl } from './settings'
export { ServiceRegistryImpl } from './service-registry'
export { ExporterRegistryImpl } from './exporter-registry'
export { ImporterRegistryImpl } from './importer-registry'
export { FormatterRegistryImpl } from './formatter-registry'
export { TypeMapperRegistryImpl } from './type-mapper-registry'
export { ToolRegistryImpl } from './tool-registry'
export { isWriteQuery, toJsonSchema, jsonSchemaToZodShape } from './tool-schema'
export type { JsonSchemaObject } from './tool-schema'

// ─── Generic SQL helpers (parameterised on the driver's quote character)
//     Drivers compose these to build their exporters/importers without
//     touching anything in src/main/ outside src/main/plugins/. ────────────
export { quoteIdentifier, validateIdentifier, IdentifierError, renderPlaceholder } from './identifier'
export {
  formatSqlValue,
  generateCreateTable,
  generateInsertStatements,
} from './sql-format'
export { splitSqlStatements } from './sql-statements'
export { importCsvToTable } from './csv-into-table'
export { createRelationalGetTableData } from './relational-helpers'

// ─── Theme registration helpers ────────────────────────────────────────
// Plugin authors can run their own theme through the same validator the
// host uses, so they get the exact same failure message a user would see.
export {
  validateTheme,
  REQUIRED_THEME_TOKENS,
  RECOMMENDED_THEME_TOKENS,
} from './theme-registry'

// ─── Error handling ────────────────────────────────────────────────────
export { safeCall, ErrorBudget, PluginError } from './safe-call'

// ─── Permissions / capability model ─────────────────────────────────────
// Plugin authors declare the capabilities they need in their manifest's
// `permissions` array; the host gates the enforced surfaces at this boundary.
export {
  ALL_PERMISSIONS,
  ENFORCED_PERMISSIONS,
  ADVISORY_PERMISSIONS,
  PERMISSION_INFO,
  isPluginPermission,
  hasPermission,
  effectiveGrants,
  PermissionDeniedError,
} from './permissions'
export type {
  PluginPermission,
  EnforcedPermission,
  AdvisoryPermission,
  PermissionInfo,
  PermissionGrant,
} from './permissions'

// ─── Plugin author ergonomics ──────────────────────────────────────────
// `definePlugin({ manifest, activate, deactivate? })` is a typed identity
// helper: pins the shape so missing or mistyped fields fail at compile
// time instead of at boot.
export { definePlugin } from './define-plugin'
export type { PluginModule } from './define-plugin'

// ─── Types ─────────────────────────────────────────────────────────────
export type * from './types'
export type {
  RegisteredTheme,
  ThemeMonacoDef,
  ThemeMonacoRule,
  ThemePreview,
  ThemeValidationReport,
} from './theme-registry'
export type { DragDropProvider, DragDropContext } from './drag-drop-registry'
export type { RegisteredExporter, ExporterFn, ExporterOptions } from './exporter-registry'
export type { RegisteredImporter, ImporterParseFn, ImporterOptions, ImporterResult } from './importer-registry'
export type { TypeMapping, TypeMappingEntry, TypeMappingFallback } from './type-mapper-registry'
export type { CsvIntoTableOptions } from './csv-into-table'

interface ContextDeps {
  pluginName: string
  /** Bundled plugins shipped with the app are trusted; every capability is
   *  implicitly granted and gating is bypassed. Third-party plugins are not. */
  trusted: boolean
  /** Capabilities the user has granted this plugin (already intersected with
   *  what the manifest declared). Ignored when `trusted` is true. */
  grantedPermissions: readonly PluginPermission[]
  driverRegistry: DriverRegistryImpl
  commandRegistry: CommandRegistryImpl
  panelRegistry: PanelRegistryImpl
  uiRegistry: UIRegistryImpl
  completionRegistry: CompletionRegistryImpl
  schemaAccess: SchemaAccessImpl
  connectionAccess: ConnectionAccessImpl
  settingsStore: { get(key: string): unknown; set(key: string, value: unknown): void }
  keyring: import('./types').KeyringAccess
  services: ServiceRegistry
  exporterRegistry: ExporterRegistry
  importerRegistry: ImporterRegistry
  formatterRegistry: FormatterRegistry
  typeMapperRegistry: TypeMapperRegistry
  themeRegistry: ThemeRegistry
  notificationBus: { show(notification: PluginNotification): void }
  dragDropRegistry: import('./drag-drop-registry').DragDropRegistry
  toolRegistry: ToolRegistryImpl
}

export interface PluginNotification {
  kind?: 'info' | 'success' | 'warning' | 'error'
  title: string
  message?: string
  /** Auto-dismiss after this many milliseconds; 0 disables. */
  durationMs?: number
}

export function createPluginContext(deps: ContextDeps): PluginContext {
  const subscriptions: Disposable[] = []
  const { pluginName } = deps

  // Capability grant for this plugin. Trusted (bundled) plugins get everything;
  // third-party plugins only get what the user approved. The guarded surfaces
  // below throw `PermissionDeniedError` if the plugin reaches for something it
  // wasn't granted.
  const grant: PermissionGrant = {
    trusted: deps.trusted,
    granted: new Set(deps.grantedPermissions),
  }

  const drivers = {
    register(id: string, factory: Parameters<DriverRegistryImpl['register']>[1]) {
      const disposable = deps.driverRegistry.register(id, factory)
      subscriptions.push(disposable)
      return disposable
    },
    registerConnectionMiddleware(id: string, middleware: Parameters<DriverRegistryImpl['registerConnectionMiddleware']>[1]) {
      const disposable = deps.driverRegistry.registerConnectionMiddleware(id, middleware, pluginName)
      subscriptions.push(disposable)
      return disposable
    }
  }

  const commands = {
    register(id: string, handler: () => void | Promise<void>) {
      const namespacedId = `${pluginName}:${id}`
      const disposable = deps.commandRegistry.register(namespacedId, handler)
      subscriptions.push(disposable)
      return disposable
    }
  }

  const panels = {
    register(id: string, panel: Parameters<PanelRegistryImpl['register']>[1]) {
      const disposable = deps.panelRegistry.register(id, panel)
      subscriptions.push(disposable)
      return disposable
    }
  }

  const ui = {
    registerPanel(id: string, widgets: Parameters<UIRegistryImpl['registerPanel']>[1]) {
      const disposable = deps.uiRegistry.registerPanel(id, widgets)
      subscriptions.push(disposable)
      return disposable
    },
    registerStatusBar(id: string, widgets: Parameters<UIRegistryImpl['registerStatusBar']>[1]) {
      const disposable = deps.uiRegistry.registerStatusBar(id, widgets)
      subscriptions.push(disposable)
      return disposable
    },
    registerToolbar(id: string, widgets: Parameters<UIRegistryImpl['registerToolbar']>[1]) {
      const disposable = deps.uiRegistry.registerToolbar(id, widgets)
      subscriptions.push(disposable)
      return disposable
    },
    registerTab(id: string, widgets: Parameters<UIRegistryImpl['registerTab']>[1]) {
      const disposable = deps.uiRegistry.registerTab(id, widgets)
      subscriptions.push(disposable)
      return disposable
    },
    registerSlot(slotId: string, widgets: Parameters<UIRegistryImpl['registerSlot']>[1]) {
      const disposable = deps.uiRegistry.registerSlot(slotId, widgets)
      subscriptions.push(disposable)
      return disposable
    },
    registerResolver(id: string, resolver: Parameters<UIRegistryImpl['registerResolver']>[1]) {
      const disposable = deps.uiRegistry.registerResolver(id, resolver)
      subscriptions.push(disposable)
      return disposable
    },
    invalidate(resolverId: string) {
      deps.uiRegistry.invalidate(resolverId)
    }
  }

  const completions = {
    register(provider: Parameters<CompletionRegistryImpl['register']>[0]) {
      const disposable = deps.completionRegistry.register(provider)
      subscriptions.push(disposable)
      return disposable
    }
  }

  const settings = new PluginSettingsImpl(pluginName, deps.settingsStore)

  // Service-registry-backed AI proxy. Tracks its own disposables under the
  // plugin's subscriptions so they're cleaned up on deactivation.
  const aiAccess = createAIAccess(deps.services)
  const ai = {
    registerProvider(provider: Parameters<typeof aiAccess.registerProvider>[0]) {
      const d = aiAccess.registerProvider(provider)
      subscriptions.push(d)
      return d
    },
    registerContextProvider(provider: Parameters<typeof aiAccess.registerContextProvider>[0]) {
      const d = aiAccess.registerContextProvider(provider)
      subscriptions.push(d)
      return d
    }
  }

  const ipc: PluginIpc = {
    handle(channel, handler) {
      if (!hasPermission(grant, PLUGIN_PERMISSION.IPC)) {
        throw new PermissionDeniedError(pluginName, PLUGIN_PERMISSION.IPC)
      }
      ipcMain.handle(channel, (_event, ...args) =>
        (handler as (...a: unknown[]) => unknown)(...args)
      )
      const disposable: Disposable = { dispose: () => ipcMain.removeHandler(channel as string) }
      subscriptions.push(disposable)
      return disposable
    }
  }

  // The SDK's broadcast surface is intentionally loose (`(channel, ...args)`),
  // while the shared helper is typed against IpcEventMap. Delegate to the shared
  // send-loop, casting at this single boundary so plugins keep the looser type.
  const broadcast: BroadcastFn = (channel, ...args) => {
    broadcastEvent(channel as keyof IpcEventMap, ...(args as IpcEventMap[keyof IpcEventMap]))
  }

  // The plugin's `services` is a *scoped* view of the global registry — provides
  // are tracked as plugin subscriptions so disposing the context unprovisions them.
  const services = {
    provide<T>(serviceId: string, impl: T) {
      const d = deps.services.provide(serviceId, impl)
      subscriptions.push(d)
      return d
    },
    consume<T>(serviceId: string) {
      return deps.services.consume<T>(serviceId)
    },
    onAvailable<T>(serviceId: string, cb: (impl: T) => void) {
      const d = deps.services.onAvailable(serviceId, cb)
      subscriptions.push(d)
      return d
    }
  }

  const exporters = {
    register(id: string, exporter: Parameters<ExporterRegistry['register']>[1]) {
      const d = deps.exporterRegistry.register(`${pluginName}:${id}`, exporter)
      subscriptions.push(d)
      return d
    }
  }

  const importers = {
    register(id: string, importer: Parameters<ImporterRegistry['register']>[1]) {
      const d = deps.importerRegistry.register(`${pluginName}:${id}`, importer)
      subscriptions.push(d)
      return d
    }
  }

  const formatters = {
    register(id: string, formatter: Parameters<FormatterRegistry['register']>[1]) {
      const d = deps.formatterRegistry.register(`${pluginName}:${id}`, formatter)
      subscriptions.push(d)
      return d
    }
  }

  const themes = {
    register(theme: RegisteredTheme): Disposable {
      const d = deps.themeRegistry.register({ ...theme, source: pluginName })
      subscriptions.push(d)
      return d
    }
  }

  const notifications = {
    show(notification: PluginNotification): void {
      deps.notificationBus.show(notification)
    }
  }

  const dragDrop = {
    register(provider: Parameters<typeof deps.dragDropRegistry.register>[0]): Disposable {
      const d = deps.dragDropRegistry.register({ ...provider, source: pluginName })
      subscriptions.push(d)
      return d
    }
  }

  const typeMappers = {
    register(
      from: string,
      to: string,
      table: Parameters<TypeMapperRegistry['register']>[2],
      fallback?: Parameters<TypeMapperRegistry['register']>[3]
    ) {
      const d = deps.typeMapperRegistry.register(from, to, table, fallback)
      subscriptions.push(d)
      return d
    }
  }

  // Scoped view of the shared tool registry. `register`/`onChange` disposables
  // are tracked as plugin subscriptions so a plugin's tools are removed when it
  // deactivates — third-party AI plugins get this cleanup for free, without
  // having to remember to push to `ctx.subscriptions` themselves. The other
  // methods read straight through to the single shared instance the MCP server
  // also consumes, so both sides see the same tools.
  const tools: ToolRegistry = {
    register(tool) {
      const d = deps.toolRegistry.register(tool)
      subscriptions.push(d)
      return d
    },
    unregister: (id) => deps.toolRegistry.unregister(id),
    get: (id) => deps.toolRegistry.get(id),
    list: () => deps.toolRegistry.list(),
    getToolDefinitions: () => deps.toolRegistry.getToolDefinitions(),
    execute: (id, params, toolCtx) => deps.toolRegistry.execute(id, params, toolCtx),
    onChange(cb) {
      const d = deps.toolRegistry.onChange(cb)
      subscriptions.push(d)
      return d
    }
  }

  // Raw, un-namespaced app settings can expose other subsystems' config (AI
  // provider selection, MCP token, …). There is no legitimate third-party use,
  // so it is trusted-only — untrusted plugins get a throwing shim rather than
  // a silent no-op, so the failure is obvious during development.
  const rootSettingsDenied = (): never => {
    throw new Error(
      `Plugin '${pluginName}': rootSettings is restricted to trusted (bundled) ` +
        `plugins. Use ctx.settings for your own namespaced settings instead.`,
    )
  }
  const rootSettings = deps.trusted
    ? deps.settingsStore
    : { get: rootSettingsDenied, set: rootSettingsDenied }

  return {
    drivers,
    commands,
    tools,
    panels,
    ui,
    completions,
    schema: deps.schemaAccess,
    connections: guardConnections(deps.connectionAccess, grant, pluginName),
    settings,
    keyring: guardKeyring(deps.keyring, grant, pluginName),
    ai,
    ipc,
    broadcast,
    services,
    exporters,
    importers,
    formatters,
    typeMappers,
    themes,
    notifications,
    dragDrop,
    rootSettings,
    subscriptions
  }
}

export function disposePluginContext(context: PluginContext): void {
  const subs = [...context.subscriptions].reverse()
  for (const sub of subs) {
    try {
      sub.dispose()
    } catch {
      // Ignore disposal errors
    }
  }
  context.subscriptions.length = 0
}
