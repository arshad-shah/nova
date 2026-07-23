/**
 * Geometry invariants for the handrolled ERD renderer. `layout.ts` and
 * `route.ts` carry no drawing calls, so every claim the diagram makes about
 * where things sit is testable headless — which is the whole point of the split
 * (issue #189). If one of these fails, the painter is drawing a lie.
 */
import { describe, it, expect } from 'vitest'
import { buildCards, MIN_W, MAX_W, type Card } from '../../../src/renderer/src/components/er/metrics'
import { layout, type Direction } from '../../../src/renderer/src/components/er/layout'
import { route } from '../../../src/renderer/src/components/er/route'
import { symbol, SYM_MAX, SYM_MIN } from '../../../src/renderer/src/components/er/notation'
import type { Diagram } from '../../../src/renderer/src/components/er/model'
import type { ErdTheme } from '../../../src/renderer/src/components/er/theme-bridge'

// buildCards only reads the `font*` fields (as opaque strings handed to the
// measurer); colours are never touched by geometry, so a stub suffices.
const THEME = {
  fontTitle: '600 14px sans-serif',
  fontEyebrow: '500 10px sans-serif',
  fontRow: '450 12px sans-serif',
  fontType: '450 11px sans-serif',
} as unknown as ErdTheme

/** Deterministic headless measurer, mirroring the metrics fallback. */
const measure = (text: string): number => text.length * 6.4

function build(diagram: Diagram, direction: Direction = 'LR') {
  const cards = buildCards(diagram.entities, THEME, measure)
  layout(cards, diagram.relationships, { direction })
  const routes = route(cards, diagram.relationships)
  const byId = new Map(cards.map((c) => [c.id, c]))
  return { cards, routes, byId }
}

/** A clean acyclic commerce schema: customers <- orders <- order_items -> products. */
const DAG: Diagram = {
  entities: [
    { id: 'customers', name: 'customers', columns: [
      { name: 'id', type: 'uuid', role: 'pk', nullable: false },
      { name: 'email', type: 'text', nullable: false },
    ] },
    { id: 'orders', name: 'orders', columns: [
      { name: 'id', type: 'uuid', role: 'pk', nullable: false },
      { name: 'customer_id', type: 'uuid', role: 'fk', nullable: false },
      { name: 'total', type: 'numeric', nullable: true },
    ] },
    { id: 'order_items', name: 'order_items', columns: [
      { name: 'id', type: 'uuid', role: 'pk', nullable: false },
      { name: 'order_id', type: 'uuid', role: 'fk', nullable: false },
      { name: 'product_id', type: 'uuid', role: 'fk', nullable: false },
      { name: 'quantity', type: 'integer', nullable: false },
    ] },
    { id: 'products', name: 'products', columns: [
      { name: 'id', type: 'uuid', role: 'pk', nullable: false },
      { name: 'sku', type: 'text', nullable: false },
    ] },
  ],
  relationships: [
    { id: 'r1', from: 'orders', fromColumn: 'customer_id', to: 'customers', toColumn: 'id' },
    { id: 'r2', from: 'order_items', fromColumn: 'order_id', to: 'orders', toColumn: 'id' },
    { id: 'r3', from: 'order_items', fromColumn: 'product_id', to: 'products', toColumn: 'id' },
  ],
}

function overlaps(a: Card, b: Card): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
}

/** Extract the axis-aligned vertical segments of a route polyline. */
function verticalSegments(pts: number[]): { x: number; y0: number; y1: number }[] {
  const segs: { x: number; y0: number; y1: number }[] = []
  for (let i = 0; i + 3 < pts.length; i += 2) {
    const x1 = pts[i]
    const y1 = pts[i + 1]
    const x2 = pts[i + 2]
    const y2 = pts[i + 3]
    if (Math.abs(x1 - x2) < 0.5 && Math.abs(y1 - y2) > 0.5) {
      segs.push({ x: x1, y0: Math.min(y1, y2), y1: Math.max(y1, y2) })
    }
  }
  return segs
}

describe('layout — placement', () => {
  it('produces no overlapping entity cards', () => {
    const { cards } = build(DAG)
    for (let i = 0; i < cards.length; i++) {
      for (let j = i + 1; j < cards.length; j++) {
        expect(overlaps(cards[i], cards[j]), `${cards[i].id} overlaps ${cards[j].id}`).toBe(false)
      }
    }
  })

  it('places a referenced entity strictly left of the entity referencing it (LR)', () => {
    const { byId } = build(DAG, 'LR')
    for (const r of DAG.relationships) {
      const parent = byId.get(r.to)!
      const child = byId.get(r.from)!
      expect(parent.x + parent.w, `${r.to} should sit left of ${r.from}`).toBeLessThanOrEqual(child.x)
    }
  })

  it('places a referenced entity strictly above the entity referencing it (TB)', () => {
    const { byId } = build(DAG, 'TB')
    for (const r of DAG.relationships) {
      const parent = byId.get(r.to)!
      const child = byId.get(r.from)!
      expect(parent.y + parent.h, `${r.to} should sit above ${r.from}`).toBeLessThanOrEqual(child.y)
    }
  })

  it('is deterministic — identical input yields identical coordinates', () => {
    const a = build(DAG)
    const b = build(DAG)
    for (const card of a.cards) {
      const other = b.byId.get(card.id)!
      expect(other.x).toBe(card.x)
      expect(other.y).toBe(card.y)
    }
  })

  it('emits integer origins so every edge lands on a pixel boundary', () => {
    const { cards } = build(DAG)
    for (const c of cards) {
      expect(Number.isInteger(c.x)).toBe(true)
      expect(Number.isInteger(c.y)).toBe(true)
    }
  })
})

describe('layout — termination on pathological schemas', () => {
  it('lays out a cyclic schema without hanging, producing finite coordinates', () => {
    const cyclic: Diagram = {
      entities: [
        { id: 'a', name: 'a', columns: [{ name: 'id', type: 'int', role: 'pk' }, { name: 'c_id', type: 'int', role: 'fk' }] },
        { id: 'b', name: 'b', columns: [{ name: 'id', type: 'int', role: 'pk' }, { name: 'a_id', type: 'int', role: 'fk' }] },
        { id: 'c', name: 'c', columns: [{ name: 'id', type: 'int', role: 'pk' }, { name: 'b_id', type: 'int', role: 'fk' }] },
      ],
      relationships: [
        { id: 'e1', from: 'a', fromColumn: 'c_id', to: 'c', toColumn: 'id' },
        { id: 'e2', from: 'b', fromColumn: 'a_id', to: 'a', toColumn: 'id' },
        { id: 'e3', from: 'c', fromColumn: 'b_id', to: 'b', toColumn: 'id' },
      ],
    }
    const { cards } = build(cyclic)
    for (const c of cards) {
      expect(Number.isFinite(c.x) && Number.isFinite(c.y)).toBe(true)
    }
  })

  it('stacks orphan (unrelated) entities without overlap', () => {
    const orphans: Diagram = {
      entities: [
        { id: 'x', name: 'x', columns: [{ name: 'id', type: 'int', role: 'pk' }] },
        { id: 'y', name: 'y', columns: [{ name: 'id', type: 'int', role: 'pk' }] },
        { id: 'z', name: 'z', columns: [{ name: 'id', type: 'int', role: 'pk' }] },
      ],
      relationships: [],
    }
    const { cards } = build(orphans)
    for (let i = 0; i < cards.length; i++) {
      for (let j = i + 1; j < cards.length; j++) {
        expect(overlaps(cards[i], cards[j])).toBe(false)
      }
    }
  })

  it('handles an empty diagram', () => {
    expect(() => build({ entities: [], relationships: [] })).not.toThrow()
  })

  it('drops a self-reference from ranking but still routes it', () => {
    const selfRef: Diagram = {
      entities: [
        { id: 'role', name: 'role', columns: [
          { name: 'id', type: 'uuid', role: 'pk', nullable: false },
          { name: 'parent_id', type: 'uuid', role: 'fk', nullable: true },
        ] },
      ],
      relationships: [{ id: 'sr', from: 'role', fromColumn: 'parent_id', to: 'role', toColumn: 'id' }],
    }
    const { cards, routes } = build(selfRef)
    expect(cards).toHaveLength(1)
    expect(routes).toHaveLength(1)
    // The loop leaves and re-enters the same card's right edge.
    expect(routes[0].pts.length).toBeGreaterThanOrEqual(6)
  })
})

describe('routing — corridor discipline', () => {
  it('never routes a vertical connector leg through an uninvolved entity', () => {
    const { cards, routes } = build(DAG)
    for (const r of routes) {
      for (const seg of verticalSegments(r.pts)) {
        for (const c of cards) {
          if (c.id === r.from || c.id === r.to) continue
          const insideX = c.x < seg.x && seg.x < c.x + c.w
          const overlapY = c.y < seg.y1 && seg.y0 < c.y + c.h
          expect(insideX && overlapY, `route ${r.id} vertical leg crosses ${c.id}`).toBe(false)
        }
      }
    }
  })

  it('marks identifying relationships solid and non-identifying dashed', () => {
    const d: Diagram = {
      entities: [
        { id: 'p', name: 'p', columns: [{ name: 'id', type: 'int', role: 'pk' }] },
        { id: 'c', name: 'c', columns: [
          { name: 'id', type: 'int', role: 'pk' },
          { name: 'p_id', type: 'int', role: 'fk' },
        ] },
      ],
      relationships: [
        { id: 'rel-id', from: 'c', fromColumn: 'p_id', to: 'p', toColumn: 'id', identifying: true },
      ],
    }
    const solid = route(buildCards(d.entities, THEME, measure), d.relationships)
    expect(solid[0].dashed).toBe(false)

    d.relationships[0].identifying = false
    const dashed = route(buildCards(d.entities, THEME, measure), d.relationships)
    expect(dashed[0].dashed).toBe(true)
  })
})

describe('metrics — content sizing', () => {
  it('sizes a card to its content, wider for longer names/types', () => {
    const d: Diagram = {
      entities: [
        { id: 'narrow', name: 'a', columns: [{ name: 'id', type: 'int' }] },
        { id: 'wide', name: 'a', columns: [
          { name: 'a_very_long_descriptive_column_name', type: 'character varying(255)' },
        ] },
      ],
      relationships: [],
    }
    const cards = buildCards(d.entities, THEME, measure)
    const narrow = cards.find((c) => c.id === 'narrow')!
    const wide = cards.find((c) => c.id === 'wide')!
    expect(wide.w).toBeGreaterThan(narrow.w)
  })

  it('clamps card width between MIN_W and MAX_W', () => {
    const d: Diagram = {
      entities: [
        { id: 'tiny', name: 'x', columns: [{ name: 'i', type: 'a' }] },
        { id: 'huge', name: 'x', columns: [
          { name: 'x'.repeat(200), type: 'y'.repeat(200) },
        ] },
      ],
      relationships: [],
    }
    const cards = buildCards(d.entities, THEME, measure)
    for (const c of cards) {
      expect(c.w).toBeGreaterThanOrEqual(MIN_W)
      expect(c.w).toBeLessThanOrEqual(MAX_W)
    }
  })

  it('quantises width to the 4px grid', () => {
    const cards = buildCards(DAG.entities, THEME, measure)
    for (const c of cards) expect(c.w % 4).toBe(0)
  })
})

describe('notation — crow’s-foot symbol ordering', () => {
  // Emitted along +x from the origin, so a primitive's x is its distance out
  // from the entity edge. The maximum-participation marker must sit nearer the
  // entity (SYM_MAX) than the minimum-participation marker (SYM_MIN).
  it('keeps SYM_MAX inboard of SYM_MIN', () => {
    expect(SYM_MAX).toBeLessThan(SYM_MIN)
  })

  it('exactly one: two bars, at SYM_MAX and SYM_MIN', () => {
    const prims = symbol('one', 0, 0, 1, 0)
    const xs = prims.filter((p) => p.k === 'line').map((p) => (p as { x1: number }).x1).sort((a, b) => a - b)
    expect(xs).toEqual([SYM_MAX, SYM_MIN])
  })

  it('zero or one: max bar inboard, min ring outboard', () => {
    const prims = symbol('zero-or-one', 0, 0, 1, 0)
    const bar = prims.find((p) => p.k === 'line') as { x1: number }
    const ring = prims.find((p) => p.k === 'ring') as { cx: number }
    expect(bar.x1).toBe(SYM_MAX)
    expect(ring.cx).toBe(SYM_MIN)
    expect(bar.x1).toBeLessThan(ring.cx)
  })

  it('one or many: foot apex inboard, min bar outboard', () => {
    const prims = symbol('many', 0, 0, 1, 0)
    const lines = prims.filter((p) => p.k === 'line') as { x1: number; x2: number }[]
    // The foot's two prongs share an apex at SYM_MAX; the min bar sits at SYM_MIN.
    const apex = Math.max(...lines.flatMap((l) => [l.x1, l.x2]).filter((x) => x <= SYM_MAX))
    const bar = lines.find((l) => l.x1 === SYM_MIN && l.x2 === SYM_MIN)!
    expect(apex).toBe(SYM_MAX)
    expect(bar.x1).toBe(SYM_MIN)
  })

  it('zero or many: foot apex inboard, min ring outboard', () => {
    const prims = symbol('zero-or-many', 0, 0, 1, 0)
    const ring = prims.find((p) => p.k === 'ring') as { cx: number }
    const lines = prims.filter((p) => p.k === 'line') as { x1: number; x2: number }[]
    const apex = Math.max(...lines.flatMap((l) => [l.x1, l.x2]).filter((x) => x <= SYM_MAX))
    expect(apex).toBe(SYM_MAX)
    expect(ring.cx).toBe(SYM_MIN)
  })
})
