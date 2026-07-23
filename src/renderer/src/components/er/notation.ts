/**
 * Crow's-foot (Information Engineering) cardinality symbols.
 *
 * Convention, and it is a convention worth honouring exactly: the maximum
 * participation symbol sits nearest the entity, the minimum participation
 * symbol sits outboard of it.
 *
 *   exactly one      |  |----     bar at MAX, bar at MIN
 *   zero or one      o |----      bar at MAX, ring at MIN
 *   one or many      | <----      foot at MAX, bar at MIN
 *   zero or many     o <----      foot at MAX, ring at MIN
 *
 * Distances are measured outward from the entity edge along the connector.
 */
import type { Cardinality } from './model'

export const SYM_MAX = 11
export const SYM_MIN = 19
export const FOOT_SPREAD = 5.5
export const BAR_HALF = 5.5
export const RING_R = 3.5
/** Straight run leaving the entity before the connector is allowed to turn. */
export const STUB = SYM_MIN + 9

export type Prim =
  | { k: 'line'; x1: number; y1: number; x2: number; y2: number }
  | { k: 'ring'; cx: number; cy: number; r: number }

/**
 * @param px,py  point on the entity edge
 * @param dx,dy  unit vector pointing away from the entity
 */
export function symbol(c: Cardinality, px: number, py: number, dx: number, dy: number): Prim[] {
  // Perpendicular to the connector, in screen space.
  const nx = -dy
  const ny = dx
  const out: Prim[] = []

  const bar = (d: number) => {
    const cx = px + dx * d
    const cy = py + dy * d
    out.push({
      k: 'line',
      x1: cx - nx * BAR_HALF,
      y1: cy - ny * BAR_HALF,
      x2: cx + nx * BAR_HALF,
      y2: cy + ny * BAR_HALF,
    })
  }

  const foot = () => {
    const ax = px + dx * SYM_MAX
    const ay = py + dy * SYM_MAX
    out.push({ k: 'line', x1: ax, y1: ay, x2: px - nx * FOOT_SPREAD, y2: py - ny * FOOT_SPREAD })
    out.push({ k: 'line', x1: ax, y1: ay, x2: px + nx * FOOT_SPREAD, y2: py + ny * FOOT_SPREAD })
    // The third prong is the connector itself, already drawn.
  }

  const ring = () => {
    out.push({ k: 'ring', cx: px + dx * SYM_MIN, cy: py + dy * SYM_MIN, r: RING_R })
  }

  switch (c) {
    case 'one':
      bar(SYM_MAX)
      bar(SYM_MIN)
      break
    case 'zero-or-one':
      bar(SYM_MAX)
      ring()
      break
    case 'many':
      foot()
      bar(SYM_MIN)
      break
    case 'zero-or-many':
      foot()
      ring()
      break
  }
  return out
}

export const LEGEND: { label: string; card: Cardinality }[] = [
  { label: 'Exactly one', card: 'one' },
  { label: 'Zero or one', card: 'zero-or-one' },
  { label: 'One or many', card: 'many' },
  { label: 'Zero or many', card: 'zero-or-many' },
]
