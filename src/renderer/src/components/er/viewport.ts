/** Pan, zoom, and the world/screen conversions everything else depends on. */
import type { Card } from './metrics'

export const MIN_SCALE = 0.2
export const MAX_SCALE = 3

export interface Viewport {
  x: number
  y: number
  scale: number
}

export const identity = (): Viewport => ({ x: 0, y: 0, scale: 1 })

export const toWorldX = (v: Viewport, sx: number): number => (sx - v.x) / v.scale
export const toWorldY = (v: Viewport, sy: number): number => (sy - v.y) / v.scale

/** Zoom about a fixed screen point, so the pixel under the cursor stays put. */
export function zoomAt(v: Viewport, sx: number, sy: number, factor: number): Viewport {
  const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, v.scale * factor))
  const k = scale / v.scale
  return { scale, x: sx - (sx - v.x) * k, y: sy - (sy - v.y) * k }
}

export function bounds(cards: Card[]): { x: number; y: number; w: number; h: number } {
  if (!cards.length) return { x: 0, y: 0, w: 1, h: 1 }
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (const c of cards) {
    x0 = Math.min(x0, c.x)
    y0 = Math.min(y0, c.y)
    x1 = Math.max(x1, c.x + c.w)
    y1 = Math.max(y1, c.y + c.h)
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
}

export function fitToView(cards: Card[], vw: number, vh: number, pad = 48): Viewport {
  const b = bounds(cards)
  const scale = Math.min(MAX_SCALE, Math.min((vw - pad * 2) / b.w, (vh - pad * 2) / b.h))
  const s = Math.max(MIN_SCALE, scale)
  return {
    scale: s,
    x: (vw - b.w * s) / 2 - b.x * s,
    y: (vh - b.h * s) / 2 - b.y * s,
  }
}

/** Topmost card under a world point, or null. Cards are drawn in array order. */
export function pick(cards: Card[], wx: number, wy: number): Card | null {
  for (let i = cards.length - 1; i >= 0; i--) {
    const c = cards[i]
    if (wx >= c.x && wx <= c.x + c.w && wy >= c.y && wy <= c.y + c.h) return c
  }
  return null
}
