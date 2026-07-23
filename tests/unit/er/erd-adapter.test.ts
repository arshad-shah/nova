/**
 * The adapter is the one place that knows a `SchemaColumn`. It must map key
 * roles and foreign-key references onto the engine-agnostic diagram shape
 * exactly, and drop references that point outside the visible schema.
 */
import { describe, it, expect } from 'vitest'
import { buildDiagram } from '../../../src/renderer/src/components/er/adapter'
import type { SchemaColumn } from '../../../shared/types'

const col = (name: string, o: Partial<SchemaColumn> = {}): SchemaColumn => ({
  name,
  dataType: o.dataType ?? 'text',
  nullable: o.nullable ?? true,
  defaultValue: o.defaultValue ?? null,
  isPrimaryKey: o.isPrimaryKey ?? false,
  isForeignKey: o.isForeignKey ?? false,
  references: o.references,
})

describe('buildDiagram — key roles', () => {
  it('maps pk / fk / pfk / plain onto column roles', () => {
    const d = buildDiagram([
      { name: 't', columns: [
        col('a', { isPrimaryKey: true }),
        col('b', { isForeignKey: true, references: { table: 't', column: 'a' } }),
        col('c', { isPrimaryKey: true, isForeignKey: true, references: { table: 't', column: 'a' } }),
        col('d'),
      ] },
    ])
    const roles = Object.fromEntries(d.entities[0].columns.map((c) => [c.name, c.role]))
    expect(roles).toEqual({ a: 'pk', b: 'fk', c: 'pfk', d: undefined })
  })

  it('carries the nullable flag through', () => {
    const d = buildDiagram([
      { name: 't', columns: [col('a', { nullable: false }), col('b', { nullable: true })] },
    ])
    expect(d.entities[0].columns.map((c) => c.nullable)).toEqual([false, true])
  })
})

describe('buildDiagram — relationships', () => {
  it('derives a relationship from every in-schema foreign key', () => {
    const d = buildDiagram([
      { name: 'orders', columns: [
        col('id', { isPrimaryKey: true }),
        col('customer_id', { isForeignKey: true, references: { table: 'customers', column: 'id' } }),
      ] },
      { name: 'customers', columns: [col('id', { isPrimaryKey: true })] },
    ])
    expect(d.relationships).toHaveLength(1)
    expect(d.relationships[0]).toMatchObject({
      from: 'orders',
      fromColumn: 'customer_id',
      to: 'customers',
      toColumn: 'id',
    })
  })

  it('drops a foreign key that references a table outside the diagram', () => {
    const d = buildDiagram([
      { name: 'orders', columns: [
        col('id', { isPrimaryKey: true }),
        col('warehouse_id', { isForeignKey: true, references: { table: 'warehouses', column: 'id' } }),
      ] },
    ])
    expect(d.relationships).toHaveLength(0)
  })

  it('marks a FK inside the primary key as identifying, otherwise not', () => {
    const d = buildDiagram([
      { name: 'membership', columns: [
        col('user_id', { isPrimaryKey: true, isForeignKey: true, references: { table: 'users', column: 'id' } }),
        col('team_id', { isForeignKey: true, references: { table: 'teams', column: 'id' } }),
      ] },
      { name: 'users', columns: [col('id', { isPrimaryKey: true })] },
      { name: 'teams', columns: [col('id', { isPrimaryKey: true })] },
    ])
    const byFrom = Object.fromEntries(d.relationships.map((r) => [r.fromColumn, r.identifying]))
    expect(byFrom).toEqual({ user_id: true, team_id: false })
  })
})
