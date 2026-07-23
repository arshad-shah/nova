import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { onFillInk, relativeLuminance } from '../../src/renderer/src/lib/color-contrast'
import { TABLE_COLORS } from '../../src/renderer/src/components/er/er-layout'

// The two label inks onFillInk chooses between. Both must exist as fixed tokens
// in the token layer so the reference onFillInk returns actually resolves under
// every theme — the ER node label was previously a raw `text-white`, the one
// place a foreground did not live in a token (issue #175).
const TOKENS_CSS = path.join(
  __dirname,
  '../../src/renderer/src/primitives/theme/tokens.css'
)

describe('relativeLuminance', () => {
  it('anchors black at 0 and white at 1', () => {
    expect(relativeLuminance('#000000')).toBeCloseTo(0, 5)
    expect(relativeLuminance('#ffffff')).toBeCloseTo(1, 5)
  })

  it('accepts shorthand hex and an optional leading #', () => {
    expect(relativeLuminance('#fff')).toBeCloseTo(1, 5)
    expect(relativeLuminance('000')).toBeCloseTo(0, 5)
  })

  it('returns null for anything that is not a hex colour', () => {
    expect(relativeLuminance('rebeccapurple')).toBeNull()
    expect(relativeLuminance('var(--color-accent)')).toBeNull()
    expect(relativeLuminance('#12')).toBeNull()
  })
})

describe('onFillInk', () => {
  it('only ever returns a themed --color-on-fill-* token, never a raw colour', () => {
    for (const hue of [...TABLE_COLORS, '#000000', '#ffffff', 'not-a-colour']) {
      expect(onFillInk(hue)).toMatch(/^var\(--color-on-fill-(light|dark)\)$/)
    }
  })

  it('puts a dark ink on a pale fill and a light ink on a dark fill', () => {
    // A near-white surface wants the dark ink; a near-black one the light ink.
    expect(onFillInk('#f5f5f5')).toBe('var(--color-on-fill-light)')
    expect(onFillInk('#101010')).toBe('var(--color-on-fill-dark)')
  })

  it('falls back to the light (safe on saturated hues) ink for unparseable input', () => {
    expect(onFillInk('nonsense')).toBe('var(--color-on-fill-dark)')
  })

  it('picks a readable, higher-contrast ink for every ER table hue', () => {
    // The regression this locks: `text-white` was unreadable on the pale hues
    // in the palette (gold, sand, the greens). For each hue the chosen ink must
    // out-contrast the rejected one — i.e. the choice is genuinely the readable
    // one, not just "a token".
    const INKS = {
      'var(--color-on-fill-light)': relativeLuminance('#141414')!,
      'var(--color-on-fill-dark)': relativeLuminance('#ffffff')!,
    }
    const contrast = (a: number, b: number): number =>
      (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)

    for (const hue of TABLE_COLORS) {
      const fillLum = relativeLuminance(hue)!
      const chosen = onFillInk(hue)
      const rejected =
        chosen === 'var(--color-on-fill-light)'
          ? 'var(--color-on-fill-dark)'
          : 'var(--color-on-fill-light)'
      const chosenContrast = contrast(fillLum, INKS[chosen as keyof typeof INKS])
      const rejectedContrast = contrast(fillLum, INKS[rejected as keyof typeof INKS])
      expect(
        chosenContrast,
        `${hue}: chose ${chosen} (${chosenContrast.toFixed(2)}:1) over ${rejected} (${rejectedContrast.toFixed(2)}:1)`
      ).toBeGreaterThanOrEqual(rejectedContrast)
    }
  })
})

describe('on-fill label tokens', () => {
  it('are defined as concrete values in the token layer', () => {
    const css = fs.readFileSync(TOKENS_CSS, 'utf-8')
    expect(css).toMatch(/--color-on-fill-light:\s*#[0-9a-f]{3,6};/i)
    expect(css).toMatch(/--color-on-fill-dark:\s*#[0-9a-f]{3,6};/i)
  })
})

describe('TableNode wires the contrast helper', () => {
  it('derives its header label ink from onFillInk, not a raw palette class', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '../../src/renderer/src/components/er/TableNode.tsx'),
      'utf-8'
    )
    expect(src).toContain('onFillInk(color)')
    expect(src).not.toMatch(/text-white|text-black/)
  })
})
