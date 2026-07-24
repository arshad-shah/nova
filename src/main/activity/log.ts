import { randomUUID } from 'crypto'
import type { ActivityEntry, ActivityKind, ActivityQuery } from '@shared/activity'
import { getCurrentTraceId } from './trace-context'

/** Read surface handed to consumers (e.g. the activity tool) via the service
 *  registry — list + live subscription, no ability to write. */
export interface ActivityReader {
  list(query?: ActivityQuery): ActivityEntry[]
  subscribe(listener: (entry: ActivityEntry) => void): () => void
}

export interface RecordInput {
  kind: ActivityKind
  level?: ActivityEntry['level']
  title: string
  detail?: string
  source?: string
  durationMs?: number
  stack?: string
  metadata?: Record<string, unknown>
  traceId?: string
}

const DEFAULT_CAP = 1000
/** Hard cap on any single stored text field so a giant SQL/error can't bloat
 *  the in-memory ring (and the entries sent to the renderer). */
const MAX_TEXT = 2000

function clip(text: string | undefined): string | undefined {
  if (text === undefined) return undefined
  return text.length > MAX_TEXT ? text.slice(0, MAX_TEXT - 1) + '…' : text
}

/** Bound the structured payload so a huge metadata blob can't bloat the ring or
 *  the IPC batch. Drops the payload entirely if it can't be serialised. */
const MAX_META = 8000
function clipMetadata(meta: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!meta) return undefined
  try {
    const json = JSON.stringify(meta)
    if (json.length <= MAX_META) return meta
    return { _truncated: true, preview: json.slice(0, MAX_META) + '…' }
  } catch {
    return { _unserializable: true }
  }
}

/**
 * In-memory ring buffer of app activity. Newest entries are appended; once the
 * cap is reached the oldest are dropped. `list()` returns newest-first.
 */
export class ActivityLog implements ActivityReader {
  private entries: ActivityEntry[] = []
  private listeners = new Set<(entry: ActivityEntry) => void>()

  constructor(private cap: number = DEFAULT_CAP) {}

  record(input: RecordInput): ActivityEntry {
    const entry: ActivityEntry = {
      id: randomUUID(),
      ts: Date.now(),
      kind: input.kind,
      level: input.level ?? 'info',
      title: clip(input.title) ?? '',
      detail: clip(input.detail),
      source: input.source,
      durationMs: input.durationMs,
      stack: clip(input.stack),
      metadata: clipMetadata(input.metadata),
      // An explicit id wins; otherwise inherit the ambient trace of the action
      // currently being handled (an IPC call, a tool call), so every entry that
      // action causes correlates without each recorder threading the id.
      traceId: input.traceId ?? getCurrentTraceId(),
    }
    this.entries.push(entry)
    if (this.entries.length > this.cap) {
      this.entries.splice(0, this.entries.length - this.cap)
    }
    for (const l of this.listeners) {
      try { l(entry) } catch { /* a bad listener must not break recording */ }
    }
    return entry
  }

  list(query: ActivityQuery = {}): ActivityEntry[] {
    const kinds = query.kinds && query.kinds.length > 0 ? new Set(query.kinds) : null
    const levels = query.levels && query.levels.length > 0 ? new Set(query.levels) : null
    let out = this.entries
    if (kinds || levels || query.sinceTs !== undefined) {
      out = out.filter(
        e =>
          (!kinds || kinds.has(e.kind)) &&
          (!levels || levels.has(e.level)) &&
          (query.sinceTs === undefined || e.ts >= query.sinceTs),
      )
    }
    // Newest first.
    out = [...out].reverse()
    if (query.limit !== undefined && query.limit >= 0) out = out.slice(0, query.limit)
    return out
  }

  subscribe(listener: (entry: ActivityEntry) => void): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  clear(): void {
    this.entries = []
  }
}
