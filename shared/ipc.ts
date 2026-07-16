import type { ConnectionProfile, QueryResult, SchemaTable, SchemaColumn, SchemaIndex, SchemaObject, DatabaseType, PlanNode } from './types'
import type { AppSettings } from './settings'
import type { AIChatStartRequest, AIStreamEvent, AIProviderInfo, AIModelInfo, AIChatMessage } from './ai-types'
import type { DriverCapabilities, SessionOpts, RuntimeCapabilityOverlay } from './driver-capabilities'
import type { ActivityEntry, ActivityQuery, ActivityKind, ActivityLevel } from './activity'
import type { ConversationsSnapshot, StoredConversation, SavedQuery, QueryHistoryEntry, OpenTabsSnapshot, TabOp } from './appdata'
import type { ExportFormatInfo, ImportFormatInfo } from './export-import'
import type { MenuActionId } from './menus'

// ─── Channel shapes ──────────────────────────────────────────────────────────
//
// The `args` / `return` contract for every invoke channel, keyed by the
// channel's CONSTANT NAME (e.g. `DB_CONNECT`) rather than its wire string.
// The wire string itself is written exactly once — as the value in
// `IPC_CHANNELS` below — and `IpcChannelMap` is derived by joining the two.
// This is what eliminates the old name-duplication where each channel string
// appeared both as a map key and as a constant value.

export interface IpcChannelShapes {
  DB_CONNECT: {
    args: [profileId: string]
    return: { success: boolean; error?: string }
  }
  DB_DISCONNECT: {
    args: [profileId: string]
    return: void
  }
  DB_SET_ACTIVE_CONNECTION: {
    args: [profileId: string | null]
    return: void
  }
  ACTIVITY_LIST: {
    args: [query?: ActivityQuery]
    return: ActivityEntry[]
  }
  ACTIVITY_CLEAR: {
    args: []
    return: void
  }
  /** Record a renderer-originated diagnostic entry (store mutations, perf
   *  signals) into the unified main-owned activity stream. */
  ACTIVITY_RECORD: {
    args: [entry: {
      kind: ActivityKind
      level?: ActivityLevel
      title: string
      detail?: string
      source?: string
      durationMs?: number
      stack?: string
      metadata?: Record<string, unknown>
      traceId?: string
    }]
    return: void
  }
  DB_QUERY: {
    args: [profileId: string, sql: string, params?: unknown[], opts?: { sessionId?: string; timeoutMs?: number }]
    return: QueryResult
  }
  DB_FORMAT_QUERY: {
    args: [language: string, connectionType: string, source: string]
    return: { formatted: string; changed: boolean }
  }
  DB_TEST_CONNECTION: {
    args: [profile: ConnectionProfile]
    return: { success: boolean; error?: string; version?: string; details?: Record<string, string> }
  }
  DB_GET_TABLES: {
    args: [profileId: string, schema?: string]
    return: SchemaTable[]
  }
  /** Browse a table's data via the driver's own reader (the same one export
   *  uses). Lets non-SQL drivers (Redis key/value, Mongo documents) render a
   *  data grid the renderer can't build from a SELECT. */
  DB_GET_TABLE_DATA: {
    args: [profileId: string, table: string, schema?: string]
    return: { rows: Record<string, unknown>[]; columns: SchemaColumn[] }
  }
  DB_GET_COLUMNS: {
    args: [profileId: string, table: string, schema?: string]
    return: SchemaColumn[]
  }
  DB_GET_INDEXES: {
    args: [profileId: string, table: string, schema?: string]
    return: SchemaIndex[]
  }
  DB_GET_SCHEMAS: {
    args: [profileId: string]
    return: string[]
  }
  DB_GET_DATABASES: {
    args: [profileId: string]
    return: string[]
  }
  DB_GET_ROW_COUNT: {
    args: [profileId: string, table: string, schema?: string]
    return: number
  }
  DB_GET_SCHEMA_OBJECTS: {
    args: [profileId: string, schema?: string]
    return: SchemaObject[]
  }
  DB_SWITCH_DATABASE: {
    args: [profileId: string, database: string]
    return: void
  }
  DB_SWITCH_WAREHOUSE: {
    args: [profileId: string, warehouse: string]
    return: void
  }
  DB_SWITCH_ROLE: {
    args: [profileId: string, role: string]
    return: void
  }
  CONNECTIONS_LIST: {
    args: []
    return: ConnectionProfile[]
  }
  CONNECTIONS_SAVE: {
    args: [profile: ConnectionProfile]
    return: ConnectionProfile
  }
  CONNECTIONS_DELETE: {
    args: [profileId: string]
    return: void
  }
  DB_SET_SCHEMA: {
    args: [profileId: string, schema: string]
    return: void
  }
  DB_CANCEL_QUERY: {
    args: [profileId: string]
    return: void
  }
  DB_GET_TABLE_NAMES: {
    args: [profileId: string, schema?: string]
    return: string[]
  }
  DB_SAMPLE_QUERY: {
    args: [profileId: string, table: string, schema?: string]
    return: string
  }
  DB_DRIVER_CAPABILITIES: {
    args: [type: string]
    return: DriverCapabilities | null
  }
  /** Parse an EXPLAIN result into a normalized plan tree via the driver. Returns
   *  [] when the driver has no plan parser or the rows aren't a plan. */
  DB_PARSE_PLAN: {
    args: [profileId: string, result: QueryResult]
    return: PlanNode[]
  }
  DB_SESSION_OPEN: {
    args: [profileId: string, sessionId: string, opts?: SessionOpts]
    return: void
  }
  DB_SESSION_CLOSE: {
    args: [profileId: string, sessionId: string]
    return: void
  }
  DB_SESSION_SET_AUTOCOMMIT: {
    args: [profileId: string, sessionId: string, enabled: boolean]
    return: void
  }
  DB_TXN_BEGIN: {
    args: [profileId: string, sessionId: string, opts?: SessionOpts]
    return: void
  }
  DB_TXN_COMMIT: {
    args: [profileId: string, sessionId: string]
    return: void
  }
  DB_TXN_ROLLBACK: {
    args: [profileId: string, sessionId: string]
    return: void
  }
  DB_CONNECTION_CAPABILITIES: {
    args: [profileId: string]
    return: RuntimeCapabilityOverlay | null
  }
  EXPORT_TABLE: {
    // `format` is a registry id (csv/json/sql/plugin-contributed), not a fixed
    // enum — the renderer lists the connection's formats via EXPORT_FORMATS_LIST.
    args: [profileId: string, tableName: string, format: string, options?: { schema?: string; includeSchema?: boolean }]
    return: { filePath: string } | { cancelled: true }
  }
  /** The export formats available for a connection (driver-filtered). */
  EXPORT_FORMATS_LIST: {
    args: [profileId: string]
    return: ExportFormatInfo[]
  }
  /** The import formats available for a connection (driver-filtered). */
  IMPORT_FORMATS_LIST: {
    args: [profileId: string]
    return: ImportFormatInfo[]
  }
  EXPORT_QUERY_RESULT: {
    args: [rows: Record<string, unknown>[], fields: string[], format: 'csv' | 'json']
    return: { filePath: string } | { cancelled: true }
  }
  IMPORT_CSV: {
    args: [profileId: string, tableName: string, columnMapping: Record<string, string>, onConflict: 'skip' | 'update' | 'error']
    return: { inserted: number; skipped: number; errors: string[] } | { cancelled: true }
  }
  IMPORT_SQL: {
    args: [profileId: string]
    return: { executed: number; errors: string[] } | { cancelled: true }
  }
  MIGRATION_TYPE_MAP: {
    args: [sourceType: string, from: DatabaseType, to: DatabaseType]
    return: { source: string; target: string; lossy: boolean; note?: string }
  }
  MIGRATION_GENERATE_DDL: {
    args: [tableName: string, columns: { name: string; dataType: string; nullable: boolean; isPrimaryKey: boolean; defaultValue: string | null }[], from: DatabaseType, to: DatabaseType]
    return: { ddl: string; mappings: { source: string; target: string; lossy: boolean; note?: string }[] }
  }
  PLUGINS_LIST: {
    args: []
    return: {
      name: string
      displayName: string
      version: string
      description: string
      bundled: boolean
      icon?: string
      status: { state: string; error?: string; phase?: string; contributions?: string[] }
      contributions: string[]
      /** Sensitive capabilities the plugin declared in its manifest. */
      requestedPermissions: string[]
      /** Capabilities currently granted (all of them for trusted/bundled). */
      grantedPermissions: string[]
    }[]
  }
  PLUGINS_GET_PERMISSIONS: {
    args: [name: string]
    return: {
      trusted: boolean
      declared: string[]
      granted: string[]
      info: Record<string, { title: string; description: string; enforced: boolean; sensitive: boolean }>
    } | null
  }
  PLUGINS_SET_PERMISSIONS: {
    args: [name: string, permissions: string[]]
    return: { granted: string[] }
  }
  PLUGINS_ACTIVATE: {
    args: [name: string]
    return: { success: boolean; error?: string }
  }
  PLUGINS_DEACTIVATE: {
    args: [name: string]
    return: void
  }
  PLUGINS_INSTALL_FROM_PATH: {
    args: [path: string]
    return: { success: boolean; name?: string; error?: string }
  }
  PLUGINS_INSTALL_FROM_ZIP: {
    args: [zipPath: string]
    return: { success: boolean; name?: string; error?: string }
  }
  PLUGINS_OPEN_INSTALL_DIALOG: {
    args: []
    return: string | null
  }
  PLUGINS_UNINSTALL: {
    args: [name: string]
    return: void
  }
  PLUGINS_ERRORS: {
    args: [name: string]
    return: { timestamp: number; error: string; stack?: string }[]
  }
  PLUGINS_GET_SETTINGS: {
    args: [name: string]
    return: {
      schema: {
        key: string
        title: string
        type: 'text' | 'password' | 'number' | 'boolean' | 'select'
        default?: string | number | boolean
        description?: string
        min?: number
        max?: number
        step?: number
        options?: { value: string; label: string }[]
        category?: string
      }[]
      values: Record<string, unknown>
    }
  }
  PLUGINS_SET_SETTING: {
    args: [name: string, key: string, value: unknown]
    return: void
  }
  PLUGINS_CONNECTION_FIELDS: {
    args: []
    return: { driverId: string; driverName: string; connectionFields: { key: string; label: string; type: string; required?: boolean; default?: string | number | boolean; group?: string; fetchable?: boolean; step?: number; options?: { value: string; label: string }[]; accept?: string }[] }[]
  }
  PLUGINS_MIDDLEWARE_FIELDS: {
    args: []
    return: { key: string; label: string; type: string; required?: boolean; default?: string | number | boolean; group?: string }[]
  }
  PLUGINS_UI_GET_CONTRIBUTIONS: {
    args: [surface: string]
    return: import('./plugin-ui-types').UIContribution[]
  }
  PLUGINS_UI_RESOLVE: {
    args: [pluginId: string, resolverId: string, context: import('./plugin-ui-types').ResolverContext]
    return: { value: string; label: string }[]
  }
  PLUGINS_UI_ACTION: {
    args: [pluginId: string, commandId: string, payload: Record<string, unknown>]
    return: void
  }
  /** Renderer reports the outcome of a `app:action:perform` request back to the AI tool. */
  APP_ACTION_RESULT: {
    args: [payload: { requestId: string; success: boolean; error?: string }]
    return: void
  }
  PLUGINS_UI_CONTRIBUTIONS_CHANGED: {
    args: []
    return: void
  }
  PLUGINS_GET_COMMANDS: {
    args: []
    return: {
      pluginId: string
      pluginDisplayName: string
      commandId: string
      title: string
      keybinding?: string
    }[]
  }
  PLUGINS_COMPLETIONS: {
    args: [driverId: string, connectionId: string, context: import('./plugin-ui-types').CompletionContext]
    return: import('./plugin-ui-types').CompletionItem[]
  }
  SETTINGS_GET_ALL: {
    args: []
    return: AppSettings
  }
  SETTINGS_GET: {
    args: [category: string]
    return: unknown
  }
  SETTINGS_SET: {
    args: [keyPath: string, value: unknown]
    return: void
  }
  SETTINGS_RESET: {
    args: [category: string]
    return: unknown
  }
  DIALOG_OPEN_FILE: {
    args: [options?: { title?: string; filters?: { name: string; extensions: string[] }[] }]
    return: { filePath: string; content: string } | { cancelled: true }
  }
  DIALOG_OPEN_FILE_PATH: {
    args: [options?: { title?: string; filters?: { name: string; extensions: string[] }[] }]
    return: { filePath: string } | { cancelled: true }
  }
  DB_CONNECTION_OPTIONS: {
    args: [profile: ConnectionProfile, fields: string[]]
    return: Record<string, string[]>
  }
  KEYRING_STORE: {
    args: [profileId: string, key: string, value: string]
    return: void
  }
  KEYRING_RETRIEVE: {
    args: [profileId: string, key: string]
    return: string | null
  }
  KEYRING_DELETE: {
    args: [profileId: string, key: string]
    return: void
  }
  // ─── AI ─────────────────────────────────────────────────────────────────────
  AI_CHAT_START: {
    args: [request: AIChatStartRequest]
    return: { streamId: string }
  }
  AI_CHAT_ABORT: {
    args: [streamId: string]
    return: void
  }
  AI_CHAT_APPROVAL_RESPONSE: {
    args: [requestId: string, approved: boolean]
    return: void
  }
  AI_PROVIDERS_LIST: {
    args: []
    return: AIProviderInfo[]
  }
  AI_PROVIDERS_LIST_CONFIGURED: {
    args: []
    return: AIProviderInfo[]
  }
  AI_PROVIDERS_SET_ACTIVE: {
    args: [providerId: string]
    return: void
  }
  AI_PROVIDERS_GET_ACTIVE: {
    args: []
    return: AIProviderInfo | null
  }
  AI_MODELS_LIST: {
    args: []
    return: AIModelInfo[]
  }
  AI_MODELS_SET_ACTIVE: {
    args: [modelId: string]
    return: void
  }
  AI_MODELS_GET_ACTIVE: {
    args: []
    return: string | null
  }
  AI_MESSAGES_LIST: {
    args: []
    return: AIChatMessage[]
  }
  AI_MESSAGES_CLEAR: {
    args: []
    return: void
  }
  AI_MESSAGES_SET: {
    args: [messages: AIChatMessage[]]
    return: void
  }
  AI_TOOLS_LIST: {
    args: []
    return: { id: string; name: string; description: string; permission: 'read' | 'write' }[]
  }
  AI_KEYS_HAS: {
    args: [provider: 'openai' | 'anthropic']
    return: boolean
  }
  AI_KEYS_SET: {
    args: [provider: 'openai' | 'anthropic', value: string]
    return: void
  }
  /** Triggers a soft relaunch of the app. Renderer prompts the user via the
   *  plugin-lifecycle banner; only the user's confirmation calls this. */
  APP_RESTART: {
    args: []
    return: void
  }
  /** App + runtime versions for the in-app About modal. */
  APP_ABOUT_INFO: {
    args: []
    return: {
      name: string
      version: string
      electron: string
      chrome: string
      node: string
      v8: string
      os: string
      arch: string
    }
  }
  // ── Window controls (custom title bar) ─────────────────────────────────
  // The renderer owns the title bar on every platform. Native window buttons
  // are preserved where the OS offers them (macOS traffic lights, Windows
  // Window Controls Overlay); Linux has no overlay API, so the renderer draws
  // its own controls and drives them through these channels.
  /** Minimise the window that sent the request. */
  WINDOW_MINIMIZE: {
    args: []
    return: void
  }
  /** Toggle maximise/restore; returns the resulting maximised state. */
  WINDOW_TOGGLE_MAXIMIZE: {
    args: []
    return: boolean
  }
  /** Close the window that sent the request. */
  WINDOW_CLOSE: {
    args: []
    return: void
  }
  /** Current maximised state — used to pick the maximise vs. restore icon. */
  WINDOW_IS_MAXIMIZED: {
    args: []
    return: boolean
  }
  /** Top-level application-menu items (File/Edit/View/…), so the custom title
   *  bar can render a menu bar on Windows/Linux where the native one is hidden.
   *  macOS keeps its global menu bar and doesn't use this. */
  WINDOW_MENU_LIST: {
    args: []
    return: { id: number; label: string; enabled: boolean }[]
  }
  /** Pop the native submenu for a top-level menu item at viewport coords (x,y),
   *  so the title-bar menu bar drives the real, single-source-of-truth menu. */
  WINDOW_MENU_POPUP: {
    args: [payload: { id: number; x: number; y: number }]
    return: void
  }
  /** Run a native edit role on the focused web contents, so the app-designed
   *  Edit menu (custom title bar) drives Undo/Redo/Cut/Copy/Paste/Select All. */
  WINDOW_EDIT_ROLE: {
    args: [role: 'undo' | 'redo' | 'cut' | 'copy' | 'paste' | 'selectAll']
    return: void
  }
  /** Toggle full screen; returns the resulting full-screen state. */
  WINDOW_TOGGLE_FULLSCREEN: {
    args: []
    return: boolean
  }
  /**
   * Report the title bar's rendered height so macOS can centre its traffic
   * lights in it. The OS draws those buttons and the app only positions them,
   * so their offset has to come from the bar's *measured* height — which the
   * UI density setting changes. No-op off macOS.
   */
  WINDOW_SET_TITLEBAR_HEIGHT: {
    args: [height: number]
    return: void
  }
  /** Reload the renderer (View menu, dev builds). */
  WINDOW_RELOAD: {
    args: []
    return: void
  }
  /** Toggle the Chromium devtools (View menu, dev builds). */
  WINDOW_TOGGLE_DEVTOOLS: {
    args: []
    return: void
  }
  /** Open an external URL in the user's default browser (Help menu links). */
  WINDOW_OPEN_EXTERNAL: {
    args: [url: string]
    return: void
  }
  /** Returns whether any updater can manage this install + which channel. */
  UPDATER_STATUS: {
    args: []
    return:
      | { available: false }
      | { available: true; id: string; displayName: string; currentVersion: string }
  }
  /** Asks the active updater whether a new version is available. */
  UPDATER_CHECK: {
    args: []
    return:
      | { supported: false }
      | { supported: true; currentVersion: string; latestVersion: string | null; available: boolean }
  }
  /** Kicks off the update install. Progress streams on `updater:progress`. */
  UPDATER_UPDATE: {
    args: []
    return:
      | { started: true }
      | { started: false; reason: 'no-updater' }
  }
  /**
   * Returns settings contributed by active plugins, filtered to a single
   * core category. Used to render plugin-contributed rows alongside core
   * settings in their target category. Disabled plugins are excluded.
   */
  PLUGINS_GET_CATEGORIZED_SETTINGS: {
    args: [category: string]
    return: {
      pluginName: string
      pluginDisplayName: string
      schema: {
        key: string
        title: string
        type: 'text' | 'password' | 'number' | 'boolean' | 'select'
        default?: string | number | boolean
        description?: string
        min?: number
        max?: number
        step?: number
        options?: { value: string; label: string }[]
      }[]
      values: Record<string, unknown>
    }[]
  }
  // ─── AI Enhancements ────────────────────────────────────────────────────────
  AI_GENERATE_SQL: {
    args: [request: { prompt: string; connectionId: string; schema?: string }]
    return: { sql: string }
  }
  AI_COMPLETE_SQL: {
    args: [request: { sql: string; cursorOffset: number; connectionId: string; schema?: string }]
    return: { completion: string }
  }
  AI_EXPLAIN_RESULTS: {
    args: [request: { sql: string; columns: string[]; rowCount: number; sampleRows: Record<string, unknown>[] }]
    return: { explanation: string; model: string; durationMs: number }
  }
  AI_EXPLAIN_START: {
    args: [request: { sql: string; columns: string[]; rowCount: number; sampleRows: Record<string, unknown>[] }]
    return: { streamId: string; model: string }
  }
  AI_EXPLAIN_ABORT: {
    args: [streamId: string]
    return: void
  }
  AI_CONVERSATION_SUMMARIZE: {
    args: [messages: AIChatMessage[]]
    return: { summary: string }
  }
  AI_PERMISSION_GET_PROFILE: {
    args: []
    return: 'read-only' | 'ask-write' | 'auto'
  }
  AI_PERMISSION_SET_PROFILE: {
    args: [profile: 'read-only' | 'ask-write' | 'auto']
    return: void
  }
  // ─── App-data store (SQLite) ─────────────────────────────────────────────────
  // Durable home for high-growth datasets that used to live in renderer
  // localStorage. See docs/proposals/internal-app-data-store.md.
  /** All conversations (with messages) plus the last-active id. */
  APPDATA_CONVERSATIONS_LIST: {
    args: []
    return: ConversationsSnapshot
  }
  /** Replace one conversation and its messages in a single transaction. */
  APPDATA_CONVERSATIONS_UPSERT: {
    args: [conversation: StoredConversation]
    return: void
  }
  APPDATA_CONVERSATIONS_DELETE: {
    args: [id: string]
    return: void
  }
  /** Remember which conversation is active across restarts. */
  APPDATA_CONVERSATIONS_SET_ACTIVE: {
    args: [id: string | null]
    return: void
  }
  /** One-time migration import. No-ops when conversations already exist. */
  APPDATA_CONVERSATIONS_IMPORT: {
    args: [conversations: StoredConversation[], activeConversationId: string | null]
    return: { imported: number }
  }
  APPDATA_SAVED_QUERIES_LIST: {
    args: []
    return: SavedQuery[]
  }
  APPDATA_SAVED_QUERIES_UPSERT: {
    args: [query: SavedQuery]
    return: void
  }
  APPDATA_SAVED_QUERIES_DELETE: {
    args: [id: string]
    return: void
  }
  /** One-time migration import. No-ops when saved queries already exist. */
  APPDATA_SAVED_QUERIES_IMPORT: {
    args: [queries: SavedQuery[]]
    return: { imported: number }
  }
  /** Newest-first recorded query runs, capped to `limit`. */
  APPDATA_QUERY_HISTORY_LIST: {
    args: [limit?: number]
    return: QueryHistoryEntry[]
  }
  /** Record one run; prunes to the newest `maxItems` server-side. */
  APPDATA_QUERY_HISTORY_ADD: {
    args: [entry: QueryHistoryEntry, maxItems: number]
    return: void
  }
  APPDATA_QUERY_HISTORY_DELETE: {
    args: [id: string]
    return: void
  }
  APPDATA_QUERY_HISTORY_CLEAR: {
    args: []
    return: void
  }
  /** The ordered set of persisted query tabs plus the focused id. */
  APPDATA_OPEN_TABS_LIST: {
    args: []
    return: OpenTabsSnapshot
  }
  /** Apply a batch of incremental tab mutations in a single transaction. */
  APPDATA_OPEN_TABS_APPLY: {
    args: [ops: TabOp[]]
    return: void
  }
  // ─── MCP Server ─────────────────────────────────────────────────────────────
  MCP_START: {
    args: []
    return: import('./mcp').MCPStartResult
  }
  MCP_STOP: {
    args: []
    return: void
  }
  MCP_STATUS: {
    args: []
    return: import('./mcp').MCPServerStatus
  }
  MCP_TOOLS: {
    args: []
    return: import('./mcp').MCPToolInfo[]
  }
  MCP_SET_TOOL_ENABLED: {
    args: [toolId: string, enabled: boolean]
    return: void
  }
  MCP_ACTIVITY: {
    args: []
    return: import('./mcp').MCPActivityEntry[]
  }
  MCP_REGENERATE_TOKEN: {
    args: []
    return: import('./mcp').MCPServerStatus
  }
  MCP_RELOAD: {
    args: []
    return: import('./mcp').MCPServerStatus
  }
  MCP_APPROVAL_RESPONSE: {
    args: [requestId: string, approved: boolean]
    return: void
  }
  THEMES_LIST: {
    args: []
    return: {
      id: string
      name: string
      type: 'dark' | 'light'
      tokens?: Record<string, string>
      css?: string
      monaco?: {
        base: 'vs' | 'vs-dark'
        colors: Record<string, string>
        rules: { token: string; foreground: string; background?: string; fontStyle?: string }[]
      }
      preview?: { bg: string; sidebar: string; text: string; accent: string }
      source?: string
    }[]
  }
  PLUGINS_DRAG_DROP: {
    args: [filePath: string]
    return: { handled: boolean }
  }
}

// ─── Central channel registry ───────────────────────────────────────────────
//
// `IPC_CHANNELS` is the single source of truth for every channel's wire
// string. Adding a new invoke channel is a two-step edit, both in this file:
//
//   1. Add the channel's `args` + `return` to `IpcChannelShapes` above, keyed
//      by its CONSTANT NAME (e.g. `DB_EXPLAIN_QUERY`).
//   2. Add the matching constant + wire string to `IPC_CHANNELS` below
//      (e.g. `DB_EXPLAIN_QUERY: 'db:explain-query'`).
//
// The wire string is written exactly once (step 2). The `satisfies
// Record<keyof IpcChannelShapes, string>` clause forces `IPC_CHANNELS` to
// have exactly the same set of keys as `IpcChannelShapes` — a missing or
// orphan entry is a compile error — so the two halves can never drift. Use
// `IPC_CHANNELS.<NAME>` from both main and renderer; never an inline literal.

export const IPC_CHANNELS = {
  // ── Database lifecycle ─────────────────────────────────────────────────
  DB_CONNECT: 'db:connect',
  DB_DISCONNECT: 'db:disconnect',
  DB_SET_ACTIVE_CONNECTION: 'db:set-active-connection',
  ACTIVITY_LIST: 'activity:list',
  ACTIVITY_CLEAR: 'activity:clear',
  ACTIVITY_RECORD: 'activity:record',
  DB_QUERY: 'db:query',
  DB_FORMAT_QUERY: 'db:format-query',
  DB_TEST_CONNECTION: 'db:test-connection',
  DB_CONNECTION_OPTIONS: 'db:connection-options',
  DB_CANCEL_QUERY: 'db:cancel-query',
  DB_SAMPLE_QUERY: 'db:sample-query',
  DB_DRIVER_CAPABILITIES: 'db:driver-capabilities',
  DB_PARSE_PLAN: 'db:parse-plan',
  // ── Schema introspection ───────────────────────────────────────────────
  DB_GET_TABLES: 'db:get-tables',
  DB_GET_TABLE_DATA: 'db:get-table-data',
  DB_GET_COLUMNS: 'db:get-columns',
  DB_GET_INDEXES: 'db:get-indexes',
  DB_GET_SCHEMAS: 'db:get-schemas',
  DB_GET_DATABASES: 'db:get-databases',
  DB_GET_ROW_COUNT: 'db:get-row-count',
  DB_GET_SCHEMA_OBJECTS: 'db:get-schema-objects',
  DB_GET_TABLE_NAMES: 'db:get-table-names',
  // ── Database session controls ─────────────────────────────────────────
  DB_SWITCH_DATABASE: 'db:switch-database',
  DB_SWITCH_WAREHOUSE: 'db:switch-warehouse',
  DB_SWITCH_ROLE: 'db:switch-role',
  DB_SET_SCHEMA: 'db:set-schema',
  DB_SESSION_OPEN: 'db:session:open',
  DB_SESSION_CLOSE: 'db:session:close',
  DB_SESSION_SET_AUTOCOMMIT: 'db:session:set-autocommit',
  DB_TXN_BEGIN: 'db:txn:begin',
  DB_TXN_COMMIT: 'db:txn:commit',
  DB_TXN_ROLLBACK: 'db:txn:rollback',
  DB_CONNECTION_CAPABILITIES: 'db:connection-capabilities',
  // ── Connection profiles ────────────────────────────────────────────────
  CONNECTIONS_LIST: 'connections:list',
  CONNECTIONS_SAVE: 'connections:save',
  CONNECTIONS_DELETE: 'connections:delete',
  // ── Export / Import ────────────────────────────────────────────────────
  EXPORT_TABLE: 'export:table',
  EXPORT_QUERY_RESULT: 'export:query-result',
  EXPORT_FORMATS_LIST: 'export:formats-list',
  IMPORT_CSV: 'import:csv',
  IMPORT_SQL: 'import:sql',
  IMPORT_FORMATS_LIST: 'import:formats-list',
  // ── Migration ──────────────────────────────────────────────────────────
  MIGRATION_TYPE_MAP: 'migration:type-map',
  MIGRATION_GENERATE_DDL: 'migration:generate-ddl',
  // ── Plugins ────────────────────────────────────────────────────────────
  PLUGINS_LIST: 'plugins:list',
  PLUGINS_GET_PERMISSIONS: 'plugins:get-permissions',
  PLUGINS_SET_PERMISSIONS: 'plugins:set-permissions',
  PLUGINS_ACTIVATE: 'plugins:activate',
  PLUGINS_DEACTIVATE: 'plugins:deactivate',
  PLUGINS_INSTALL_FROM_PATH: 'plugins:install-from-path',
  PLUGINS_INSTALL_FROM_ZIP: 'plugins:install-from-zip',
  PLUGINS_OPEN_INSTALL_DIALOG: 'plugins:open-install-dialog',
  PLUGINS_UNINSTALL: 'plugins:uninstall',
  PLUGINS_ERRORS: 'plugins:errors',
  PLUGINS_GET_SETTINGS: 'plugins:get-settings',
  PLUGINS_SET_SETTING: 'plugins:set-setting',
  PLUGINS_CONNECTION_FIELDS: 'plugins:connection-fields',
  PLUGINS_MIDDLEWARE_FIELDS: 'plugins:middleware-fields',
  PLUGINS_GET_COMMANDS: 'plugins:get-commands',
  PLUGINS_COMPLETIONS: 'plugins:completions',
  PLUGINS_GET_CATEGORIZED_SETTINGS: 'plugins:get-categorized-settings',
  PLUGINS_UI_GET_CONTRIBUTIONS: 'plugins:ui:get-contributions',
  PLUGINS_UI_RESOLVE: 'plugins:ui:resolve',
  PLUGINS_UI_ACTION: 'plugins:ui:action',
  PLUGINS_UI_CONTRIBUTIONS_CHANGED: 'plugins:ui:contributions-changed',
  // ── App settings ───────────────────────────────────────────────────────
  SETTINGS_GET_ALL: 'settings:get-all',
  SETTINGS_GET: 'settings:get',
  SETTINGS_SET: 'settings:set',
  SETTINGS_RESET: 'settings:reset',
  // ── File dialogs ───────────────────────────────────────────────────────
  DIALOG_OPEN_FILE: 'dialog:open-file',
  DIALOG_OPEN_FILE_PATH: 'dialog:open-file-path',
  // ── Keyring ────────────────────────────────────────────────────────────
  KEYRING_STORE: 'keyring:store',
  KEYRING_RETRIEVE: 'keyring:retrieve',
  KEYRING_DELETE: 'keyring:delete',
  // ── AI ─────────────────────────────────────────────────────────────────
  AI_CHAT_START: 'ai:chat:start',
  AI_CHAT_ABORT: 'ai:chat:abort',
  AI_CHAT_APPROVAL_RESPONSE: 'ai:chat:approval-response',
  AI_PROVIDERS_LIST: 'ai:providers:list',
  AI_PROVIDERS_LIST_CONFIGURED: 'ai:providers:list-configured',
  AI_PROVIDERS_SET_ACTIVE: 'ai:providers:set-active',
  AI_PROVIDERS_GET_ACTIVE: 'ai:providers:get-active',
  AI_MODELS_LIST: 'ai:models:list',
  AI_MODELS_SET_ACTIVE: 'ai:models:set-active',
  AI_MODELS_GET_ACTIVE: 'ai:models:get-active',
  AI_MESSAGES_LIST: 'ai:messages:list',
  AI_MESSAGES_CLEAR: 'ai:messages:clear',
  AI_MESSAGES_SET: 'ai:messages:set',
  AI_TOOLS_LIST: 'ai:tools:list',
  AI_KEYS_HAS: 'ai:keys:has',
  AI_KEYS_SET: 'ai:keys:set',
  AI_GENERATE_SQL: 'ai:generate-sql',
  AI_COMPLETE_SQL: 'ai:complete-sql',
  AI_EXPLAIN_RESULTS: 'ai:explain-results',
  AI_EXPLAIN_START: 'ai:explain:start',
  AI_EXPLAIN_ABORT: 'ai:explain:abort',
  AI_CONVERSATION_SUMMARIZE: 'ai:conversation:summarize',
  AI_PERMISSION_GET_PROFILE: 'ai:permission:get-profile',
  AI_PERMISSION_SET_PROFILE: 'ai:permission:set-profile',
  // ── App-data store (SQLite) ────────────────────────────────────────────
  APPDATA_CONVERSATIONS_LIST: 'appdata:conversations:list',
  APPDATA_CONVERSATIONS_UPSERT: 'appdata:conversations:upsert',
  APPDATA_CONVERSATIONS_DELETE: 'appdata:conversations:delete',
  APPDATA_CONVERSATIONS_SET_ACTIVE: 'appdata:conversations:set-active',
  APPDATA_CONVERSATIONS_IMPORT: 'appdata:conversations:import',
  APPDATA_SAVED_QUERIES_LIST: 'appdata:saved-queries:list',
  APPDATA_SAVED_QUERIES_UPSERT: 'appdata:saved-queries:upsert',
  APPDATA_SAVED_QUERIES_DELETE: 'appdata:saved-queries:delete',
  APPDATA_SAVED_QUERIES_IMPORT: 'appdata:saved-queries:import',
  APPDATA_QUERY_HISTORY_LIST: 'appdata:query-history:list',
  APPDATA_QUERY_HISTORY_ADD: 'appdata:query-history:add',
  APPDATA_QUERY_HISTORY_DELETE: 'appdata:query-history:delete',
  APPDATA_QUERY_HISTORY_CLEAR: 'appdata:query-history:clear',
  APPDATA_OPEN_TABS_LIST: 'appdata:open-tabs:list',
  APPDATA_OPEN_TABS_APPLY: 'appdata:open-tabs:apply',
  // ── MCP server ─────────────────────────────────────────────────────────
  MCP_START: 'mcp:start',
  MCP_STOP: 'mcp:stop',
  MCP_STATUS: 'mcp:status',
  MCP_TOOLS: 'mcp:tools',
  MCP_SET_TOOL_ENABLED: 'mcp:set-tool-enabled',
  MCP_ACTIVITY: 'mcp:activity',
  MCP_REGENERATE_TOKEN: 'mcp:regenerate-token',
  MCP_RELOAD: 'mcp:reload',
  MCP_APPROVAL_RESPONSE: 'mcp:approval-response',
  // ── App lifecycle ──────────────────────────────────────────────────────
  APP_RESTART: 'app:restart',
  APP_ABOUT_INFO: 'app:about-info',
  // ── Window controls (custom title bar) ─────────────────────────────────
  WINDOW_MINIMIZE: 'window:minimize',
  WINDOW_TOGGLE_MAXIMIZE: 'window:toggle-maximize',
  WINDOW_CLOSE: 'window:close',
  WINDOW_IS_MAXIMIZED: 'window:is-maximized',
  WINDOW_MENU_LIST: 'window:menu:list',
  WINDOW_MENU_POPUP: 'window:menu:popup',
  WINDOW_EDIT_ROLE: 'window:edit-role',
  WINDOW_TOGGLE_FULLSCREEN: 'window:toggle-fullscreen',
  WINDOW_SET_TITLEBAR_HEIGHT: 'window:set-titlebar-height',
  WINDOW_RELOAD: 'window:reload',
  WINDOW_TOGGLE_DEVTOOLS: 'window:toggle-devtools',
  WINDOW_OPEN_EXTERNAL: 'window:open-external',
  // ── Updater ────────────────────────────────────────────────────────────
  UPDATER_STATUS: 'updater:status',
  UPDATER_CHECK: 'updater:check',
  UPDATER_UPDATE: 'updater:update',
  // ── Themes ──────────────────────────────────────────────────────────────
  THEMES_LIST: 'themes:list',
  // ── Drag and drop ──────────────────────────────────────────────────────
  PLUGINS_DRAG_DROP: 'plugins:drag-drop',
  // ── AI app actions ─────────────────────────────────────────────────────
  APP_ACTION_RESULT: 'app:action:result'
} as const satisfies Record<keyof IpcChannelShapes, string>

/** The union of every channel's wire string (e.g. `'db:connect'`). */
export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS]

/** Map a constant-name key to its wire string. The conditional guards the
 *  index so TypeScript accepts it; the `never` branch is unreachable because
 *  `IPC_CHANNELS satisfies Record<keyof IpcChannelShapes, string>` proves the
 *  key sets are identical. */
type ChannelWire<K extends keyof IpcChannelShapes> =
  K extends keyof typeof IPC_CHANNELS ? (typeof IPC_CHANNELS)[K] : never

/** The wire-string-keyed contract consumed by `invoke`, `handle`, the preload
 *  bridge and the plugin SDK — derived from `IpcChannelShapes` + `IPC_CHANNELS`
 *  so the channel name lives in exactly one place. */
export type IpcChannelMap = {
  [K in keyof IpcChannelShapes as ChannelWire<K>]: IpcChannelShapes[K]
}

// ─── Broadcast events (main → renderer push) ────────────────────────────────
//
// Unlike invoke channels these are one-way notifications without a return
// value. The renderer subscribes via `window.electronAPI.on(IPC_EVENTS.X, …)`.
// Same single-source model as channels: the payload tuple is declared in
// `IpcEventShapes` (keyed by constant name) and the wire string lives once in
// `IPC_EVENTS`; `IpcEventMap` is derived from the two.

export interface IpcEventShapes {
  /** Stream events for an in-flight AI chat (delta tokens, tool calls, …). */
  AI_CHAT_EVENT: [event: AIStreamEvent]
  /** Stream events for an in-flight explain-results stream. */
  AI_EXPLAIN_EVENT: [event:
    | { streamId: string; kind: 'token'; text: string }
    | { streamId: string; kind: 'done'; durationMs: number }
    | { streamId: string; kind: 'error'; message: string }
  ]
  /** MCP server requested user approval for a sensitive action. */
  MCP_APPROVAL_REQUEST: [request: import('./mcp').MCPApprovalRequest]
  /** MCP server recorded a tool call. */
  MCP_ACTIVITY_EVENT: [entry: import('./mcp').MCPActivityEntry]
  /** A new entry was appended to the app activity log. */
  ACTIVITY_EVENT: [entry: ActivityEntry]
  /** A coalesced batch of newly-appended activity entries (oldest-first within
   *  the batch). The main process buffers entries and flushes them on a short
   *  timer / size threshold so a busy stream is one IPC round-trip, not N. */
  ACTIVITY_BATCH: [entries: ActivityEntry[]]
  /**
   * The native application menu invoked a command (click or accelerator).
   * One event for the whole menu: the renderer owns every command's
   * implementation and looks it up by id, so the native menu and the app-drawn
   * bar can't drift apart. The tree itself lives in `shared/menus.ts`.
   */
  MENU_ACTION: [action: MenuActionId]
  /** A plugin transitioned through its lifecycle. */
  PLUGINS_LIFECYCLE: [payload: { name: string; event: 'activated' | 'deactivated' | 'installed' | 'uninstalled' }]
  /** Plugin UI contributions have changed; renderer should refetch. */
  PLUGINS_UI_CONTRIBUTIONS_CHANGED: []
  /** A setting changed; renderer mirrors should refresh. Sent as two positional
   *  args — `keyPath` (or a category name on reset) and the new value — matching
   *  the renderer listener in `stores/settings.ts`. */
  SETTINGS_CHANGED: [keyPath: string, value: unknown]
  /** A plugin requested a toast notification. */
  NOTIFICATIONS_SHOW: [payload: { kind?: 'info' | 'success' | 'warning' | 'error'; title: string; message?: string; durationMs?: number }]
  /** The set of registered themes changed. */
  THEMES_CHANGED: []
  /** The AI asked to perform an in-app action; the renderer runs it. */
  APP_ACTION_PERFORM: [payload: { requestId: string; actionId: string; params: Record<string, unknown> }]
  /** The window's maximise state changed — the custom title bar swaps its
   *  maximise/restore icon in response. */
  WINDOW_MAXIMIZE_CHANGED: [isMaximized: boolean]
  /** Progress update for an in-flight `updater:update` install. */
  UPDATER_PROGRESS: [payload:
    | { phase: 'idle' }
    | { phase: 'checking' }
    | { phase: 'downloading'; percent?: number }
    | { phase: 'installing' }
    | { phase: 'done'; restartRequired: boolean }
    | { phase: 'error'; message: string }
  ]
}

export const IPC_EVENTS = {
  AI_CHAT_EVENT: 'ai:chat:event',
  AI_EXPLAIN_EVENT: 'ai:explain:event',
  MCP_APPROVAL_REQUEST: 'mcp:approval-request',
  MCP_ACTIVITY_EVENT: 'mcp:activity-event',
  ACTIVITY_EVENT: 'activity:event',
  ACTIVITY_BATCH: 'activity:batch',
  MENU_ACTION: 'menu:action',
  PLUGINS_LIFECYCLE: 'plugins:lifecycle',
  PLUGINS_UI_CONTRIBUTIONS_CHANGED: 'plugins:ui:contributions-changed',
  SETTINGS_CHANGED: 'settings:changed',
  NOTIFICATIONS_SHOW: 'notifications:show',
  THEMES_CHANGED: 'themes:changed',
  UPDATER_PROGRESS: 'updater:progress',
  APP_ACTION_PERFORM: 'app:action:perform',
  WINDOW_MAXIMIZE_CHANGED: 'window:maximize-changed'
} as const satisfies Record<keyof IpcEventShapes, string>

/** The union of every event's wire string (e.g. `'ai:chat:event'`). */
export type IpcEvent = (typeof IPC_EVENTS)[keyof typeof IPC_EVENTS]

type EventWire<K extends keyof IpcEventShapes> =
  K extends keyof typeof IPC_EVENTS ? (typeof IPC_EVENTS)[K] : never

/** The wire-string-keyed event contract, derived from `IpcEventShapes` +
 *  `IPC_EVENTS` so each event name lives in exactly one place. */
export type IpcEventMap = {
  [K in keyof IpcEventShapes as EventWire<K>]: IpcEventShapes[K]
}
