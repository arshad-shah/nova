// Guard — renderer components must express every font size through the type
// scale, never a hard-coded arbitrary utility (`text-[10px]`, `text-[11px]`, …).
//
// Verql is a dense, IDE-shaped app whose chrome routinely needs text smaller
// than the scale's `xs` floor (12px). Because the scale did not cover that
// range, the arbitrary-value escape hatch quietly became the convention at the
// small end — 83 hand-rolled sub-12px sizes across 31 files, four distinct
// values (8/9/10/11px) where the scale should have had one or two named steps.
//
// Filed from issue #173. The fix extended the scale with two declared steps —
// `text-3xs` (10px) and `text-2xs` (11px), each with its own line-height, wired
// in `primitives/theme/tokens.css` + `styles/globals.css` and exposed as `size`
// variants on Text/Label/Code/Tag/Badge. This guard keeps the escape hatch from
// re-opening: any `text-[Npx]` reintroduced in a component fails here and the
// message points at the named step to use instead.
//
// Scope note: this scans `src/renderer/src/components`, the app surface the
// issue measured. The `primitives/` layer is where the scale itself is defined,
// so a primitive may still pin a size the ramp does not name (an avatar
// monogram, a keycap); those are the scale's source, not a bypass of it.
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const COMPONENTS_ROOT = path.join(__dirname, '..', '..', '..', 'src', 'renderer', 'src', 'components')

// `text-[<n>px]` — an arbitrary font-size utility (integer or fractional),
// optionally carrying a Tailwind variant prefix (`hover:`, `md:`, …). Rem/em/%
// arbitraries are not the concern here; the drift was entirely pixel values.
const ARBITRARY_FONT_SIZE = /(?<![\w-])text-\[\d+(?:\.\d+)?px\]/

// The sanctioned replacement, chosen by the value that was hard-coded.
function suggestion(match: string): string {
  const px = Number(match.replace(/[^\d.]/g, ''))
  if (px <= 10) return `text-3xs (10px) — via <Text size="3xs">, <Badge size="xs">, or the text-3xs utility`
  if (px === 11) return `text-2xs (11px) — via <Text size="2xs"> or the text-2xs utility`
  return `text-xs (12px) or a larger named step — see primitives/theme/tokens.css`
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      walk(p, out)
    } else if (
      entry.isFile() &&
      (p.endsWith('.ts') || p.endsWith('.tsx')) &&
      !p.endsWith('.stories.tsx') &&
      !p.endsWith('.stories.ts') &&
      !p.endsWith('.test.ts') &&
      !p.endsWith('.test.tsx')
    ) {
      out.push(p)
    }
  }
  return out
}

/** Blank out comments while preserving line count, so an example class named in
 *  prose is ignored but real line numbers survive for the failure message. */
function stripComments(src: string): string {
  const noBlocks = src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
  return noBlocks
    .split('\n')
    .map((line) => line.replace(/(^|[^:])\/\/.*$/, '$1'))
    .join('\n')
}

describe('renderer components use the type scale, never arbitrary font sizes', () => {
  const files = walk(COMPONENTS_ROOT)

  it('finds component source to scan', () => {
    expect(files.length).toBeGreaterThan(100)
  })

  it('has no arbitrary text-[Npx] utilities in src/renderer/src/components', () => {
    const offenders: string[] = []
    for (const file of files) {
      const lines = stripComments(fs.readFileSync(file, 'utf-8')).split('\n')
      lines.forEach((line, i) => {
        const m = ARBITRARY_FONT_SIZE.exec(line)
        if (m) {
          offenders.push(
            `${path.relative(COMPONENTS_ROOT, file)}:${i + 1}  ${m[0]}  →  use ${suggestion(m[0])}`
          )
        }
      })
    }
    expect(
      offenders,
      `arbitrary font sizes found — replace each with a named type-scale step:\n${offenders.join('\n')}`
    ).toEqual([])
  })
})
