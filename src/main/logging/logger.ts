import { createLogger as createKitLogger } from '@arshad-shah/log-kit'
import type { Logger as KitLogger, LogRecord, Transport } from '@arshad-shah/log-kit'
import type { RecordInput } from '../activity/log'
import { ACTIVITY_KIND } from '@shared/activity'

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

/** Minimal sink the logger records into — the app activity log implements it. */
export interface LogSink {
  record(input: RecordInput): unknown
}

export interface Logger {
  debug(message: string, detail?: unknown): void
  info(message: string, detail?: unknown): void
  warn(message: string, detail?: unknown): void
  error(message: string, detail?: unknown): void
  /** A logger that prefixes a narrower scope (e.g. `app` → `app:plugins`). */
  child(scope: string): Logger
  /**
   * Start a one-line operation timer. The returned `end()` records a `log`
   * entry carrying `durationMs` (measured from the call) into the activity
   * stream and returns that duration so callers can reuse it.
   */
  mark(label: string): (extra?: Record<string, unknown>) => number
}

/** debug logs print via console but stay out of the UI unless explicitly kept. */
const CONSOLE: Record<LogLevel, (...args: unknown[]) => void> = {
  debug: (...a) => console.debug(...a),
  info: (...a) => console.log(...a),
  warn: (...a) => console.warn(...a),
  error: (...a) => console.error(...a),
}

/** log-kit emits six levels; the app's activity stream + console map to four. */
function toAppLevel(level: LogRecord['level']): LogLevel {
  if (level === 'trace' || level === 'debug') return 'debug'
  if (level === 'warn') return 'warn'
  if (level === 'error' || level === 'fatal') return 'error'
  return 'info'
}

// Keys whose values are redacted before an object detail is serialised, so a
// careless call site (e.g. logging a whole ConnectionProfile, which holds
// plaintext secrets in memory) can't leak credentials into the console or the
// persisted activity stream. Key-name based — covers the structured-object
// footgun; free-text strings/stacks are still passed through as-is.
const SECRET_KEY_PATTERN = /pass(word)?|secret|token|api[-_]?key|^key$|credential|authorization|^auth$/i
const REDACTED = '[redacted]'

/** Recursively copy a value, replacing any property whose key looks secret with
 *  `[redacted]`. Depth-capped so a cyclic/huge object can't run away. */
function redactSecrets(value: unknown, depth = 0): unknown {
  if (depth > 6 || value === null || typeof value !== 'object') return value
  if (Array.isArray(value)) return value.map((v) => redactSecrets(v, depth + 1))
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = SECRET_KEY_PATTERN.test(k) ? REDACTED : redactSecrets(v, depth + 1)
  }
  return out
}

/** Turn an arbitrary detail value into a readable, secret-redacted string. */
function stringifyDetail(detail: unknown): string | undefined {
  if (detail === undefined || detail === null) return undefined
  if (typeof detail === 'string') return detail
  if (detail instanceof Error) return detail.stack ?? `${detail.name}: ${detail.message}`
  try {
    return JSON.stringify(redactSecrets(detail), null, 2)
  } catch {
    return String(detail)
  }
}

/** Pull a renderable detail string + an optional duration out of a record's
 *  context. The facade stashes a pre-serialised string under `detail`; perf
 *  markers contribute `durationMs`; anything else is JSON-stringified. */
function readContext(context: Record<string, unknown>): {
  detail: string | undefined
  durationMs: number | undefined
} {
  const { detail, durationMs, ...rest } = context as {
    detail?: unknown
    durationMs?: unknown
  }
  let detailStr: string | undefined
  if (typeof detail === 'string') detailStr = detail
  else if (Object.keys(rest).length > 0) detailStr = stringifyDetail(rest)
  return {
    detail: detailStr,
    durationMs: typeof durationMs === 'number' ? durationMs : undefined,
  }
}

/** Console transport: preserves the app's `[scope] message` format and the
 *  level→console-method mapping (info → `console.log`) the terminal/devtools
 *  workflows rely on. */
const consoleTransport: Transport = {
  name: 'console',
  write: (record) => {
    const { detail } = readContext(record.context)
    const prefix = record.scope ? `[${record.scope}] ` : ''
    CONSOLE[toAppLevel(record.level)](
      `${prefix}${record.message}`,
      ...(detail !== undefined ? [detail] : []),
    )
  },
}

/** Activity transport: records every line into the unified activity stream as a
 *  `log` entry so users and developers can read, filter, search, and export
 *  diagnostics from the in-app Activity panel. Scope is carried as `source`. */
function activityTransport(sink: LogSink): Transport {
  return {
    name: 'activity',
    write: (record) => {
      const { detail, durationMs } = readContext(record.context)
      sink.record({
        kind: ACTIVITY_KIND.LOG,
        level: toAppLevel(record.level),
        title: record.message,
        detail,
        source: record.scope,
        durationMs,
      })
    },
  }
}

/** Wrap a log-kit logger in the app's narrower facade: a fixed four-level
 *  surface that serialises an arbitrary `detail` value, plus `child` and the
 *  `mark` perf timer. */
function wrap(kit: KitLogger): Logger {
  const emit = (level: LogLevel, message: string, detail?: unknown): void => {
    const detailStr = stringifyDetail(detail)
    kit.log({
      level,
      message,
      context: detailStr !== undefined ? { detail: detailStr } : {},
    })
  }
  return {
    debug: (message, detail) => emit('debug', message, detail),
    info: (message, detail) => emit('info', message, detail),
    warn: (message, detail) => emit('warn', message, detail),
    error: (message, detail) => emit('error', message, detail),
    child: (sub) => wrap(kit.child(sub)),
    mark: (label) => kit.mark(label),
  }
}

/**
 * App logger (glue), built on `@arshad-shah/log-kit`. Every line is mirrored to
 * the console (so terminal / devtools workflows are unchanged) *and* recorded
 * into the unified activity stream as a `log` entry, so users and developers
 * can read, filter, search, and export diagnostics from the in-app Activity
 * panel — no log files to dig out. Scope is carried as the entry `source`.
 *
 * log-kit owns the record pipeline (level gating, child-scope nesting, perf
 * markers) and fans each record out to the two transports below with failure
 * isolation — a throwing sink can never break console output, or vice versa.
 */
export function createLogger(sink: LogSink, scope = 'app'): Logger {
  const kit = createKitLogger({
    // The app surfaces debug in the activity stream (the panel filters it);
    // keep the threshold at the floor so nothing is dropped before transports.
    level: 'debug',
    scope,
    transports: [consoleTransport, activityTransport(sink)],
    // A failing transport is swallowed so logging keeps working; surface it on
    // the console rather than losing it silently.
    onTransportError: (err, info) => {
      try {
        console.error(`[logger] ${info.transport} ${info.op} failed`, err)
      } catch {
        /* console itself unavailable — nothing more we can do */
      }
    },
  })
  return wrap(kit)
}
