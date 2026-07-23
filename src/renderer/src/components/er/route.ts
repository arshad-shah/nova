/**
 * Orthogonal connector routing.
 *
 * A connector leaves the entity horizontally, runs straight for STUB pixels
 * so the cardinality symbols always sit on a clean straight run, then turns
 * at most twice. Connectors sharing a vertical channel are fanned into lanes
 * so two relationships never trace the same pixels.
 */
import { anchorY, type Card } from './metrics'
import { STUB, type Prim, symbol } from './notation'
import { DEFAULT_FROM, DEFAULT_TO, type Cardinality, type Relationship } from './model'

export const LANE = 14
export const CORNER = 6

export interface Port {
  x: number
  y: number
  dx: number
  dy: number
}

export interface Route {
  id: string
  from: string
  to: string
  /** Polyline in world space, first point on the child, last on the parent. */
  pts: number[]
  dashed: boolean
  symbols: Prim[]
  /** Bounding box, used for viewport culling. */
  minX: number
  minY: number
  maxX: number
  maxY: number
}

/**
 * Vertical corridors: the x ranges no entity occupies. Routing the vertical
 * leg of a connector inside one of these means a connector never slices
 * through a card it has nothing to do with.
 */
function corridors(cards: Card[]): [number, number][] {
  const iv = cards.map((c) => [c.x, c.x + c.w] as [number, number]).sort((a, b) => a[0] - b[0])
  const merged: [number, number][] = []
  for (const span of iv) {
    const last = merged[merged.length - 1]
    if (last && span[0] <= last[1]) last[1] = Math.max(last[1], span[1])
    else merged.push([span[0], span[1]])
  }
  const gaps: [number, number][] = []
  for (let i = 1; i < merged.length; i++) gaps.push([merged[i - 1][1], merged[i][0]])
  return gaps
}

/** Centre of the widest corridor lying between two x positions. */
function pickCorridor(gaps: [number, number][], lo: number, hi: number): [number, number] | null {
  const want = (lo + hi) / 2
  let best: [number, number] | null = null
  let bestD = Infinity
  for (const g of gaps) {
    if (g[1] <= lo || g[0] >= hi) continue
    const c = (Math.max(g[0], lo) + Math.min(g[1], hi)) / 2
    const d = Math.abs(c - want)
    if (d < bestD) {
      bestD = d
      best = [Math.max(g[0], lo), Math.min(g[1], hi)]
    }
  }
  return best
}

export function route(cards: Card[], rels: Relationship[]): Route[] {
  const by = new Map<string, Card>()
  for (const c of cards) by.set(c.id, c)
  const gaps = corridors(cards)

  const lanes = new Map<number, number>()
  const takeLane = (channel: number): number => {
    const key = Math.round(channel / LANE)
    const n = lanes.get(key) ?? 0
    lanes.set(key, n + 1)
    return n
  }

  const out: Route[] = []

  for (const r of rels) {
    const a = by.get(r.from)
    const b = by.get(r.to)
    if (!a || !b) continue

    const ay = anchorY(a, r.fromColumn)
    const by_ = anchorY(b, r.toColumn)
    const fc = r.fromCardinality ?? DEFAULT_FROM
    const tc = r.toCardinality ?? DEFAULT_TO

    let pa: Port
    let pb: Port
    let pts: number[]

    if (a === b) {
      // Self reference: out of the right edge, around, back into the right edge.
      const lane = takeLane(a.x + a.w + STUB)
      const ch = a.x + a.w + STUB + lane * LANE
      pa = { x: a.x + a.w, y: ay, dx: 1, dy: 0 }
      pb = { x: a.x + a.w, y: by_ === ay ? ay + 22 : by_, dx: 1, dy: 0 }
      pts = [pa.x, pa.y, ch, pa.y, ch, pb.y, pb.x, pb.y]
    } else if (b.x + b.w <= a.x || a.x + a.w <= b.x) {
      // Cleanly separated horizontally: the ports face each other.
      const parentLeft = b.x + b.w <= a.x
      pa = { x: parentLeft ? a.x : a.x + a.w, y: ay, dx: parentLeft ? -1 : 1, dy: 0 }
      pb = { x: parentLeft ? b.x + b.w : b.x, y: by_, dx: parentLeft ? 1 : -1, dy: 0 }

      if (Math.abs(ay - by_) < 1) {
        pts = [pa.x, ay, pb.x, ay]
      } else {
        const lo = Math.min(pa.x, pb.x)
        const hi = Math.max(pa.x, pb.x)
        const corridor = pickCorridor(gaps, lo, hi)
        const centre = corridor ? (corridor[0] + corridor[1]) / 2 : (lo + hi) / 2
        const lane = takeLane(centre)
        let mid = centre + lane * LANE
        if (corridor) {
          // Stay inside the corridor first; the stub is the softer constraint.
          const inset = Math.min(8, (corridor[1] - corridor[0]) / 3)
          mid = Math.max(corridor[0] + inset, Math.min(corridor[1] - inset, mid))
        } else {
          mid = Math.max(lo + STUB, Math.min(hi - STUB, mid))
        }
        pts = [pa.x, ay, mid, ay, mid, by_, pb.x, by_]
      }
    } else {
      // Overlapping columns: both ports leave right and share an outer channel.
      const edge = Math.max(a.x + a.w, b.x + b.w)
      const lane = takeLane(edge + STUB)
      const ch = edge + STUB + lane * LANE
      pa = { x: a.x + a.w, y: ay, dx: 1, dy: 0 }
      pb = { x: b.x + b.w, y: by_, dx: 1, dy: 0 }
      pts = [pa.x, ay, ch, ay, ch, by_, pb.x, by_]
    }

    const symbols = symbol(fc, pa.x, pa.y, pa.dx, pa.dy).concat(
      symbol(tc, pb.x, pb.y, pb.dx, pb.dy)
    )

    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (let i = 0; i < pts.length; i += 2) {
      if (pts[i] < minX) minX = pts[i]
      if (pts[i] > maxX) maxX = pts[i]
      if (pts[i + 1] < minY) minY = pts[i + 1]
      if (pts[i + 1] > maxY) maxY = pts[i + 1]
    }

    out.push({
      id: r.id,
      from: r.from,
      to: r.to,
      pts,
      dashed: r.identifying !== true,
      symbols,
      minX: minX - STUB,
      minY: minY - STUB,
      maxX: maxX + STUB,
      maxY: maxY + STUB,
    })
  }

  return out
}

/** Cardinality label for the legend and for accessible descriptions. */
export function describe(c: Cardinality): string {
  switch (c) {
    case 'one':
      return 'exactly one'
    case 'zero-or-one':
      return 'zero or one'
    case 'many':
      return 'one or many'
    default:
      return 'zero or many'
  }
}
