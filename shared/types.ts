export type DatabaseType = 'postgresql' | 'mysql' | 'sqlite' | (string & {})

export interface ConnectionProfile {
  id: string
  name: string
  type: DatabaseType
  host?: string
  port?: number
  database: string
  username?: string
  password?: string
  ssl?: boolean
  color?: string
  group?: string
  queryTimeout?: number
  readOnly?: boolean
  defaultAutoCommit?: boolean
}

export interface FieldInfo {
  name: string
  dataType: string
  nullable: boolean
}

export interface QueryResult {
  rows: Record<string, unknown>[]
  fields: FieldInfo[]
  rowCount: number
  duration: number
  affectedRows: number
}

/** A normalized query-plan tree node. Drivers parse their own EXPLAIN output
 *  (text or JSON) into this shape via `DbAdapter.parseQueryPlan`; the renderer
 *  renders it generically and never parses dialect-specific plan formats. */
export interface PlanNode {
  type: string
  table?: string
  cost: number
  rows: number
  actualTime?: number
  children: PlanNode[]
  details: string
}

export interface SchemaTable {
  name: string
  schema: string
  type: 'table' | 'view'
  rowCount?: number
}

// Centralised so the driver that produces these objects (e.g. postgresql's
// getSchemaObjects) and the renderer that groups them (SchemaNode.tsx) share
// the same values instead of re-typing the tag by hand — mirrors ACTIVITY_KIND.
export const SCHEMA_OBJECT_KIND = {
  VIEW: 'view',
  MATERIALIZED_VIEW: 'materialized_view',
  FUNCTION: 'function',
  PROCEDURE: 'procedure',
  TRIGGER: 'trigger',
  SEQUENCE: 'sequence',
  INDEX: 'index',
  EXTENSION: 'extension',
} as const

export type SchemaObjectKind = (typeof SCHEMA_OBJECT_KIND)[keyof typeof SCHEMA_OBJECT_KIND]

export interface SchemaObject {
  name: string
  schema: string
  kind: SchemaObjectKind
  /** Functions/procedures: argument list, e.g. "(integer, text)" */
  signature?: string
  /** Triggers/indexes: the table they're attached to */
  parent?: string
  /** Functions: return type. Indexes: 'UNIQUE' / 'PRIMARY' etc. */
  returnType?: string
  /** Free-form definition snippet, when cheaply available */
  definition?: string
}

export interface SchemaColumn {
  name: string
  dataType: string
  nullable: boolean
  defaultValue: string | null
  isPrimaryKey: boolean
  isForeignKey: boolean
  references?: { table: string; column: string }
}

export interface SchemaIndex {
  name: string
  columns: string[]
  unique: boolean
}

/** Bounds a driver's `getTableData` read. The browse ("View data") path always
 *  supplies a `limit` so a large table can't be pulled whole into memory;
 *  omitting it is an unbounded read (the export path). */
export interface TableDataOptions {
  /** Maximum number of rows to return. Omit for an unbounded read. */
  limit?: number
  /** Row offset for paging. Ignored when `limit` is omitted. */
  offset?: number
}

/** A page of a table/collection's rows plus its column metadata. */
export interface TableDataResult {
  rows: Record<string, unknown>[]
  columns: SchemaColumn[]
  /** True when more rows exist beyond the returned page. Set only for a bounded
   *  read; undefined when the whole result was returned (unbounded). */
  hasMore?: boolean
}

export interface TestConnectionResult {
  version: string
  details?: Record<string, string>
}

export interface QueryTabTxnState {
  autoCommit: boolean
  status: 'none' | 'active'
  isolationLevel?: string
  readOnly: boolean
}

export interface QueryTab {
  id: string
  type: 'query'
  title: string
  connectionId: string | null
  database: string | null
  schema: string | null
  sql: string
  results: QueryResult | null
  isExecuting: boolean
  error: string | null
  isDirty: boolean
  aiExplanation: string | null
  /** Parsed execution plan for the current results, or null. Produced by the
   *  driver (`db:parse-plan`) when results arrive; the renderer reads it to show
   *  the Query Plan tab. Empty array = results are not a plan. */
  queryPlan?: PlanNode[] | null
  /** When set, Cmd+S overwrites this saved-query record instead of prompting. */
  savedQueryId?: string
  /** Last saved SQL content. `isDirty` is true iff sql !== savedSnapshot. */
  savedSnapshot?: string
  txn?: QueryTabTxnState
}

export interface TableTab {
  id: string
  type: 'table'
  title: string
  connectionId: string
  tableName: string
  schema: string
}

export interface ErDiagramTab {
  id: string
  type: 'er-diagram'
  title: string
  connectionId: string
  schema: string
}

export interface ConnectionFormTab {
  id: string
  type: 'connection-form'
  title: string
  editingId?: string
}

export interface PluginDetailTab {
  id: string
  type: 'plugin-detail'
  title: string
  pluginName: string
}

export interface InstallPluginTab {
  id: string
  type: 'install-plugin'
  title: string
}

export interface SettingsTab {
  id: string
  type: 'settings'
  title: string
}

/** The first-run "Get Started" walkthrough (VS Code-style Welcome). A singleton
 *  tab opened on a fresh install and re-openable from Help → Welcome. */
export interface WelcomeTab {
  id: string
  type: 'welcome'
  title: string
}

/** A version's "What's New" release notes, rendered from the curated registry.
 *  One tab per version (id keyed by version); the title is the version itself
 *  (e.g. "v1.2.0"). Opened automatically after an update and from Help. */
export interface ReleaseNotesTab {
  id: string
  type: 'release-notes'
  title: string
  version: string
}

export type Tab = QueryTab | TableTab | ErDiagramTab | ConnectionFormTab | PluginDetailTab | InstallPluginTab | SettingsTab | WelcomeTab | ReleaseNotesTab
