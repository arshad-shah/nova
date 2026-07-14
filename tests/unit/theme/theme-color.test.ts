import { describe, it, expect, beforeEach } from 'vitest'
import { themeColor, readThemeColors, decorativeColor } from '@/primitives/theme/theme-color'

beforeEach(() => {
  document.documentElement.style.setProperty('--color-accent', '#123456')
  document.documentElement.style.setProperty('--color-decorative-1', '#aabbcc')
})

describe('themeColor', () => {
  it('reads a CSS custom property value', () => {
    expect(themeColor('--color-accent')).toBe('#123456')
  })

  it('returns empty string for an unset property', () => {
    expect(themeColor('--nope-not-set')).toBe('')
  })

  it('resolves a map of vars', () => {
    expect(readThemeColors({ a: '--color-accent' })).toEqual({ a: '#123456' })
  })

  it('resolves decorative colors 1-based with wraparound', () => {
    expect(decorativeColor(1)).toBe('#aabbcc')
    expect(decorativeColor(9)).toBe('#aabbcc') // wraps to 1
  })
})
