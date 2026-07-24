import type { ActivityEntry, ActivityLevel } from '@shared/activity'

/**
 * Group a flat, time-ordered entry list into an order-stable list of trace
 * groups and bare entries — pure, so the component just renders the shape.
 *
 * A mixed stream is the normal case: entries without a `traceId`, and traces
 * with only one matching entry, pass through as bare rows. Only a trace with
 * two or more entries becomes a group, anchored in the output at the position of
 * its first entry in the input (so order stays stable as the stream appends).
 *
 * Filters apply to entries *before* grouping (the caller passes the filtered
 * set); pass `traceTotals` (per-trace counts from the unfiltered set) to surface
 * how many children a filter hid.
 */

export interface TraceGroup {
  traceId: string
  /** The entry that best represents the action (see pickParent). */
  parent: ActivityEntry
  /** All matching entries in the trace, in input order. */
  entries: ActivityEntry[]
  /** Matching entries other than the parent, in input order. */
  children: ActivityEntry[]
  /** Rolled-up severity: the max over all entries, so a child error shows on the
   *  group even when the parent succeeded. */
  level: ActivityLevel
  /** Window for child span bars. */
  start: number
  end: number
  /** Matching children hidden by a filter (or the render cap); 0 when none. */
  hiddenChildren: number
}

export type StreamItem =
  | { type: 'group'; group: TraceGroup }
  | { type: 'entry'; entry: ActivityEntry }

const SEVERITY_RANK: Record<ActivityLevel, number> = {
  debug: 0, info: 1, success: 2, warn: 3, error: 4,
}

export function maxLevel(entries: readonly ActivityEntry[]): ActivityLevel {
  return entries.reduce<ActivityLevel>(
    (worst, e) => (SEVERITY_RANK[e.level] > SEVERITY_RANK[worst] ? e.level : worst),
    'debug',
  )
}

/**
 * The entry that best represents the action: prefer the longest-running one
 * (it's usually the operation itself rather than a fast sub-step), tie-broken to
 * the earliest (the action's origin). Entries without a duration count as 0.
 */
export function pickParent(entries: readonly ActivityEntry[]): ActivityEntry {
  return entries.reduce((best, e) => {
    const d = e.durationMs ?? 0
    const bd = best.durationMs ?? 0
    if (d > bd) return e
    if (d === bd && e.ts < best.ts) return e
    return best
  })
}

function buildGroup(traceId: string, entries: ActivityEntry[], total: number): TraceGroup {
  const parent = pickParent(entries)
  const start = Math.min(...entries.map((e) => e.ts))
  const end = Math.max(...entries.map((e) => e.ts + (e.durationMs ?? 0)))
  return {
    traceId,
    parent,
    entries,
    children: entries.filter((e) => e.id !== parent.id),
    level: maxLevel(entries),
    start,
    end,
    hiddenChildren: Math.max(0, total - entries.length),
  }
}

export function groupEntries(
  entries: ActivityEntry[],
  traceTotals?: Map<string, number>,
): StreamItem[] {
  // Collect the matching entries per trace, preserving input order.
  const byTrace = new Map<string, ActivityEntry[]>()
  for (const e of entries) {
    if (!e.traceId) continue
    const arr = byTrace.get(e.traceId)
    if (arr) arr.push(e)
    else byTrace.set(e.traceId, [e])
  }

  const emitted = new Set<string>()
  const out: StreamItem[] = []
  for (const e of entries) {
    if (!e.traceId) {
      out.push({ type: 'entry', entry: e })
      continue
    }
    const arr = byTrace.get(e.traceId)!
    // A lone matching entry is a bare row, not a trivial one-entry group.
    if (arr.length < 2) {
      out.push({ type: 'entry', entry: e })
      continue
    }
    if (emitted.has(e.traceId)) continue
    emitted.add(e.traceId)
    const total = traceTotals?.get(e.traceId) ?? arr.length
    out.push({ type: 'group', group: buildGroup(e.traceId, arr, total) })
  }
  return out
}

/** Per-trace entry counts over an (unfiltered) list, for `hiddenChildren`. */
export function traceTotals(entries: readonly ActivityEntry[]): Map<string, number> {
  const totals = new Map<string, number>()
  for (const e of entries) {
    if (!e.traceId) continue
    totals.set(e.traceId, (totals.get(e.traceId) ?? 0) + 1)
  }
  return totals
}
