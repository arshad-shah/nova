// Guard — every renderer→backend call must go through the single platform
// client (`src/renderer/src/platform/`), never `window.electronAPI` directly.
//
// One chokepoint is the only place cross-cutting behaviour (error
// normalization, activity logging, retry, cancellation, instrumentation) can be
// added consistently. Before #165 ~89 files reached for `window.electronAPI`
// directly, so the sanctioned `useIpcQuery` hook competed with a raw idiom for
// the same operation and neither path could grow a shared concern without
// editing dozens of files. This fitness function keeps that from creeping back:
// touch the bridge outside `platform/` and the build goes red, naming the file,
// the line, and the seam to use instead.
//
// Filed from issue #165 (centralize renderer backend access behind one client
// layer).
//
// Sanctioned exceptions:
//  - `platform/**` — the client itself is the one place that reads the bridge.
//  - `*.stories.tsx` / `*.stories.ts` — Storybook has no preload, so stories
//    inject the bridge by assigning `window.electronAPI = {…}`. That assignment
//    IS the test seam the client reads; it is a harness concern, not app code.
//  - Comments are stripped before scanning, so prose that names the bridge as an
//    example does not trip the guard (mirrors the other renderer guards).
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
const PLATFORM_DIR = path.join(RENDERER_ROOT, 'platform')

const FIX =
  'route through the platform client: `import { ipc } from "@/platform/client"` ' +
  '(ipc.invoke / ipc.on / ipc.optional / ipc.available() / ipc.platform())'

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (p === PLATFORM_DIR) continue // the client itself is the one exception
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

/** Blank out comments while preserving line count, so the bridge named in prose
 *  is ignored but real line numbers survive for the failure message. Mirrors the
 *  helper in `renderer-no-raw-html-primitives`. */
function stripComments(src: string): string {
  const noBlocks = src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
  return noBlocks
    .split('\n')
    .map((line) => line.replace(/(^|[^:])\/\/.*$/, '$1'))
    .join('\n')
}

describe('renderer backend access goes through the platform client (#165)', () => {
  const files = walk(RENDERER_ROOT)

  it('finds renderer source to scan', () => {
    expect(files.length).toBeGreaterThan(100)
  })

  it('has the platform client present', () => {
    expect(fs.existsSync(path.join(PLATFORM_DIR, 'client.ts'))).toBe(true)
  })

  it('does not reference window.electronAPI outside src/renderer/src/platform', () => {
    const offenders: string[] = []
    for (const file of files) {
      const lines = stripComments(fs.readFileSync(file, 'utf-8')).split('\n')
      lines.forEach((line, i) => {
        if (/electronAPI/.test(line)) {
          offenders.push(`${path.relative(RENDERER_ROOT, file)}:${i + 1}  — ${FIX}`)
        }
      })
    }
    expect(
      offenders,
      `direct window.electronAPI access found outside the platform client:\n${offenders.join(
        '\n',
      )}`,
    ).toEqual([])
  })
})
