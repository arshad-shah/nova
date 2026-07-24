import { IPC_CHANNELS } from '@shared/ipc'
import type { ActivityKind, ActivityLevel } from '@shared/activity'
import { ipc } from '@/platform/client'

export interface DiagnosticInput {
  kind: ActivityKind
  level?: ActivityLevel
  title: string
  detail?: string
  source?: string
  durationMs?: number
  stack?: string
  metadata?: Record<string, unknown>
  traceId?: string
}

/**
 * Renderer-side diagnostics. Verbose capture (store mutations, perf signals) is
 * off by default so there's zero overhead until a dev flips the Activity panel's
 * "verbose" toggle — which flips this flag, and the instrumentation reads it.
 */
let verbose = false
export function setDiagnosticsVerbose(on: boolean): void { verbose = on }
export function isDiagnosticsVerbose(): boolean { return verbose }

/** Push a renderer-originated entry into the unified, main-owned activity stream. */
export function recordActivity(input: DiagnosticInput): void {
  // Fire-and-forget, but never let recording a diagnostic *become* an unhandled
  // rejection itself — callers reach here precisely on their own error paths.
  ipc.optional(IPC_CHANNELS.ACTIVITY_RECORD, input)?.catch(() => {})
}
