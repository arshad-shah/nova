/**
 * Duration-bar scaling — pure, so the row just reads a fraction and a flag.
 *
 * A row's duration hairline is scaled against the **slowest entry currently in
 * view**, not the whole store: the bar answers "how does this compare to what
 * I'm looking at", and recomputing from the rendered slice keeps that honest as
 * the user filters or scrolls. Past the p95 of the visible durations the bar
 * switches to the warning tone, so the few genuinely-slow operations stand out
 * instead of every bar looking busy.
 */

export interface DurationScale {
  /** The slowest visible duration (bars scale against this). 0 when none. */
  readonly max: number
  /** The p95 threshold of the visible durations. `Infinity` when none. */
  readonly p95: number
  /** This duration's bar fill, 0..1, relative to `max`. */
  fraction(durationMs: number): number
  /** Whether this duration is at/above the p95 threshold (draws the warning tone). */
  isSlow(durationMs: number): boolean
}

/** The 95th-percentile value of a numeric list (nearest-rank). `Infinity` when
 *  the list is empty, so nothing reads as slow. */
export function percentile(values: number[], p: number): number {
  if (values.length === 0) return Infinity
  const sorted = [...values].sort((a, b) => a - b)
  // Nearest-rank: rank = ceil(p * n), clamped into [1, n]; index is rank-1.
  const rank = Math.ceil(p * sorted.length)
  const index = Math.min(Math.max(rank, 1), sorted.length) - 1
  return sorted[index]
}

/**
 * Build a scale from the durations currently in view. Pass only the entries
 * that have a `durationMs`; entries without one draw no bar.
 */
export function computeDurationScale(durations: number[]): DurationScale {
  const positive = durations.filter((d) => Number.isFinite(d) && d > 0)
  const max = positive.length > 0 ? Math.max(...positive) : 0
  const p95 = percentile(positive, 0.95)
  return {
    max,
    p95,
    fraction(durationMs: number): number {
      if (max <= 0 || !Number.isFinite(durationMs) || durationMs <= 0) return 0
      return Math.min(durationMs / max, 1)
    },
    isSlow(durationMs: number): boolean {
      return Number.isFinite(p95) && durationMs >= p95 && durationMs > 0
    },
  }
}
