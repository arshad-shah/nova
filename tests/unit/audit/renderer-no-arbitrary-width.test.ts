// Guard — renderer components must express surface, column and content widths
// through named steps, never a hard-coded arbitrary pixel utility
// (`w-[400px]`, `max-w-[160px]`, `min-w-[260px]`, …).
//
// Panel, modal and column widths had drifted to 16 hand-rolled arbitrary pixel
// values (issue #174): `w-[400px]` here, `w-[520px]` there, `max-w-[420px]`
// somewhere else — a set of surfaces that look almost aligned but are not, with
// nothing to say why a dialog is 520 and not 480, and nothing to stop the next
// one being 500.
//
// Filed from issue #174. The fix named the recurring surface widths as
// `--container-*` tokens (`--container-prompt` 400px, `--container-palette`
// 520px, `--container-hero` 230px in `styles/globals.css`), exposed them as a
// `width` variant on the `Modal` primitive, and moved content constraints onto
// the shared Tailwind width scale (`max-w-40`, `min-w-65`, …). This guard keeps
// the escape hatch from re-opening: any `w-[Npx]` / `max-w-[Npx]` / `min-w-[Npx]`
// reintroduced in a component fails here and the message names the fix.
//
// Exceptions, encoded as explicitly as the rule:
//   * Genuinely dynamic widths driven by state stay dynamic — an inline
//     `style={{ width }}` is the sanctioned way to size something at runtime
//     (resizable panes, virtualized columns, an icon-linked pixel spacer). The
//     regex only matches Tailwind *class* utilities, so inline styles never
//     trip it.
//   * Viewport / percentage / calc / var arbitraries (`max-w-[90vw]`,
//     `w-[var(--x)]`) are not the drift this guards — only literal `px` values.
//   * `.stories.tsx` demo canvases pick an arbitrary width to frame a component
//     at a realistic size; that is presentation scaffolding, not app chrome.
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const COMPONENTS_ROOT = path.join(__dirname, '..', '..', '..', 'src', 'renderer', 'src', 'components')

// `w-[<n>px]`, `max-w-[<n>px]` or `min-w-[<n>px]` — an arbitrary pixel width
// utility, optionally carrying a Tailwind variant prefix (`sm:`, `max-sm:`, …).
// Only literal `px` values are the concern; vw / % / calc / var arbitraries are
// legitimate responsive widths and are deliberately not matched.
const ARBITRARY_WIDTH = /(?<![\w-])(?:min-|max-)?w-\[\d+(?:\.\d+)?px\]/

// The sanctioned replacement, chosen by the kind of width.
function suggestion(match: string): string {
  const px = Number(match.replace(/[^\d.]/g, ''))
  const spacing = px / 4
  const isMaxOrMin = match.startsWith('max-') || match.startsWith('min-')
  if (!isMaxOrMin && (px === 400 || px === 520 || px === 230)) {
    return `a named surface step — <Modal width="prompt"> (400px), width="palette" (520px), or the w-hero / w-prompt / w-palette utilities backed by --container-* in styles/globals.css`
  }
  if (Number.isInteger(spacing)) {
    return `${match.replace(/\[.*\]/, String(spacing))} — the shared Tailwind width scale (${spacing} × 4px = ${px}px), or a named --container-* step for a recurring surface`
  }
  return `a named --container-* width step (styles/globals.css), a scale utility, or an inline style={{ width }} for a genuinely dynamic width`
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

describe('renderer components use named width steps, never arbitrary pixel widths', () => {
  const files = walk(COMPONENTS_ROOT)

  it('finds component source to scan', () => {
    expect(files.length).toBeGreaterThan(100)
  })

  it('has no arbitrary (min-/max-)w-[Npx] utilities in src/renderer/src/components', () => {
    const offenders: string[] = []
    for (const file of files) {
      const lines = stripComments(fs.readFileSync(file, 'utf-8')).split('\n')
      lines.forEach((line, i) => {
        const m = ARBITRARY_WIDTH.exec(line)
        if (m) {
          offenders.push(
            `${path.relative(COMPONENTS_ROOT, file)}:${i + 1}  ${m[0]}  →  use ${suggestion(m[0])}`
          )
        }
      })
    }
    expect(
      offenders,
      `arbitrary pixel widths found — replace each with a named width step or a dynamic inline style:\n${offenders.join('\n')}`
    ).toEqual([])
  })
})
