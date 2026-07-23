// Guard — feature code under `src/renderer/src/components` must reach for a
// design-system primitive, never a raw interactive/structural HTML element.
// There is a primitive for each of these (`Button`/`IconButton`, `Input` and
// its typed siblings, `Select`, `Textarea`, `Table`, `Heading`), and only the
// primitive carries the tokens, sizing, focus ring, and a11y wiring the app
// depends on. A raw `<button>` or `<h2>` renders without any of that and looks
// almost-right — the exact drift this fitness function exists to flag.
//
// Filed from issue #176 (design-system fitness functions). The primitives layer
// itself (`src/renderer/src/primitives`) is deliberately OUT of scope: a
// primitive is where a native element legitimately lives, so this guard only
// scans the component/feature layer that consumes them. Comments are stripped
// before scanning, so prose that names an element as an example (see
// tab-bar/TabItem.tsx, which mentions "native <button>") does not trip it.
//
// This is the element-level companion to the token-level guards
// `renderer-no-raw-palette` (colour) and `renderer-no-arbitrary-font-size`
// (type scale). Widths (`w-[Npx]`) are intentionally not covered here — that
// scale + its guard are owned by issue #174.
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const COMPONENTS_ROOT = path.join(
  __dirname,
  '..',
  '..',
  '..',
  'src',
  'renderer',
  'src',
  'components',
)

// Each raw element maps to the sanctioned primitive a failing build should point
// the author at. `heading` folds h1–h6 into one rule.
const RAW_ELEMENTS: Array<{ key: string; match: RegExp; fix: string }> = [
  {
    key: 'button',
    match: /<button(?=[\s/>])/g,
    fix: 'use <Button> or <IconButton> (primitives/forms)',
  },
  {
    key: 'input',
    match: /<input(?=[\s/>])/g,
    fix: 'use <Input> / <NumberInput> / <PasswordInput> / <SearchInput> (primitives/forms)',
  },
  {
    key: 'select',
    match: /<select(?=[\s/>])/g,
    fix: 'use <Select> (primitives/forms)',
  },
  {
    key: 'textarea',
    match: /<textarea(?=[\s/>])/g,
    fix: 'use <Textarea> (primitives/forms)',
  },
  {
    key: 'table',
    match: /<table(?=[\s/>])/g,
    fix: 'use <Table> (primitives/data-display)',
  },
  {
    key: 'heading',
    match: /<h[1-6](?=[\s/>])/g,
    fix: 'use <Heading> (primitives/typography)',
  },
]

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

/** Blank out comments while preserving line count, so an element named in prose
 *  is ignored but real line numbers survive for the failure message. Mirrors the
 *  helper in `renderer-no-raw-palette`. */
function stripComments(src: string): string {
  const noBlocks = src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
  return noBlocks
    .split('\n')
    .map((line) => line.replace(/(^|[^:])\/\/.*$/, '$1'))
    .join('\n')
}

describe('renderer components use primitives, never raw HTML elements', () => {
  const files = walk(COMPONENTS_ROOT)

  it('finds component source to scan', () => {
    expect(files.length).toBeGreaterThan(100)
  })

  it('has no raw <button>/<input>/<select>/<textarea>/<table>/<h1-6> in src/renderer/src/components', () => {
    const offenders: string[] = []
    for (const file of files) {
      const lines = stripComments(fs.readFileSync(file, 'utf-8')).split('\n')
      lines.forEach((line, i) => {
        for (const el of RAW_ELEMENTS) {
          el.match.lastIndex = 0
          if (el.match.test(line)) {
            offenders.push(
              `${path.relative(COMPONENTS_ROOT, file)}:${i + 1}  <${el.key}>  — ${el.fix}`,
            )
          }
        }
      })
    }
    expect(
      offenders,
      `raw HTML elements found in the component layer (a primitive exists for each):\n${offenders.join(
        '\n',
      )}`,
    ).toEqual([])
  })
})
