// Guard — every primitive on the public design-system surface ships a Storybook
// story. Stories are how a primitive is documented, visually reviewed, and
// (via the `storybook` vitest project) a11y-tested in a real browser; a
// primitive without one is invisible to all three. CLAUDE.md states the
// invariant as fact ("all 60+ primitives ship with Storybook stories") — this
// fitness function makes it enforceable instead of aspirational.
//
// Filed from issue #176 (design-system fitness functions). Companion to the
// token/element guards `renderer-no-raw-palette`, `renderer-no-arbitrary-font-size`,
// `renderer-no-arbitrary-width` and `renderer-no-raw-html-primitives`.
//
// WHAT COUNTS AS A PRIMITIVE (and why the exceptions fall out for free):
// The public surface is `primitives/index.ts`. It re-exports each category
// directory with `export * from './<category>'`; those categories
// (layout, surfaces, forms, data-display, feedback, navigation, typography,
// utilities) are the scope. A primitive is a `.tsx` component re-exported
// through one of those category barrels.
//
//   • Root-level direct exports — `ThemeProvider`, `cn`, `FOCUS_GLOW` — are
//     cross-cutting providers/helpers, not visual primitives, and are exported
//     by name rather than via `export *`. They are out of scope by construction.
//   • `.ts` re-exports (e.g. `color-utils`, `severity`) are helpers/types, not
//     components, and are skipped.
//   • The `surfaces/menu/` module is a nested barrel that `surfaces/index.ts`
//     deliberately does NOT re-export (Menu is consumed by DropdownMenu /
//     ContextMenu / MenuBar, never mounted alone). Its internals — MenuItem,
//     MenuLevel, MenuSub, render-nodes — are therefore off the public surface
//     and need no story. This exception is enforced by the public-surface
//     definition itself, not an allowlist that could rot.
//
// The one hand-maintained escape hatch is EXCEPTIONS below: a public primitive
// that legitimately cannot have a story. It is empty today, and its entries are
// verified to still exist and still be storyless so a stale exemption fails too.
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const PRIMITIVES_ROOT = path.join(
  __dirname,
  '..',
  '..',
  '..',
  'src',
  'renderer',
  'src',
  'primitives',
)

// Public primitives that legitimately have no story. Keyed by path relative to
// PRIMITIVES_ROOT (POSIX separators). Each entry needs a reason and is itself
// checked (the file must exist and must actually lack a story) so a no-longer-
// needed exemption cannot linger. Empty today — keep it that way if you can.
const EXCEPTIONS: Record<string, string> = {}

/** Every `from './x'` / `from './a/b'` re-export specifier in a barrel file,
 *  regardless of export form (`export {…}`, `export type {…}`, `export *`). */
function reexportSpecifiers(barrelSrc: string): string[] {
  const specs: string[] = []
  const re = /from\s+'(\.\.?\/[^']+)'/g
  let m: RegExpExecArray | null
  while ((m = re.exec(barrelSrc)) !== null) specs.push(m[1])
  return specs
}

/** Resolve a category (or nested) barrel into the set of `.tsx` component files
 *  it re-exports, following nested barrels. Returns absolute file paths. */
function componentsInBarrel(barrelPath: string, seen = new Set<string>()): string[] {
  if (seen.has(barrelPath)) return []
  seen.add(barrelPath)
  const dir = path.dirname(barrelPath)
  const out: string[] = []
  for (const spec of reexportSpecifiers(fs.readFileSync(barrelPath, 'utf-8'))) {
    const resolved = path.resolve(dir, spec)
    if (fs.existsSync(`${resolved}.tsx`)) {
      out.push(`${resolved}.tsx`) // a component — needs a story
    } else if (fs.existsSync(`${resolved}.ts`)) {
      continue // a helper/type module — not a component
    } else if (
      fs.existsSync(resolved) &&
      fs.statSync(resolved).isDirectory() &&
      fs.existsSync(path.join(resolved, 'index.ts'))
    ) {
      out.push(...componentsInBarrel(path.join(resolved, 'index.ts'), seen))
    }
  }
  return out
}

/** The public primitive surface: every `.tsx` component reachable from
 *  `primitives/index.ts` through an `export * from './<category>'` barrel. */
function publicPrimitives(): string[] {
  const rootSrc = fs.readFileSync(path.join(PRIMITIVES_ROOT, 'index.ts'), 'utf-8')
  const categories = [...rootSrc.matchAll(/export\s+\*\s+from\s+'\.\/([^']+)'/g)].map(
    (m) => m[1],
  )
  const files = new Set<string>()
  for (const cat of categories) {
    const barrel = path.join(PRIMITIVES_ROOT, cat, 'index.ts')
    if (fs.existsSync(barrel)) {
      for (const f of componentsInBarrel(barrel)) files.add(f)
    }
  }
  return [...files].sort()
}

const rel = (abs: string) => path.relative(PRIMITIVES_ROOT, abs).split(path.sep).join('/')
const hasStory = (componentAbs: string) =>
  fs.existsSync(componentAbs.replace(/\.tsx$/, '.stories.tsx'))

describe('every public primitive has a Storybook story', () => {
  const primitives = publicPrimitives()

  it('discovers the public primitive surface', () => {
    // Sanity floor: the categories re-export ~60 components. If this collapses,
    // the resolution above broke and the guard is silently passing on nothing.
    expect(primitives.length).toBeGreaterThan(40)
  })

  it('has a sibling *.stories.tsx for every exported primitive', () => {
    const offenders = primitives
      .filter((p) => !hasStory(p))
      .filter((p) => !(rel(p) in EXCEPTIONS))
      .map(
        (p) =>
          `${rel(p)}  — add ${rel(p).replace(/\.tsx$/, '.stories.tsx')} ` +
          `(mirror a sibling story in the same category)`,
      )
    expect(
      offenders,
      `public primitives missing a Storybook story:\n${offenders.join('\n')}`,
    ).toEqual([])
  })

  it('keeps the EXCEPTIONS allowlist honest — each still exists and is still storyless', () => {
    for (const [relPath, reason] of Object.entries(EXCEPTIONS)) {
      const abs = path.join(PRIMITIVES_ROOT, relPath)
      expect(fs.existsSync(abs), `stale exception: ${relPath} no longer exists`).toBe(true)
      expect(reason.length, `exception ${relPath} needs a reason`).toBeGreaterThan(0)
      expect(
        hasStory(abs),
        `stale exception: ${relPath} now has a story — remove it from EXCEPTIONS`,
      ).toBe(false)
    }
  })
})
