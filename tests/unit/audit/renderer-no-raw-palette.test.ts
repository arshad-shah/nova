// Guard — the renderer must express every colour through the theme token layer,
// never a raw Tailwind palette utility (`text-white`, `bg-black/50`,
// `divide-white/[0.04]`, `from-blue-500`, `text-slate-400`, …). A fixed palette
// class renders the same on all bundled themes, so it is exactly the bypass the
// three-layer token system exists to prevent — and the light themes are where
// it visibly fails.
//
// Filed from issue #175, which flagged one such class (`text-white` on the ER
// node header) but reproduced against a snapshot. A full sweep of the current
// tree found 8 offending sites across 8 files; this guard covers the whole
// renderer so any reintroduction — in a component or a primitive — fails here.
//
// Legitimate fixed colours (a white label on a saturated fill, a modal scrim)
// are NOT exceptions to be listed here: they were moved into the token layer
// (`--color-on-fill-*`, `--color-overlay-backdrop`) so this guard can stay
// absolute. Comments are stripped before scanning, so prose that names a class
// as an example (see PluginIcon.tsx) does not trip it.
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const RENDERER_ROOT = path.join(__dirname, '..', '..', '..', 'src', 'renderer', 'src')

const PALETTE = [
  'white',
  'black',
  'slate',
  'gray',
  'zinc',
  'neutral',
  'stone',
  'red',
  'orange',
  'amber',
  'yellow',
  'lime',
  'green',
  'emerald',
  'teal',
  'cyan',
  'sky',
  'blue',
  'indigo',
  'violet',
  'purple',
  'fuchsia',
  'pink',
  'rose',
].join('|')

// The colour-consuming utility prefixes, optionally carrying a Tailwind variant
// prefix (`hover:`, `focus-visible:`, `backdrop:`, …). `white`/`black` take no
// numeric step; the named scales take an optional `-500`. An opacity suffix
// (`/50`, `/[0.04]`) may trail but is irrelevant to the match.
const FORBIDDEN = new RegExp(
  String.raw`(?<![\w-])(?:text|bg|border|ring|divide|from|via|to|fill|stroke|outline|decoration|caret|accent|placeholder)-(?:${PALETTE})(?:-(?:50|100|200|300|400|500|600|700|800|900|950))?(?![\w-])`
)

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

describe('renderer uses theme tokens, never raw palette utilities', () => {
  const files = walk(RENDERER_ROOT)

  it('finds renderer source to scan', () => {
    expect(files.length).toBeGreaterThan(100)
  })

  it('has no raw Tailwind palette colour classes anywhere in src/renderer/src', () => {
    const offenders: string[] = []
    for (const file of files) {
      const lines = stripComments(fs.readFileSync(file, 'utf-8')).split('\n')
      lines.forEach((line, i) => {
        const m = FORBIDDEN.exec(line)
        if (m) {
          offenders.push(`${path.relative(RENDERER_ROOT, file)}:${i + 1}  ${m[0]}`)
        }
      })
    }
    expect(offenders, `raw palette utilities found:\n${offenders.join('\n')}`).toEqual([])
  })
})
