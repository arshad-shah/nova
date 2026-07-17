// src/main/plugins/sdk/types.ts
import type { ConnectionProfile, QueryResult, SchemaTable, SchemaColumn, SchemaIndex } from '@shared/types'
import type { DbAdapter } from '../../db/adapter'
import type { UIRegistry } from './ui-registry'
import type { CompletionRegistry } from './completion-registry'
import type { AIAccess } from './ai-access'
import type { SessionCapability, ExplainCapability, InspectionCapability, RuntimeCapabilityOverlay, DataNouns, DriverPresentation } from '@shared/driver-capabilities'
import type { DbErrorRule } from '@shared/db-errors'
import type { JsonSchemaObject } from './tool-schema'
import { TOOL_PERMISSION, type ToolPermission } from '@shared/mcp'
export type { DriverCapabilities } from '@shared/driver-capabilities'
export { TOOL_PERMISSION, type ToolPermission }

/** Which surfaces may call a tool. Named once so the `bundled/ai` producer and
 *  the MCP server's `surfaces.includes(...)` gate (`mcp/server.ts`) reference
 *  the same values instead of re-typing them. */
export const TOOL_SURFACE = {
  AI: 'ai',
  MCP: 'mcp',
} as const
export type ToolSurface = (typeof TOOL_SURFACE)[keyof typeof TOOL_SURFACE]

// ─── Core ────────────────────────────────────────────────────────────────────

export interface Disposable {
  dispose(): void
}

/** Boot-lifecycle phases, named once so `plugin-host.ts` stops re-typing the
 *  raw string when it tags an error with the phase it failed in. */
export const PLUGIN_PHASE = {
  DISCOVER: 'discover',
  VALIDATE: 'validate',
  RESOLVE: 'resolve',
  ACTIVATE: 'activate',
  VERIFY: 'verify',
  RUNTIME: 'runtime',
} as const

export type PluginPhase = (typeof PLUGIN_PHASE)[keyof typeof PLUGIN_PHASE]

export type PluginStatus =
  | { state: 'discovered' }
  | { state: 'validated' }
  | { state: 'resolved' }
  | { state: 'activating' }
  | { state: 'active'; contributions: string[] }
  | { state: 'error'; error: string; phase: PluginPhase }
  | { state: 'degraded'; error: string; contributions: string[] }
  | { state: 'inactive' }

export interface PluginErrorRecord {
  timestamp: number
  error: string
  stack?: string
}

// ─── Plugin Context ──────────────────────────────────────────────────────────

export interface PluginContext {
  drivers: DriverRegistry
  commands: CommandRegistry
  tools: ToolRegistry
  panels: PanelRegistry
  ui: UIRegistry
  completions: CompletionRegistry
  schema: SchemaAccess
  connections: ConnectionAccess
  settings: PluginSettings
  keyring: KeyringAccess
  ai: AIAccess
  ipc: PluginIpc
  broadcast: BroadcastFn
  services: import('./service-registry').ServiceRegistry
  exporters: PluginExporterAccess
  importers: PluginImporterAccess
  formatters: PluginFormatterAccess
  typeMappers: PluginTypeMapperAccess
  themes: PluginThemeAccess
  notifications: PluginNotificationAccess
  dragDrop: PluginDragDropAccess
  /** Bundled/trusted plugins occasionally need raw access to top-level app
   *  settings (e.g. `ai.activeProvider`) rather than their own namespaced
   *  scope under `plugins.<name>.*`. */
  rootSettings: { get(key: string): unknown; set(key: string, value: unknown): void }
  subscriptions: Disposable[]
}

export interface PluginExporterAccess {
  register(
    id: string,
    exporter: import('./exporter-registry').RegisteredExporter
  ): Disposable
}

export interface PluginImporterAccess {
  register(
    id: string,
    importer: import('./importer-registry').RegisteredImporter
  ): Disposable
}

export interface PluginFormatterAccess {
  register(
    id: string,
    formatter: import('./formatter-registry').RegisteredFormatter
  ): Disposable
}

export interface PluginTypeMapperAccess {
  register(
    from: string,
    to: string,
    table: Record<string, import('./type-mapper-registry').TypeMappingEntry>,
    fallback?: import('./type-mapper-registry').TypeMappingFallback
  ): Disposable
}

export interface PluginThemeAccess {
  register(theme: import('./theme-registry').RegisteredTheme): Disposable
}

export interface PluginNotificationAccess {
  show(notification: {
    kind?: 'info' | 'success' | 'warning' | 'error'
    title: string
    message?: string
    durationMs?: number
  }): void
}

export interface PluginDragDropAccess {
  register(provider: import('./drag-drop-registry').DragDropProvider): Disposable
}

/** Lets a plugin own typed IPC channels in main → renderer direction. */
export interface PluginIpc {
  handle<K extends keyof import('@shared/ipc').IpcChannelMap>(
    channel: K,
    handler: (...args: import('@shared/ipc').IpcChannelMap[K]['args']) =>
      | import('@shared/ipc').IpcChannelMap[K]['return']
      | Promise<import('@shared/ipc').IpcChannelMap[K]['return']>
  ): Disposable
}

/** Sends an event from main to all renderer windows. */
export type BroadcastFn = (channel: string, ...args: unknown[]) => void

// ─── Driver Registry ─────────────────────────────────────────────────────────

export interface DriverRegistry {
  register(id: string, factory: DriverFactory): Disposable
  registerConnectionMiddleware(id: string, middleware: ConnectionMiddleware): Disposable
}

/** Prepared-statement placeholder style. `'numbered'` renders `$1`, `$2`, …
 *  (Postgres); `'positional'` renders `?` (MySQL / SQLite / Snowflake). */
export type PlaceholderStyle = 'numbered' | 'positional'

export interface DriverFactory {
  createAdapter(config: Record<string, unknown>): DbAdapter
  connectionFields: ConnectionField[]
  /** Free-form dialect tag — anything the driver wants to call itself. The
   *  orchestrator never branches on this; consumers that previously did now
   *  use the structural `quoteChar` / `placeholder` capabilities instead.
   *  Kept around because some plugin contributions still want to badge
   *  themselves ("SQL (PostgreSQL)") in their displayName. */
  sqlDialect?: string
  /** Identifier-quoting character for this driver's dialect. `"` for
   *  Postgres / SQLite / Snowflake, `` ` `` for MySQL. SDK helpers like
   *  `quoteIdentifier` and `generateCreateTable` take this verbatim so
   *  the main app never has to know which driver uses which character. */
  quoteChar?: string
  /** Prepared-statement placeholder style. `'numbered'` ⇒ `$1`, `$2`
   *  (Postgres); `'positional'` ⇒ `?` (MySQL / SQLite / Snowflake). Declarative
   *  (was a `placeholder(index)` function) so the descriptor is serializable and
   *  the driver can be process-isolated — see docs/plugin-security.md. The
   *  generic CSV-into-table importer renders placeholders from this style via
   *  the SDK's `renderPlaceholder`. */
  placeholderStyle?: PlaceholderStyle
  /** Monaco editor language used for queries against this driver. Defaults to
   *  'sql' when omitted. The renderer never branches on connection type. */
  editorLanguage?: string
  /** Built-in statement-splitting dialect for the renderer's statement gutter
   *  (CodeLens "Run/Explain" per statement): `'sql'`, `'redis'`, or `'mongodb'`.
   *  The driver declares which generic splitter the renderer should use; the
   *  renderer owns the (Monaco-coupled) splitter implementations. Omit to
   *  disable the per-statement gutter for this driver. */
  statementSyntax?: string
  /** Error-classification rules for this dialect's query-semantic errors
   *  (bad column/table/schema, syntax, constraint violations, type mismatch,
   *  duplicate table, division-by-zero, deadlock, aborted txn). The renderer
   *  matches them (driver rules first, then host app/connection rules) to show a
   *  friendly message — so per-dialect error text lives in the driver, not the
   *  host. See shared/db-errors.ts. */
  errorRules?: DbErrorRule[]
  /** When true, prefer the connection's `database` field as the default
   *  schema in the renderer (MySQL semantics: schemas == databases). */
  defaultSchemaUseConnectionDatabase?: boolean
  /** Ordered list of schema names the renderer should try when picking a
   *  default. First match in the live schema list wins. Examples:
   *  postgres ⇒ ['public']; sqlite ⇒ ['main']; snowflake ⇒ ['PUBLIC', 'public']. */
  defaultSchemaCandidates?: string[]
  /** Returns a sample/preview query for a table. REQUIRED for SQL drivers;
   *  non-SQL drivers (mongo, redis) implement whatever "show me some
   *  records" means for their model. The orchestrator no longer guesses
   *  a fallback — drivers own this. Async so a process-isolated driver can
   *  answer over the RPC bridge. */
  sampleQuery?(table: string, schema?: string): Promise<string>
  /** Reads every row of a table/collection for export. The driver decides how
   *  (SQL SELECT, Mongo find, Redis SCAN, …); the orchestrator never assumes
   *  the source is a relational database. Must use safe identifier escaping
   *  for whichever query language it speaks. */
  getTableData?(adapter: DbAdapter, table: string, schema?: string): Promise<{
    rows: Record<string, unknown>[]
    columns: SchemaColumn[]
  }>
  /** Emit a CREATE TABLE for a migration target. Lets the orchestrator route
   *  the structural conversion to the receiving driver — Postgres / MySQL /
   *  SQLite each have their own quirks (SQLite's INTEGER-PRIMARY-KEY rowid
   *  alias, MySQL's storage-engine clauses, etc.) that no longer have to
   *  be hardcoded in main/. Returns the DDL string; the orchestrator owns
   *  the surrounding migration report. */
  generateMigrationDdl?(
    tableName: string,
    columns: { name: string; dataType: string; nullable: boolean; isPrimaryKey: boolean; defaultValue: string | null }[],
  ): Promise<string>
  /** Nouns this driver uses for its data concepts (object/field/record), so the
   *  schema explorer can label things in the driver's own terms instead of
   *  assuming SQL "table/column/row". Omit ⇒ the renderer uses generic words. */
  nouns?: DataNouns
  /** How this driver identifies itself visually: a short chip label and a
   *  SEMANTIC tone the renderer maps to its own treatment (a badge tone in the
   *  connection list, a text colour in the switcher). The driver says what it
   *  is; the renderer decides how to paint it — a driver shipping a colour or a
   *  class name would be reaching into the renderer's design system.
   *  Omit ⇒ the renderer falls back to the first two letters of the driver id
   *  and a neutral tone, so a plugin driver renders sensibly without declaring
   *  anything. */
  presentation?: DriverPresentation
  /** Transaction / auto-commit / read-only capabilities. Omit ⇒ no txn UI. */
  session?: SessionCapability
  /** Execution-plan capabilities. Omit ⇒ no Explain action. */
  explain?: ExplainCapability
  /** Active-session (process) inspection. Omit ⇒ no Sessions panel. */
  sessionInspection?: InspectionCapability
  /** Optional per-connection overlay resolved at connect time (e.g. Mongo
   *  replica-set topology). SQL drivers omit it. */
  getRuntimeCapabilities?(adapter: DbAdapter): Promise<RuntimeCapabilityOverlay>
}

export interface ConnectionField {
  key: string
  label: string
  type: 'text' | 'password' | 'number' | 'boolean' | 'file' | 'file-path' | 'select'
  required?: boolean
  default?: string | number | boolean
  group?: string
  fetchable?: boolean
  step?: number
  /** Static options for non-fetchable select fields */
  options?: { value: string; label: string }[]
  /** Comma-separated extension filter for `file` / `file-path` fields
   *  (e.g. `.db,.sqlite`). Used by both the file picker and drag-drop. */
  accept?: string
}

export interface ConnectionMiddleware {
  shouldApply(profile: ConnectionProfile): boolean
  beforeConnect(profile: ConnectionProfile): Promise<ConnectionProfile>
  onDisconnect(profileId: string): Promise<void>
}

// ─── Tool Registry ───────────────────────────────────────────────────────────

export interface ToolContext {
  connectionId: string | null
  abortSignal: AbortSignal
}

export interface ToolResult {
  success: boolean
  data: unknown
  display?: string
}

export interface Tool {
  id: string
  name: string
  description: string
  /** JSON Schema for the tool's params — serializable, so the tool can be
   *  registered from a process-isolated plugin. Authors typically build it with
   *  the SDK's `toJsonSchema(z.object({ … }))`. */
  inputSchema: JsonSchemaObject
  permission: ToolPermission
  /**
   * Which surfaces may call this tool. Omitted = all surfaces (back-compat).
   * UI-action tools that need the renderer set this to `['ai']` so they are not
   * exposed to the headless MCP server.
   */
  surfaces?: ToolSurface[]
  execute(params: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult>
}

/** JSON-Schema tool definition handed to LLM providers. */
export interface ToolDefinition {
  name: string
  description: string
  parameters: Record<string, unknown>
}

export interface ToolRegistry {
  register(tool: Tool): Disposable
  unregister(id: string): void
  get(id: string): Tool | undefined
  list(): Tool[]
  getToolDefinitions(): ToolDefinition[]
  execute(id: string, params: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult>
  onChange(cb: () => void): Disposable
}

// ─── Command Registry ────────────────────────────────────────────────────────

export interface CommandRegistry {
  register(id: string, handler: (payload?: Record<string, unknown>) => void | Promise<void>): Disposable
}

// ─── Panel Registry ──────────────────────────────────────────────────────────

export interface PanelRegistry {
  register(id: string, panel: PanelContribution): Disposable
}

export interface PanelContribution {
  title: string
  icon: string
  location: 'sidebar' | 'secondary' | 'bottom'
  render(): string
}

// ─── Schema Access ───────────────────────────────────────────────────────────

export interface SchemaSummary {
  tables: {
    name: string
    columns: {
      name: string
      dataType: string
      isPrimaryKey: boolean
      isForeignKey: boolean
      references?: { table: string; column: string }
    }[]
  }[]
}

export interface SchemaAccess {
  getTables(connectionId: string, schema?: string): Promise<SchemaTable[]>
  getColumns(connectionId: string, table: string, schema?: string): Promise<SchemaColumn[]>
  getIndexes(connectionId: string, table: string, schema?: string): Promise<SchemaIndex[]>
  getSchemas(connectionId: string): Promise<string[]>
  getDatabases(connectionId: string): Promise<string[]>
  getSchemaSummary(connectionId: string, schema?: string): Promise<SchemaSummary>
}

// ─── Connection Access ───────────────────────────────────────────────────────

export interface ConnectionAccess {
  getActiveConnectionId(): string | null
  getProfile(connectionId: string): ConnectionProfile | null
  query(connectionId: string, sql: string, params?: unknown[]): Promise<QueryResult>
  /**
   * Best-effort cancel of any query currently running on the given connection.
   * Drivers that don't expose cancellation are no-ops. Safe to call when no
   * query is in flight.
   */
  cancelQuery(connectionId: string): void
  onActiveConnectionChanged(listener: (id: string | null) => void): Disposable
}

// ─── Plugin Settings ─────────────────────────────────────────────────────────

export interface PluginSettings {
  get<T>(key: string): T | undefined
  set(key: string, value: unknown): void
  onChanged(key: string, listener: (value: unknown) => void): Disposable
}

// ─── Keyring Access ─────────────────────────────────────────────────────────

export interface KeyringAccess {
  store(profileId: string, key: string, value: string): Promise<void>
  retrieve(profileId: string, key: string): Promise<string | null>
  delete(profileId: string, key: string): Promise<void>
  /** Sync read used on hot paths (e.g. API key on each request). The single
   *  source of truth is the in-memory cache loaded at startup. */
  retrieveSync(profileId: string, key: string): string | null
  storeSync(profileId: string, key: string, value: string): void
  has(profileId: string, key: string): boolean
  /** Returns all stored key names for a profile (field portion of `profileId:key`). */
  listKeys(profileId: string): string[]
}

// ─── Boot Report ─────────────────────────────────────────────────────────────

export interface BootReport {
  total: number
  active: number
  degraded: number
  failed: number
  plugins: { name: string; status: PluginStatus; durationMs: number }[]
}
