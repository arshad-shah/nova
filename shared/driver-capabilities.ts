import type { DbErrorRule } from './db-errors'

/** What transaction semantics a driver supports. All fields are data-only
 *  (no functions) so this serializes cleanly over IPC. */
export interface SessionCapability {
  autoCommit: boolean
  manualTransactions: boolean
  isolationLevels?: string[]
  readOnly?: boolean
  savepoints?: boolean
  /** What this engine calls a transaction. Defaults to "Transaction". */
  transactionLabel?: string
  /** 'full' = real rollback (PG/MySQL); 'discard' = best-effort (Redis DISCARD). */
  rollbackKind?: 'full' | 'discard'
}

export interface ExplainCapability {
  supportsAnalyze: boolean
  /** 'tree' = renderer draws an ExplainNode tree; 'text' = raw plan text. */
  format: 'tree' | 'text'
  /** The statement prepended to a query to produce its plan — e.g.
   *  'EXPLAIN ANALYZE' (Postgres/MySQL), 'EXPLAIN QUERY PLAN' (SQLite),
   *  'EXPLAIN' (Snowflake). The renderer prepends this verbatim and never
   *  hardcodes an EXPLAIN dialect. Drivers that can't explain omit the whole
   *  `explain` capability, which hides the Explain action. */
  statement: string
}

export interface InspectionCapability {
  canKill: boolean
}

/** Whether a driver can repoint a live connection at a different database
 *  without reconnecting. Data-only so it serializes over IPC. The renderer gates
 *  the database selector on `supported`; the `switchDatabase` adapter method is
 *  the implementation half the factory validates against this declaration
 *  (see driver-validation.ts). */
export interface DatabaseSwitchCapability {
  supported: boolean
}

/** A singular/plural noun pair the driver uses for one of its data concepts. */
export interface DataNoun {
  /** Singular, lower-case (e.g. "table", "collection", "key"). */
  one: string
  /** Plural, lower-case (e.g. "tables", "collections", "keys"). */
  many: string
}

/** What a driver calls its core data concepts, so the shell can describe schema
 *  objects without assuming a relational/SQL model. Each is a display label the
 *  driver supplies; the renderer falls back to a generic, i18n'd noun when a
 *  driver omits one (the same pattern as `session.transactionLabel`). Examples:
 *    SQL    → object: table,      field: column, record: row
 *    Mongo  → object: collection, field: field,  record: document
 *    Redis  → object: key,        field: field,  record: entry */
export interface DataNouns {
  /** Top-level data container: table / collection / key. */
  object?: DataNoun
  /** A field within an object: column / field. */
  field?: DataNoun
  /** A single record: row / document / entry. */
  record?: DataNoun
}

/**
 * A driver's visual identity, in semantic terms the driver owns and the
 * renderer interprets.
 *
 * The tone is deliberately semantic ('accent', 'error', …) rather than a colour
 * or a class name: the driver says what it *is*, and each surface decides how to
 * paint that — a badge tone in one place, a text colour in another. A driver
 * shipping `text-emerald-400` would be reaching into the renderer's design
 * system from the other side of an IPC boundary.
 */
export type DriverTone = 'accent' | 'success' | 'warning' | 'error' | 'info' | 'neutral'

export interface DriverPresentation {
  /**
   * Short chip label, conventionally two characters ('PG', 'MG'). The renderer
   * falls back to the first two letters of the driver id, so a
   * plugin-contributed driver still renders sensibly without declaring one.
   */
  abbreviation?: string
  /** Semantic tone for this driver's chip/badge. Defaults to 'neutral'. */
  tone?: DriverTone
}

/** Options when opening a session or beginning a transaction. */
export interface SessionOpts {
  autoCommit?: boolean
  readOnly?: boolean
  isolationLevel?: string
}

/** Per-connection overlay a driver may apply at connect time. Deliberately a
 *  narrow subset — it can only flip pre-existing fields, never add new
 *  capability kinds or change explain.format. */
export interface RuntimeCapabilityOverlay {
  // structural fields (rollbackKind, transactionLabel, savepoints, autoCommit) are set at factory time and never overridden at connect time
  session?: Partial<Pick<SessionCapability, 'manualTransactions' | 'isolationLevels' | 'readOnly'>>
  sessionInspection?: Partial<InspectionCapability>
}

/** Serializable, function-free capabilities the renderer consumes. */
export interface DriverCapabilities {
  /** Free-form dialect tag — the renderer treats this as a label, not a
   *  discriminator. Branching on the connection's `type` is forbidden;
   *  see tests/unit/export-import-no-hardcoding.test.ts. */
  sqlDialect?: string
  editorLanguage?: string
  /** Which built-in statement-splitting dialect the renderer's statement gutter
   *  (CodeLens "Run/Explain" overlay) should use for this driver — e.g. `'sql'`,
   *  `'redis'`, `'mongodb'`. The driver *declares* it; the renderer owns the
   *  generic, Monaco-coupled splitter implementations and selects one by this id
   *  (no hardcoded db-type enumeration). Omit for drivers with no statements. */
  statementSyntax?: string
  /** Driver-contributed error-classification rules for this dialect's
   *  query-semantic errors (bad column/table, syntax, constraints, …). The
   *  renderer matches them to classify errors and pick a friendly message,
   *  instead of hardcoding per-dialect error text. */
  errorRules?: DbErrorRule[]
  defaultSchemaUseConnectionDatabase?: boolean
  defaultSchemaCandidates?: string[]
  hasSampleQuery: boolean
  hasGetTableData: boolean
  /** Driver-supplied nouns for its data concepts (object/field/record), so the
   *  shell can label the schema explorer without assuming SQL terminology.
   *  Omitted nouns fall back to generic words in the renderer. */
  nouns?: DataNouns
  /** How this driver identifies itself visually — its chip label and semantic
   *  tone. Before this existed, three components each hardcoded their own
   *  driver-id → label/colour map, and they had already drifted: two omitted
   *  snowflake, and mongodb was a different colour in each. The renderer must
   *  not decide what a driver looks like; the driver declares it once here and
   *  the renderer maps the tone to its own treatment. Omitted values fall back
   *  in the renderer, so plugin drivers need not declare it. */
  presentation?: DriverPresentation
  session?: SessionCapability
  explain?: ExplainCapability
  sessionInspection?: InspectionCapability
  /** Whether the driver can switch the active database on a live connection.
   *  The renderer gates the database selector on this instead of discovering
   *  support by catching a thrown error. Omit ⇒ no in-connection switch. */
  databaseSwitch?: DatabaseSwitchCapability
}

/**
 * Merge a per-connection overlay over static capabilities. The overlay can only
 * affect a block the driver already declared structurally — you cannot enable a
 * capability a driver never advertised. Pure; never mutates `base`.
 */
export function mergeCapabilities(
  base: DriverCapabilities,
  overlay: RuntimeCapabilityOverlay | null | undefined
): DriverCapabilities {
  if (!overlay) return base
  return {
    ...base,
    session: base.session ? { ...base.session, ...overlay.session } : base.session,
    sessionInspection: base.sessionInspection
      ? { ...base.sessionInspection, ...overlay.sessionInspection }
      : base.sessionInspection,
  }
}
