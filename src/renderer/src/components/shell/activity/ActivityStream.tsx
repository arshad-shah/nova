import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Box } from '@/primitives'
import type { ActivityEntry } from '@shared/activity'
import { computeDurationScale } from '@/lib/activity/scale'
import { ActivityRow } from './ActivityRow'

/** At/above this panel width a row collapses to one line and drops its duration
 *  bar. Measured on the panel, not the viewport — the panel resizes 220–640px
 *  independently of the window. */
const DENSE_MIN_WIDTH = 420

export interface ActivityStreamProps {
  /** Already filtered + capped — the rendered slice. */
  entries: ActivityEntry[]
  /** Shown when `entries` is empty (nothing-yet vs no-match is decided upstream). */
  empty: React.ReactNode
}

/**
 * The scroll region: rows, and the panel-width measurement that drives the
 * one-line/two-line row layout. The duration scale is computed from the
 * rendered slice (not the whole store), so a bar answers "how does this compare
 * to what I'm looking at".
 */
export function ActivityStream({ entries, empty }: ActivityStreamProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [dense, setDense] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  useEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver((observed) => {
      const width = observed[0]?.contentRect.width ?? 0
      setDense(width >= DENSE_MIN_WIDTH)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const scale = useMemo(
    () => computeDurationScale(entries.filter((e) => e.durationMs !== undefined).map((e) => e.durationMs!)),
    [entries],
  )

  return (
    <Box ref={ref} className="min-h-0 flex-1 overflow-auto">
      {entries.length === 0
        ? empty
        : entries.map((e) => (
            <ActivityRow
              key={e.id}
              entry={e}
              dense={dense}
              scale={scale}
              expanded={expandedId === e.id}
              onToggle={() => setExpandedId((id) => (id === e.id ? null : e.id))}
            />
          ))}
    </Box>
  )
}
