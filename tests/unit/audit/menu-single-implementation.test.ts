import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'

/**
 * Guardrail — there is exactly ONE menu implementation.
 *
 * The renderer used to carry three copies of the same floating-menu machinery:
 * `primitives/surfaces/DropdownMenu`, `primitives/surfaces/ContextMenu` (which
 * lacked keyboard navigation and collision handling entirely, so right-clicking
 * near a screen edge overflowed the viewport), and `components/shell/MenuBar`,
 * which never used the primitive at all despite a comment claiming its look.
 * They drifted, and the most capable menu in the app was the one that was not
 * the primitive.
 *
 * A fourth copy is easy to add by accident — @floating-ui/react is already a
 * dependency and `role="menu"` is one attribute away. These tests fail if one
 * appears.
 */

const RENDERER = path.join(process.cwd(), 'src', 'renderer', 'src')

/** The one module allowed to declare a menu surface. */
const MENU_MODULE = path.join(RENDERER, 'primitives', 'surfaces', 'menu')

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry)
    if (statSync(full).isDirectory()) return walk(full)
    return /\.(ts|tsx)$/.test(full) && !/\.(stories|test)\.tsx?$/.test(full) ? [full] : []
  })
}

const sourceFiles = walk(RENDERER)
const rel = (p: string) => path.relative(process.cwd(), p)

describe('guardrail — one menu implementation', () => {
  it('only the menu module declares role="menu"', () => {
    // A `role="menu"` outside the module means someone built a menu surface by
    // hand instead of using MenuLevel. Compose the primitive instead: it brings
    // list navigation, typeahead, focus return and collision handling with it.
    const offenders = sourceFiles
      .filter((f) => !f.startsWith(MENU_MODULE))
      .filter((f) => /role=["']menu["']/.test(readFileSync(f, 'utf8')))
      .map(rel)

    expect(offenders).toEqual([])
  })

  it('only the menu module declares menu row roles', () => {
    // Same reasoning for the rows: `menuitem` / `menuitemcheckbox` /
    // `menuitemradio` should come from Menu.Item / Menu.CheckItem /
    // Menu.RadioItem, which own the gutter rule and the ARIA state.
    //
    // `role="menubar"` and its top-level `menuitem` triggers are exempt: the
    // menubar is a distinct ARIA pattern, and its coordination lives in
    // `shell/useMenubar.ts` by design.
    const MENUBAR_EXEMPT = [
      path.join(RENDERER, 'components', 'shell', 'MenuBar.tsx'),
    ]

    const offenders = sourceFiles
      .filter((f) => !f.startsWith(MENU_MODULE) && !MENUBAR_EXEMPT.includes(f))
      .filter((f) => /role=["']menuitem(checkbox|radio)?["']/.test(readFileSync(f, 'utf8')))
      .map(rel)

    expect(offenders).toEqual([])
  })

  it('no file outside the menu module hand-rolls menu keyboard navigation', () => {
    // The old menus each re-implemented list navigation with a
    // querySelectorAll-per-keypress loop over '[role="menuitem"]'. That is what
    // useListNavigation does, correctly.
    const offenders = sourceFiles
      .filter((f) => !f.startsWith(MENU_MODULE))
      .filter((f) => /querySelectorAll\([^)]*role="menuitem"/.test(readFileSync(f, 'utf8')))
      .map(rel)

    expect(offenders).toEqual([])
  })

  it('the shell menubar does not import floating-ui directly', () => {
    // Positioning belongs to the primitive. MenuBar owning its own useFloating
    // is exactly how it drifted from DropdownMenu in the first place.
    const menuBar = readFileSync(path.join(RENDERER, 'components', 'shell', 'MenuBar.tsx'), 'utf8')
    expect(menuBar).not.toMatch(/@floating-ui\/react/)
  })
})
