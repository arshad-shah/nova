import { describe, it, expect } from 'vitest'
import { computeDurationScale, percentile } from '../../src/renderer/src/lib/activity/scale'

describe('percentile (nearest-rank)', () => {
  it('is Infinity for an empty list, so nothing reads as slow', () => {
    expect(percentile([], 0.95)).toBe(Infinity)
  })

  it('returns the single value for a one-element list', () => {
    expect(percentile([7], 0.95)).toBe(7)
  })

  it('picks the nearest-rank element', () => {
    const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    // rank = ceil(0.95 * 10) = 10 -> index 9 -> value 10
    expect(percentile(values, 0.95)).toBe(10)
    // rank = ceil(0.5 * 10) = 5 -> index 4 -> value 5
    expect(percentile(values, 0.5)).toBe(5)
  })

  it('is order-independent', () => {
    expect(percentile([10, 1, 5, 3], 0.5)).toBe(percentile([1, 3, 5, 10], 0.5))
  })
})

describe('computeDurationScale', () => {
  it('scales the fraction against the slowest visible duration', () => {
    const scale = computeDurationScale([10, 20, 40])
    expect(scale.max).toBe(40)
    expect(scale.fraction(40)).toBe(1)
    expect(scale.fraction(20)).toBe(0.5)
    expect(scale.fraction(10)).toBe(0.25)
  })

  it('clamps the fraction into 0..1 and treats non-positive as 0', () => {
    const scale = computeDurationScale([10, 20])
    expect(scale.fraction(1000)).toBe(1)
    expect(scale.fraction(0)).toBe(0)
    expect(scale.fraction(-5)).toBe(0)
    expect(scale.fraction(NaN)).toBe(0)
  })

  it('marks the p95 and above as slow', () => {
    const durations = [1, 1, 1, 1, 1, 1, 1, 1, 1, 100]
    const scale = computeDurationScale(durations)
    // p95 = ceil(0.95 * 10) = 10 -> the 100
    expect(scale.p95).toBe(100)
    expect(scale.isSlow(100)).toBe(true)
    expect(scale.isSlow(1)).toBe(false)
  })

  it('ignores non-positive and non-finite durations when building the scale', () => {
    const scale = computeDurationScale([0, -3, NaN, Infinity, 10, 20])
    expect(scale.max).toBe(20)
  })

  it('reads nothing as slow and every bar as empty when there are no durations', () => {
    const scale = computeDurationScale([])
    expect(scale.max).toBe(0)
    expect(scale.p95).toBe(Infinity)
    expect(scale.fraction(5)).toBe(0)
    expect(scale.isSlow(5)).toBe(false)
  })
})
