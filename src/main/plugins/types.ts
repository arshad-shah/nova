// src/main/plugins/types.ts
import type { PluginStatus, PluginContext } from './sdk/types'
import type { PluginPermission } from './sdk/permissions'
import type { ActivityBarContribution, StatusBarContribution, ContextMenuContribution, TabContribution, SelectorContribution } from '@shared/plugin-ui-types'

/** The contribution kinds `verifyContributions` (plugin-host.ts) checks a
 *  manifest's declarations against, named once so its `declared`/`registered`/
 *  `missing` ledger entries (`` `${kind}:${id}` ``) stop re-typing each kind by
 *  hand 2-3x per contribution type. */
export const CONTRIBUTION_KIND = {
  DRIVER: 'driver',
  COMMAND: 'command',
  PANEL: 'panel',
  MIDDLEWARE: 'middleware',
  EXPORTER: 'exporter',
  IMPORTER: 'importer',
  FORMATTER: 'formatter',
  THEME: 'theme',
} as const
export type ContributionKind = (typeof CONTRIBUTION_KIND)[keyof typeof CONTRIBUTION_KIND]

export interface PluginManifest {
  name: string
  version: string
  displayName: string
  description: string
  main: string
  icon?: string
  /**
   * Sensitive capabilities this plugin needs. The user must grant them before
   * a third-party plugin can use the enforced surfaces (keyring, connections,
   * custom ipc). Bundled plugins are trusted and may omit this. See
   * `src/main/plugins/sdk/permissions.ts` and `docs/plugin-security.md`.
   */
  permissions?: PluginPermission[]
  contributes: {
    drivers?: DriverContribution[]
    themes?: ThemeContribution[]
    commands?: CommandContribution[]
    exporters?: ExporterContribution[]
    importers?: ImporterContribution[]
    formatters?: FormatterContribution[]
    connectionMiddleware?: { id: string }[]
    connectionFields?: ConnectionFieldContribution[]
    panels?: PanelContributionManifest[]
    settings?: SettingContribution[]
    activityBar?: ActivityBarContribution[]
    statusBar?: StatusBarContribution[]
    toolbar?: StatusBarContribution[]
    contextMenus?: ContextMenuContribution[]
    tabs?: TabContribution[]
    selectors?: SelectorContribution[]
    dragDrop?: { id: string; extensions: string[] }[]
    welcomeWidgets?: { id: string; title: string }[]
    cellRenderers?: { id: string; matchType?: string }[]
  }
}

export interface DriverContribution {
  id: string
  name: string
  icon?: string
}

export interface ThemeContribution {
  id: string
  name: string
  type: 'dark' | 'light'
  /** Preview swatch shown in the theme picker. */
  preview?: { bg: string; sidebar: string; text: string; accent: string }
}

export interface CommandContribution {
  id: string
  title: string
  keybinding?: string
}

export interface ExporterContribution {
  id: string
  name: string
  extension: string
}

export interface ImporterContribution {
  id: string
  name: string
  extensions: string[]
}

export interface FormatterContribution {
  id: string
  name: string
}

export interface ConnectionFieldContribution {
  key: string
  label: string
  /** `file` stores the selected file's *contents* (e.g. an inline SSH key);
   *  `file-path` stores its native *path* (e.g. a SQLite database file or a
   *  private-key file the adapter reads itself). */
  type: 'text' | 'password' | 'number' | 'boolean' | 'file' | 'file-path' | 'select'
  required?: boolean
  default?: string | number | boolean
  group?: string
  fetchable?: boolean
  step?: number
  /** Comma-separated extension filter for `file` / `file-path` fields
   *  (e.g. `.db,.sqlite`). Used by both the file picker and drag-drop. */
  accept?: string
}

export interface PanelContributionManifest {
  id: string
  title: string
  icon: string
  location: 'sidebar' | 'secondary' | 'bottom'
}

/**
 * Top-level Settings categories the host knows about. A plugin can target one
 * (or 'plugin' for its own detail panel only). When set, the setting renders
 * both in the plugin's own panel and in the matching core category — when the
 * plugin is disabled or uninstalled, it disappears from both places.
 */
export type SettingCategoryTarget =
  | 'general' | 'appearance' | 'editor' | 'connections'
  | 'data-display' | 'keybindings' | 'ai' | 'mcp' | 'plugin'

export interface SettingContribution {
  key: string
  title: string
  type: 'text' | 'password' | 'number' | 'boolean' | 'select'
  default?: string | number | boolean
  /** Plain-English helper text rendered below the title. */
  description?: string
  /** For `type: 'number'` only. */
  min?: number
  max?: number
  step?: number
  /** For `type: 'select'` only. */
  options?: { value: string; label: string }[]
  /**
   * Where this setting should appear. Defaults to 'plugin' (only inside the
   * plugin's own detail panel). Set to a core category id to also surface it
   * in that category.
   */
  category?: SettingCategoryTarget
}

export interface LoadedPlugin {
  manifest: PluginManifest
  path: string
  status: PluginStatus
  module?: { activate: (ctx: PluginContext) => void | Promise<void>; deactivate?: () => void | Promise<void> }
  context?: PluginContext
  /** Set in validate phase: this (untrusted) plugin runs in a separate process
   *  and was therefore NOT require()'d into the main process. */
  runIsolated?: boolean
  /** Absolute path to the compiled main entry (resolved during validation). */
  mainPath?: string
  /** Host-side controller for an isolated plugin's worker; present while active. */
  isolatedHandle?: { deactivate: () => Promise<void> }
}
