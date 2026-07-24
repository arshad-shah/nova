// Guard — every Zustand store hook in the renderer must be called with a
// per-field selector, never as a bare `useXStore()` whole-store subscription.
//
// App renders the entire shell, so a whole-store subscription re-renders it on
// every store mutation — including per-keystroke `updateTabSql`, which also
// carries full result sets in the tabs store. `App.tsx` documents the fix
// (subscribe per-field; actions are stable refs, so selecting them individually
// is free) but the rule was applied in one file and never propagated: 26 call
// sites still took the whole store. This fitness function keeps that from
// creeping back — reintroduce a `useXStore()` with no selector and the build
// goes red, naming the file, the line, and the fix.
//
// Filed from issue #204 (whole-store subscriptions re-render the shell on every
// keystroke).
//
// Sanctioned exceptions:
//  - `*.stories.tsx` / `*.stories.ts` — stories mount components in isolation
//    and re-render cost is irrelevant to the harness.
//  - Comments are stripped before scanning, so prose that names the bare call as
//    an example does not trip the guard (mirrors the other renderer guards).
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const RENDERER_ROOT = path.join(
  __dirname,
  '..',
  '..',
  '..',
  'src',
  'renderer',
  'src',
)

// `useTabsStore()` (no argument) or `useTabsStore(  )` (whitespace only).
const BARE_STORE_CALL = /\buse[A-Za-z]*Store\(\s*\)/

const FIX =
  'subscribe per-field: `const tabs = useTabsStore(s => s.tabs)` instead of ' +
  '`const { tabs } = useTabsStore()`. App renders the whole shell, so a ' +
  'whole-store subscription re-renders it on every mutation; actions are stable ' +
  'refs, so selecting them individually is free (see App.tsx).'

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

/** Blank out comments while preserving line count, so a bare call named in prose
 *  is ignored but real line numbers survive for the failure message. Mirrors the
 *  helper in `renderer-backend-access-through-platform`. */
function stripComments(src: string): string {
  const noBlocks = src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
  return noBlocks
    .split('\n')
    .map((line) => line.replace(/(^|[^:])\/\/.*$/, '$1'))
    .join('\n')
}

describe('renderer store hooks are called with a selector (#204)', () => {
  const files = walk(RENDERER_ROOT)

  it('finds renderer source to scan', () => {
    expect(files.length).toBeGreaterThan(100)
  })

  it('does not call a store hook without a selector argument', () => {
    const offenders: string[] = []
    for (const file of files) {
      const lines = stripComments(fs.readFileSync(file, 'utf-8')).split('\n')
      lines.forEach((line, i) => {
        if (BARE_STORE_CALL.test(line)) {
          offenders.push(`${path.relative(RENDERER_ROOT, file)}:${i + 1}  — ${FIX}`)
        }
      })
    }
    expect(
      offenders,
      `whole-store subscription found (call the hook with a selector):\n${offenders.join(
        '\n',
      )}`,
    ).toEqual([])
  })

  // Guard the guard: the matcher must catch the bare form and must not flag the
  // sanctioned per-field selector form.
  it('flags a bare whole-store call', () => {
    expect(BARE_STORE_CALL.test('const { tabs } = useTabsStore()')).toBe(true)
    expect(BARE_STORE_CALL.test('  const x = useUiStore(  )')).toBe(true)
  })

  it('does not flag a per-field selector call', () => {
    expect(BARE_STORE_CALL.test('const tabs = useTabsStore(s => s.tabs)')).toBe(false)
    expect(BARE_STORE_CALL.test('useConnectionsStore.getState()')).toBe(false)
    expect(
      BARE_STORE_CALL.test('const useTabsStore = create<TabsStore>()(persist(fn))'),
    ).toBe(false)
  })
})
