import { describe, it, expect } from 'vitest'
import { clamp, treeIndent } from '../../src/renderer/src/lib/math'

describe('clamp', () => {
  it('constrains to the inclusive range', () => {
    expect(clamp(5, 0, 10)).toBe(5)
    expect(clamp(-5, 0, 10)).toBe(0)
    expect(clamp(15, 0, 10)).toBe(10)
  })
})

describe('treeIndent', () => {
  it('returns the 8px base gutter at depth 0', () => {
    expect(treeIndent(0)).toBe(8)
  })

  it('adds 16px per depth level', () => {
    expect(treeIndent(1)).toBe(24)
    expect(treeIndent(2)).toBe(40)
    expect(treeIndent(3)).toBe(56)
  })
})
