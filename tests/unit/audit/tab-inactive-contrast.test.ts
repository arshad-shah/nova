// WCAG AA contrast audit for the tab strip's inactive-tab label.
//
// Six bundled themes (lab, midnight, dracula, nord, solarized, catppuccin)
// were just hand-fixed so `--color-tab-inactive-fg` clears 4.5:1 against
// `--color-tab-bar-bg`. Nothing enforced that going forward: the previous
// gate was a Storybook story with a hardcoded theme list and a play function
// that only checked "the active tab's fill differs from the bar's fill" —
// not label contrast, and not extensible to a theme nobody remembered to add
// to the list.
//
// This test derives its theme list from the actual bundled registry
// (`CORE_THEMES`) plus the Ion baseline (which ships outside that registry —
// see `primitives/theme/baseline.css`), so a newly added bundled theme is
// covered automatically without anyone updating a list here.
//
// It resolves each theme's `--color-tab-inactive-fg` / `--color-tab-bar-bg`
// down to a concrete sRGB colour — following `var(--raw-*)` indirection
// against the raw palette in `tokens.css`, and evaluating the one-percentage
// `color-mix(in srgb, ...)` form the fixed themes actually use — and computes
// the WCAG relative-luminance contrast ratio.
//
// Deliberately does NOT catch-and-skip an unresolvable value (e.g. a
// color-space or color-mix form this resolver doesn't understand). A theme
// this can't parse fails loudly, naming the theme and the raw CSS value, so a
// gap in the resolver reads as a broken test to fix, never as silent, false
// coverage.
import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import { CORE_THEMES } from '../../../src/main/plugins/bundled/core-themes/themes-data'

const TOKENS_CSS = path.join(__dirname, '../../../src/renderer/src/primitives/theme/tokens.css')
const BASELINE_CSS = path.join(__dirname, '../../../src/renderer/src/primitives/theme/baseline.css')

// ---------------------------------------------------------------------------
// Minimal CSS custom-property resolver — just enough for the two properties
// this audit cares about: plain hex literals, `var(--raw-*)` indirection, and
// the single-percentage `color-mix(in srgb, colorA, colorB P%)` form.
// ---------------------------------------------------------------------------

type Rgb = [number, number, number]

/** Parses `--name: value;` declarations out of a CSS block's raw text. */
function parseDeclarations(css: string): Map<string, string> {
  const map = new Map<string, string>()
  const re = /--([\w-]+):\s*([^;]+);/g
  let m: RegExpExecArray | null
  while ((m = re.exec(css))) {
    map.set(m[1], m[2].trim())
  }
  return map
}

/** The raw-scale palette (`--raw-*`, `--fn-*`) lives in tokens.css's first
 *  `:root { ... }` block (Layer 1). Themes reference these by var(), never
 *  redefine them, so a flat map built from just that block is unambiguous. */
function loadRawPalette(): Map<string, string> {
  const css = fs.readFileSync(TOKENS_CSS, 'utf-8')
  const firstRoot = css.match(/:root\s*{([^}]*)}/)
  if (!firstRoot) throw new Error(`tokens.css: could not find the Layer-1 :root block to parse the raw palette from`)
  return parseDeclarations(firstRoot[1])
}

function hexToRgb(hex: string): Rgb {
  let h = hex.replace('#', '')
  if (h.length === 3) h = h.split('').map(c => c + c).join('')
  if (h.length !== 6 && h.length !== 8) {
    throw new Error(`Unresolvable hex colour "${hex}" — expected 3, 6 or 8 hex digits`)
  }
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return [r, g, b]
}

/** Splits a color-mix() argument list on top-level commas (parens-aware). */
function splitTopLevel(s: string): string[] {
  const parts: string[] = []
  let depth = 0
  let cur = ''
  for (const ch of s) {
    if (ch === '(') depth++
    if (ch === ')') depth--
    if (ch === ',' && depth === 0) {
      parts.push(cur.trim())
      cur = ''
    } else {
      cur += ch
    }
  }
  if (cur.trim()) parts.push(cur.trim())
  return parts
}

/**
 * Resolves a raw CSS colour value (hex literal, `var(--raw-x)`, or a
 * single-percentage `color-mix(in srgb, ...)`) to concrete sRGB.
 *
 * Throws — rather than returning a best-effort guess — for anything outside
 * that support surface (an unresolvable var, an unsupported color-mix color
 * space, rgb()/hsl() functions, etc). The caller lets that propagate so the
 * failure names the theme and the unparsed value instead of silently passing.
 */
function resolveColor(rawValue: string, palette: Map<string, string>, themeLabel: string): Rgb {
  const value = rawValue.trim()

  const hexMatch = value.match(/^#[0-9a-fA-F]{3,8}$/)
  if (hexMatch) return hexToRgb(value)

  const varMatch = value.match(/^var\(--([\w-]+)\)$/)
  if (varMatch) {
    const name = varMatch[1]
    const resolved = palette.get(name)
    if (resolved === undefined) {
      throw new Error(`[${themeLabel}] var(--${name}) has no entry in the raw palette (tokens.css Layer 1)`)
    }
    return resolveColor(resolved, palette, themeLabel)
  }

  const mixMatch = value.match(/^color-mix\(in\s+([\w-]+)\s*,\s*(.+)\)$/)
  if (mixMatch) {
    const space = mixMatch[1]
    if (space !== 'srgb') {
      throw new Error(
        `[${themeLabel}] color-mix(in ${space}, ...) is not supported by this audit's resolver `
        + `(only "srgb" is) — value was: ${rawValue}`,
      )
    }
    const args = splitTopLevel(mixMatch[2])
    if (args.length !== 2) {
      throw new Error(`[${themeLabel}] expected exactly 2 colors in color-mix(), got ${args.length}: ${rawValue}`)
    }
    const parseArg = (arg: string): { color: string; pct: number | null } => {
      const pctMatch = arg.match(/^(.*\S)\s+([\d.]+)%$/)
      if (pctMatch) return { color: pctMatch[1].trim(), pct: Number(pctMatch[2]) }
      return { color: arg.trim(), pct: null }
    }
    const a = parseArg(args[0])
    const b = parseArg(args[1])
    let pctA = a.pct
    let pctB = b.pct
    if (pctA === null && pctB === null) { pctA = 50; pctB = 50 }
    else if (pctA === null) pctA = 100 - (pctB as number)
    else if (pctB === null) pctB = 100 - pctA

    const [r1, g1, b1] = resolveColor(a.color, palette, themeLabel)
    const [r2, g2, b2] = resolveColor(b.color, palette, themeLabel)
    const wa = pctA / 100
    const wb = pctB / 100
    return [r1 * wa + r2 * wb, g1 * wa + g2 * wb, b1 * wa + b2 * wb]
  }

  throw new Error(`[${themeLabel}] resolveColor doesn't understand "${rawValue}" — extend the resolver or fix the theme`)
}

// ---------------------------------------------------------------------------
// WCAG 2.x relative luminance / contrast ratio
// ---------------------------------------------------------------------------

function srgbChannelToLinear(c8: number): number {
  const c = c8 / 255
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
}

function relativeLuminance([r, g, b]: Rgb): number {
  const [rl, gl, bl] = [srgbChannelToLinear(r), srgbChannelToLinear(g), srgbChannelToLinear(b)]
  return 0.2126 * rl + 0.7152 * gl + 0.0722 * bl
}

function contrastRatio(a: Rgb, b: Rgb): number {
  const la = relativeLuminance(a)
  const lb = relativeLuminance(b)
  const [lighter, darker] = la >= lb ? [la, lb] : [lb, la]
  return (lighter + 0.05) / (darker + 0.05)
}

// ---------------------------------------------------------------------------
// Theme roster — from the real bundled data, not a hardcoded list.
// ---------------------------------------------------------------------------

interface ThemeCss {
  id: string
  css: string
}

function loadThemeRoster(): ThemeCss[] {
  const bundled: ThemeCss[] = CORE_THEMES.map(t => ({ id: t.id, css: t.css }))
  // Ion is the app's default/brand theme and deliberately ships outside
  // core-themes (see themes-data.ts's own comment) — it's baked into
  // baseline.css so the app paints correctly even without the plugin.
  const baselineCss = fs.readFileSync(BASELINE_CSS, 'utf-8')
  return [...bundled, { id: 'ion', css: baselineCss }]
}

const WCAG_AA_NORMAL_TEXT = 4.5

describe('bundled themes — inactive tab label meets WCAG AA against the tab bar', () => {
  const palette = loadRawPalette()
  const roster = loadThemeRoster()

  // Sanity check on the roster derivation itself: if this ever comes back
  // empty, every `it()` below silently vanishes and the suite still reports
  // green. Fail loudly instead.
  it('found at least one bundled theme to check', () => {
    expect(roster.length).toBeGreaterThan(0)
  })

  for (const theme of roster) {
    it(`${theme.id}: --color-tab-inactive-fg vs --color-tab-bar-bg >= ${WCAG_AA_NORMAL_TEXT}:1`, () => {
      const fgMatch = theme.css.match(/--color-tab-inactive-fg:\s*([^;]+);/)
      const bgMatch = theme.css.match(/--color-tab-bar-bg:\s*([^;]+);/)
      expect(fgMatch, `[${theme.id}] --color-tab-inactive-fg is not declared`).not.toBeNull()
      expect(bgMatch, `[${theme.id}] --color-tab-bar-bg is not declared`).not.toBeNull()

      const fgRaw = fgMatch![1].trim()
      const bgRaw = bgMatch![1].trim()

      // Deliberately not wrapped in try/catch: an unresolvable value must
      // throw and fail this theme's test with the resolver's own message
      // (which names the theme and the offending value), not be swallowed
      // into a pass or a generic skip.
      const fg = resolveColor(fgRaw, palette, theme.id)
      const bg = resolveColor(bgRaw, palette, theme.id)
      const ratio = contrastRatio(fg, bg)

      expect(
        ratio,
        `[${theme.id}] tab-inactive-fg (${fgRaw} -> rgb(${fg.map(c => c.toFixed(1)).join(',')})) `
        + `vs tab-bar-bg (${bgRaw} -> rgb(${bg.map(c => c.toFixed(1)).join(',')})) `
        + `is ${ratio.toFixed(2)}:1, under the WCAG AA ${WCAG_AA_NORMAL_TEXT}:1 floor for normal text`,
      ).toBeGreaterThanOrEqual(WCAG_AA_NORMAL_TEXT)
    })
  }
})
