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
