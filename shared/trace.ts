/**
 * Trace envelope — how a renderer-minted trace id rides the IPC wire.
 *
 * Electron's `ipcRenderer.invoke(channel, ...args)` has no separate envelope, so
 * the platform client (the single renderer→main chokepoint) appends a small
 * marker object as the **last** argument of every invoke. The main-side handler
 * wrappers strip it before calling the real handler and stash the id in an
 * ambient context (`src/main/activity/trace-context.ts`) so every `recordActivity`
 * caused by that call correlates without threading a parameter through each
 * recorder.
 *
 * The marker uses a single, reserved key (`__verqlTrace`) that no channel's real
 * arguments use, and `isTraceEnvelope` additionally requires the object to carry
 * *only* that key — so a genuine argument that happens to include a `__verqlTrace`
 * field is never mistaken for the envelope, and the envelope is never mistaken
 * for a genuine argument.
 */

export const TRACE_ENVELOPE_KEY = '__verqlTrace' as const

export interface TraceEnvelope {
  readonly [TRACE_ENVELOPE_KEY]: string
}

export function makeTraceEnvelope(traceId: string): TraceEnvelope {
  return { [TRACE_ENVELOPE_KEY]: traceId }
}

export function isTraceEnvelope(value: unknown): value is TraceEnvelope {
  if (typeof value !== 'object' || value === null) return false
  const keys = Object.keys(value as Record<string, unknown>)
  return keys.length === 1 && keys[0] === TRACE_ENVELOPE_KEY &&
    typeof (value as Record<string, unknown>)[TRACE_ENVELOPE_KEY] === 'string'
}

/**
 * Split a raw IPC argument list into the real channel arguments and the trace id
 * carried by a trailing envelope (if any). Handlers get the arguments they
 * declared; the id feeds the ambient trace context.
 */
export function extractTraceEnvelope(args: readonly unknown[]): { args: unknown[]; traceId?: string } {
  if (args.length > 0) {
    const last = args[args.length - 1]
    if (isTraceEnvelope(last)) {
      return { args: args.slice(0, -1), traceId: last[TRACE_ENVELOPE_KEY] }
    }
  }
  return { args: [...args] }
}

/**
 * Mint a fresh trace id.
 *
 * Deliberately built on the **Web Crypto** global rather than `node:crypto`,
 * because the preload bridge — the one place renderer→main traces are born —
 * runs with `sandbox: true` (see `src/main/index.ts`). A sandboxed preload gets
 * Chromium's web platform and a `require` that resolves only `electron`,
 * `events`, `timers` and `url`; `require('node:crypto')` throws "module not
 * found" there, which aborts the preload *before*
 * `contextBridge.exposeInMainWorld` runs. The renderer then boots with no
 * `window.electronAPI` at all and hangs on the splash forever, because every
 * IPC call — starting with the settings hydrate that dismisses the splash —
 * fails at the bridge.
 *
 * That failure mode is invisible to the unit suite (Vitest runs on Node, where
 * `node:crypto` resolves fine), so the rule is pinned statically by
 * `tests/unit/audit/preload-sandbox-safe.test.ts` instead.
 *
 * `globalThis.crypto.randomUUID` is available in all three processes: Node ≥19
 * exposes Web Crypto globally, and Chromium exposes it in any secure context
 * (`file://` and `http://localhost`, which is every context Verql loads the
 * renderer from). The fallback exists so a trace id is still minted if that
 * ever stops holding — a trace id only has to be unique enough to correlate
 * one session's activity entries, so a non-cryptographic id is correct here.
 * Never reuse this for anything security-bearing.
 */
let traceCounter = 0

export function newTraceId(): string {
  // Structural type rather than the DOM `Crypto` lib type: `shared/` compiles
  // under both the node and web tsconfigs, and this only needs the one method.
  const webCrypto = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto
  if (typeof webCrypto?.randomUUID === 'function') return webCrypto.randomUUID()
  traceCounter = (traceCounter + 1) % Number.MAX_SAFE_INTEGER
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}-${traceCounter}`
}
