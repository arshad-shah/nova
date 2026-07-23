/**
 * Adapter: the driver's introspection output (plain entities and references
 * from the schema store) mapped onto the engine-agnostic {@link Diagram} shape.
 * This is the only file that knows the shape of a `SchemaColumn`; the renderer
 * downstream never learns which driver produced the catalogue, which keeps the
 * DB-agnostic contract intact.
 */
import type { SchemaColumn } from '@shared/types'
import type { Column, Diagram, KeyRole, Relationship } from './model'

export interface AdapterTable {
  name: string
  columns: SchemaColumn[]
}

function roleOf(col: SchemaColumn): KeyRole {
  if (col.isPrimaryKey && col.isForeignKey) return 'pfk'
  if (col.isPrimaryKey) return 'pk'
  if (col.isForeignKey) return 'fk'
  return null
}

/** Build a diagram from a set of tables and their columns. */
export function buildDiagram(tables: AdapterTable[]): Diagram {
  const names = new Set(tables.map((t) => t.name))

  const entities = tables.map((table) => ({
    id: table.name,
    name: table.name,
    columns: table.columns.map((c): Column => {
      const role = roleOf(c)
      return {
        name: c.name,
        type: c.dataType,
        ...(role ? { role } : {}),
        nullable: c.nullable,
      }
    }),
  }))

  const relationships: Relationship[] = []
  for (const table of tables) {
    for (const col of table.columns) {
      if (col.isForeignKey && col.references && names.has(col.references.table)) {
        relationships.push({
          id: `${table.name}.${col.name}->${col.references.table}.${col.references.column}`,
          from: table.name,
          fromColumn: col.name,
          to: col.references.table,
          toColumn: col.references.column,
          // The FK sitting in the child's primary key is an identifying
          // relationship (solid connector); otherwise non-identifying (dashed).
          identifying: col.isPrimaryKey,
        })
      }
    }
  }

  return { entities, relationships }
}
