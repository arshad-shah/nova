/**
 * Viewport math: the world/screen transform every other module depends on.
 * Pure arithmetic, so it is checked to the pixel.
 */
import { describe, it, expect } from 'vitest'
import {
  bounds,
  fitToView,
  identity,
  MAX_SCALE,
  MIN_SCALE,
  pick,
  toWorldX,
  toWorldY,
  zoomAt,
  type Viewport,
} from '../../../src/renderer/src/components/er/viewport'
import type { Card } from '../../../src/renderer/src/components/er/metrics'

const card = (id: string, x: number, y: number, w = 100, h = 60): Card =>
  ({ id, x, y, w, h, entity: { id, name: id, columns: [] }, rows: [], rowOf: new Map() }) as Card

describe('world/screen transform', () => {
  it('round-trips a point through screen and back', () => {
    const v: Viewport = { x: 40, y: 20, scale: 2 }
    const sx = 5 * v.scale + v.x // world 5 -> screen
    expect(toWorldX(v, sx)).toBeCloseTo(5, 9)
    const sy = 7 * v.scale + v.y
    expect(toWorldY(v, sy)).toBeCloseTo(7, 9)
  })
})

describe('zoomAt', () => {
  it('keeps the pixel under the cursor fixed', () => {
    const v = identity()
    const px = 300
    const py = 200
    const before = { wx: toWorldX(v, px), wy: toWorldY(v, py) }
    const z = zoomAt(v, px, py, 1.5)
    expect(toWorldX(z, px)).toBeCloseTo(before.wx, 9)
    expect(toWorldY(z, py)).toBeCloseTo(before.wy, 9)
  })

  it('clamps scale to [MIN_SCALE, MAX_SCALE]', () => {
    expect(zoomAt({ x: 0, y: 0, scale: 1 }, 0, 0, 100).scale).toBe(MAX_SCALE)
    expect(zoomAt({ x: 0, y: 0, scale: 1 }, 0, 0, 0.0001).scale).toBe(MIN_SCALE)
  })
})

describe('bounds', () => {
  it('is the union rectangle of all cards', () => {
    const b = bounds([card('a', 0, 0, 100, 60), card('b', 200, 120, 80, 40)])
    expect(b).toEqual({ x: 0, y: 0, w: 280, h: 160 })
  })

  it('returns a unit box for an empty set', () => {
    expect(bounds([])).toEqual({ x: 0, y: 0, w: 1, h: 1 })
  })
})

describe('fitToView', () => {
  it('centres the content within the viewport', () => {
    const cards = [card('a', 0, 0, 200, 200)]
    const v = fitToView(cards, 400, 400, 0)
    // A 200×200 card fills 400×400 at scale 2 (under MAX_SCALE), centred at 0.
    expect(v.scale).toBe(2)
    expect(v.x).toBe(0)
    expect(v.y).toBe(0)
  })

  it('never exceeds MAX_SCALE when fitting a tiny diagram', () => {
    const v = fitToView([card('a', 0, 0, 10, 10)], 400, 400, 0)
    expect(v.scale).toBe(MAX_SCALE)
  })
})

describe('pick', () => {
  it('returns the topmost (last-drawn) card under a point', () => {
    const cards = [card('under', 0, 0, 100, 100), card('over', 10, 10, 100, 100)]
    expect(pick(cards, 50, 50)?.id).toBe('over')
  })

  it('returns null when nothing is hit', () => {
    expect(pick([card('a', 0, 0, 10, 10)], 500, 500)).toBeNull()
  })
})
