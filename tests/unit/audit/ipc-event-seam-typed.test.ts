import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

/**
 * Architectural guard for the main → renderer broadcast **event seam** (#166).
 *
 * Request/response IPC is fully typed through `IpcChannelMap`. The event seam
 * must be too: the payload of every broadcast event lives once in
 * `IpcEventShapes`, its wire string lives once in `IPC_EVENTS`, and the two are
 * derived into `IpcEventMap`. Two failure modes are guarded here:
 *
 *  1. **Orphans** — a shape without a wire string, or a wire string without a
 *     shape. `IPC_EVENTS` is declared `satisfies Record<keyof IpcEventShapes,
 *     string>`, so the compiler already rejects a mismatch; this test makes the
 *     invariant executable and greppable so loosening that `satisfies` (or
 *     hand-adding an event to only one of the two) fails a test, not just a
 *     silent type widening.
 *
 *  2. **A `string`-keyed listener seam** — `window.electronAPI.on` must be
 *     generic over `keyof IpcEventMap` so channel and payload infer together.
 *     A `channel: string` signature lets emitter and listener drift with no
 *     compiler check, which is exactly how `AI_CHAT_EVENT` shipped a
 *     one-arg shape for a two-arg wire contract.
 *
 * See docs/ipc.md.
 */

const repoRoot = process.cwd()

function read(rel: string): string {
  return fs.readFileSync(path.join(repoRoot, rel), 'utf-8')
}

/** Slice `{ … }` starting at the first brace after `header`, brace-matched. */
function braceBlock(src: string, header: string): string {
  const start = src.indexOf(header)
  if (start === -1) throw new Error(`could not find "${header}" in shared/ipc.ts`)
  const open = src.indexOf('{', start)
  let depth = 0
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++
    else if (src[i] === '}') {
      depth--
      if (depth === 0) return src.slice(open, i + 1)
    }
  }
  throw new Error(`unbalanced braces after "${header}"`)
}

/** Top-level `ALL_CAPS:` keys at two-space indent (skips nested union keys,
 *  which are camelCase like `streamId`/`kind`). */
function topLevelEventKeys(block: string): string[] {
  const keys = new Set<string>()
  for (const m of block.matchAll(/^ {2}([A-Z][A-Z0-9_]+):/gm)) keys.add(m[1])
  return [...keys].sort()
}

describe('IPC event seam is fully typed (#166)', () => {
  const ipc = read('shared/ipc.ts')
  const shapeKeys = topLevelEventKeys(braceBlock(ipc, 'export interface IpcEventShapes'))
  const eventKeys = topLevelEventKeys(braceBlock(ipc, 'export const IPC_EVENTS'))

  it('has no orphan events — IpcEventShapes and IPC_EVENTS are in bijection', () => {
    const onlyInShapes = shapeKeys.filter((k) => !eventKeys.includes(k))
    const onlyInEvents = eventKeys.filter((k) => !shapeKeys.includes(k))
    expect(
      { onlyInShapes, onlyInEvents },
      `\nIPC event seam drift:\n` +
        `  events declared in IpcEventShapes but missing a wire string in IPC_EVENTS: ${onlyInShapes.join(', ') || '(none)'}\n` +
        `  wire strings in IPC_EVENTS with no shape in IpcEventShapes: ${onlyInEvents.join(', ') || '(none)'}\n` +
        `Every broadcast event must appear in BOTH — declare its payload tuple in IpcEventShapes and its wire string in IPC_EVENTS.\n`,
    ).toEqual({ onlyInShapes: [], onlyInEvents: [] })
    expect(shapeKeys.length).toBeGreaterThan(0)
  })

  it('registers listeners by IpcEventMap key, not a bare string', () => {
    const preload = read('src/preload/index.ts')
    // The listener seam must be generic over the event map, not `channel: string`.
    expect(
      /on:\s*<[^>]*keyof IpcEventMap[^>]*>/.test(preload),
      `\nsrc/preload/index.ts on() must be generic over keyof IpcEventMap so the\n` +
        `channel constrains the callback payload. A "channel: string" signature lets\n` +
        `emitter and listener drift with no compiler check. See docs/ipc.md.\n`,
    ).toBe(true)
    expect(/on:\s*\(\s*channel:\s*string/.test(preload)).toBe(false)
  })

  // Guard the guard: the block parser + key filter must catch the shape it claims.
  it('key parser isolates top-level ALL_CAPS keys (parser sanity)', () => {
    const sample = `export const IPC_EVENTS = {\n  A_EVENT: 'a:evt',\n  B_EVENT: 'b:evt'\n} as const`
    expect(topLevelEventKeys(braceBlock(sample, 'export const IPC_EVENTS'))).toEqual(['A_EVENT', 'B_EVENT'])
    // A nested union with camelCase keys must not leak into the top-level set.
    const nested = `export interface IpcEventShapes {\n  X_EVENT: [e: { streamId: string; kind: 'token' }]\n  Y_EVENT: []\n}`
    expect(topLevelEventKeys(braceBlock(nested, 'export interface IpcEventShapes'))).toEqual(['X_EVENT', 'Y_EVENT'])
  })
})
