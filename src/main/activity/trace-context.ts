import { AsyncLocalStorage } from 'node:async_hooks'
import { randomUUID } from 'node:crypto'

/**
 * Ambient trace context (main process).
 *
 * A trace correlates the entries a single action causes — e.g. a query
 * execution's `ipc`, `query`, driver and `perf` entries, or a tool call and the
 * `network` requests it triggers. Rather than thread a `traceId` parameter
 * through every recorder, the seam that owns the action (`src/main/ipc/context.ts`
 * for renderer-initiated calls, the tool registry for tool calls) runs the work
 * inside `runWithTrace`, and `ActivityLog.record` reads the ambient id when a
 * call site doesn't set one explicitly.
 *
 * Outside any `runWithTrace` scope `getCurrentTraceId()` is `undefined`, so a
 * standalone recorder (plugin boot, a diagnostic log line) records fine and,
 * correctly, without a trace.
 */
const storage = new AsyncLocalStorage<{ traceId: string }>()

/** Mint a fresh trace id. */
export function newTraceId(): string {
  return randomUUID()
}

/**
 * Run `fn` with `traceId` as the ambient trace. A falsy id runs `fn` unwrapped,
 * so an untraced call keeps no trace instead of inventing an empty one.
 */
export function runWithTrace<T>(traceId: string | undefined, fn: () => T): T {
  if (!traceId) return fn()
  return storage.run({ traceId }, fn)
}

/** The ambient trace id, or `undefined` outside any `runWithTrace` scope. */
export function getCurrentTraceId(): string | undefined {
  return storage.getStore()?.traceId
}
