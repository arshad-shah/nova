import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Box } from '@/primitives'
import type { ActivityEntry } from '@shared/activity'
import { useTranslation } from '@/i18n/I18nProvider'
import { clamp } from '@/lib/math'
import { computeDurationScale } from '@/lib/activity/scale'
import { ActivityRow } from './ActivityRow'

/** At/above this panel width a row collapses to one line and drops its duration
 *  bar. Measured on the panel, not the viewport — the panel resizes 220–640px
 *  independently of the window. */
const DENSE_MIN_WIDTH = 420

export interface ActivityStreamProps {
  /** Already filtered + capped — the rendered slice. */
  entries: ActivityEntry[]
  selectedId: string | null
  onSelect: (id: string) => void
  /** Close the drawer (Escape). */
  onClose: () => void
  /** Shown when `entries` is empty (nothing-yet vs no-match is decided upstream). */
  empty: React.ReactNode
}

/**
 * The scroll region: rows, panel-width measurement (drives the one/two-line row
 * layout), and keyboard selection (↑/↓ move, Esc closes). The duration scale is
 * computed from the rendered slice, so a bar answers "how does this compare to
 * what I'm looking at". Selecting a row never scrolls the stream (only keyboard
 * navigation nudges the newly-selected row into view).
 */
export function ActivityStream({ entries, selectedId, onSelect, onClose, empty }: ActivityStreamProps) {
  const { t } = useTranslation()
  const ref = useRef<HTMLDivElement>(null)
  const [dense, setDense] = useState(false)

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

  const selectByOffset = (delta: number) => {
    if (entries.length === 0) return
    const idx = selectedId ? entries.findIndex((e) => e.id === selectedId) : -1
    const nextId = entries[clamp(idx + delta, 0, entries.length - 1)].id
    onSelect(nextId)
    // Keyboard navigation keeps the selected row visible; a mouse click never
    // scrolls the stream.
    requestAnimationFrame(() => {
      ref.current?.querySelector(`[data-activity-row="${nextId}"]`)?.scrollIntoView({ block: 'nearest' })
    })
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); selectByOffset(1) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); selectByOffset(-1) }
    else if (e.key === 'Escape' && selectedId) { e.preventDefault(); onClose() }
  }

  return (
    <Box
      ref={ref}
      role={entries.length > 0 ? 'listbox' : undefined}
      aria-label={entries.length > 0 ? t('shell.secondaryPanel.activity') : undefined}
      tabIndex={entries.length > 0 ? 0 : undefined}
      onKeyDown={onKeyDown}
      className="min-h-0 flex-1 overflow-auto outline-none"
    >
      {entries.length === 0
        ? empty
        : entries.map((e) => (
            <ActivityRow
              key={e.id}
              entry={e}
              dense={dense}
              scale={scale}
              selected={selectedId === e.id}
              onSelect={() => onSelect(e.id)}
            />
          ))}
    </Box>
  )
}
