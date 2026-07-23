/**
 * Schema model. Engine-agnostic on purpose: nothing here names a vendor,
 * a dialect, or "SQL". Adapters map a live catalogue onto these shapes.
 */

/** Crow's-foot cardinality. Minimum participation + maximum participation. */
export type Cardinality = 'one' | 'zero-or-one' | 'many' | 'zero-or-many'

export type KeyRole = 'pk' | 'fk' | 'pfk' | 'uq' | null

export interface Column {
  name: string
  /** Rendered verbatim on the right of the row. Keep it short. */
  type: string
  role?: KeyRole
  nullable?: boolean
}

export interface Entity {
  id: string
  /** Optional namespace shown as an eyebrow above the name. */
  namespace?: string
  name: string
  columns: Column[]
}

export interface Relationship {
  id: string
  /** Referencing side (holds the foreign key). */
  from: string
  fromColumn?: string
  /** Referenced side. */
  to: string
  toColumn?: string
  /** Cardinality at the `from` end. Defaults to zero-or-many. */
  fromCardinality?: Cardinality
  /** Cardinality at the `to` end. Defaults to one. */
  toCardinality?: Cardinality
  /**
   * Identifying relationships (FK participates in the child's primary key)
   * draw solid. Non-identifying draw dashed. This is the IE convention.
   */
  identifying?: boolean
}

export interface Diagram {
  entities: Entity[]
  relationships: Relationship[]
}

export const DEFAULT_FROM: Cardinality = 'zero-or-many'
export const DEFAULT_TO: Cardinality = 'one'

/** Index entities by id once, so hot paths never scan the array. */
export function indexEntities(d: Diagram): Map<string, Entity> {
  const m = new Map<string, Entity>()
  for (const e of d.entities) m.set(e.id, e)
  return m
}

/** Drops relationships that point at entities outside the diagram. */
export function pruneRelationships(d: Diagram): Relationship[] {
  const ids = new Set(d.entities.map((e) => e.id))
  return d.relationships.filter((r) => ids.has(r.from) && ids.has(r.to))
}
