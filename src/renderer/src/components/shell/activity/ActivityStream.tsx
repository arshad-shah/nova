import React, { useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from 'react'
import { ArrowDown } from 'lucide-react'
import { Box, Button, cn } from '@/primitives'
import type { ActivityEntry } from '@shared/activity'
import { useTranslation } from '@/i18n/I18nProvider'
import { clamp } from '@/lib/math'
import { computeDurationScale } from '@/lib/activity/scale'
import {
  tailReducer, countPrepended, isAtBottom, INITIAL_TAIL,
} from '@/lib/activity/tail'
import { ActivityRow } from './ActivityRow'

/** At/above this panel width a row collapses to one line and drops its duration
 *  bar. Measured on the panel, not the viewport — the panel resizes 220–640px
 *  independently of the window. */
const DENSE_MIN_WIDTH = 420

export interface ActivityStreamProps {
  /** Already filtered + capped — the rendered slice, newest-first. */
  entries: ActivityEntry[]
  /** How many older matches were dropped by the render cap (0 when none). */
  hiddenOlder: number
  selectedId: string | null
  onSelect: (id: string) => void
  /** Close the drawer (Escape). */
  onClose: () => void
  /** Shown when `entries` is empty (nothing-yet vs no-match is decided upstream). */
  empty: React.ReactNode
}

/**
 * The scroll region — a newest-at-bottom tail. It follows new entries while the
 * user is at the bottom and detaches on scroll-up, surfacing a "N new" pill that
 * re-pins on click. Panel-width measurement drives the one/two-line row layout;
 * the duration scale is computed from the rendered slice; ↑/↓ move selection and
 * Esc closes the drawer. Selecting a row never scrolls the stream.
 */
export function ActivityStream({ entries, hiddenOlder, selectedId, onSelect, onClose, empty }: ActivityStreamProps) {
  const { t } = useTranslation()
  const scrollRef = useRef<HTMLDivElement>(null)
  const [dense, setDense] = useState(false)
  const [tail, dispatch] = useReducer(tailReducer, INITIAL_TAIL)
  const prevTopId = useRef<string | null>(null)

  // Display order is oldest→newest (the store keeps newest-first).
  const display = useMemo(() => [...entries].reverse(), [entries])

  useEffect(() => {
    const el = scrollRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver((observed) => {
      const width = observed[0]?.contentRect.width ?? 0
      setDense(width >= DENSE_MIN_WIDTH)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Track arrivals (prepends to the newest-first list). A wholesale change
  // (filter switch / clear) re-pins rather than counting the diff as arrivals.
  useEffect(() => {
    const top = entries[0]?.id ?? null
    const arrived = countPrepended(prevTopId.current, entries)
    if (arrived < 0) dispatch({ type: 'reset' })
    else if (arrived > 0) dispatch({ type: 'appended', count: arrived })
    prevTopId.current = top
  }, [entries])

  // While pinned, keep the newest entry in view as the stream grows / the drawer
  // resizes.
  useLayoutEffect(() => {
    if (!tail.pinned) return
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [display, tail.pinned])

  const scale = useMemo(
    () => computeDurationScale(entries.filter((e) => e.durationMs !== undefined).map((e) => e.durationMs!)),
    [entries],
  )

  const onScroll = () => {
    const el = scrollRef.current
    if (!el) return
    dispatch({ type: 'scrolled', atBottom: isAtBottom(el.scrollTop, el.scrollHeight, el.clientHeight) })
  }

  const repin = () => {
    dispatch({ type: 'repin' })
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }

  const selectByOffset = (delta: number) => {
    if (display.length === 0) return
    const idx = selectedId ? display.findIndex((e) => e.id === selectedId) : (delta > 0 ? -1 : display.length)
    const nextId = display[clamp(idx + delta, 0, display.length - 1)].id
    onSelect(nextId)
    // Keyboard navigation keeps the selected row visible; a mouse click never
    // scrolls the stream.
    requestAnimationFrame(() => {
      scrollRef.current?.querySelector(`[data-activity-row="${nextId}"]`)?.scrollIntoView({ block: 'nearest' })
    })
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); selectByOffset(1) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); selectByOffset(-1) }
    else if (e.key === 'Escape' && selectedId) { e.preventDefault(); onClose() }
  }

  const isEmpty = display.length === 0

  return (
    <Box className="relative min-h-0 flex-1">
      <Box
        ref={scrollRef}
        onScroll={onScroll}
        role={isEmpty ? undefined : 'listbox'}
        aria-label={isEmpty ? undefined : t('shell.secondaryPanel.activity')}
        tabIndex={isEmpty ? undefined : 0}
        onKeyDown={onKeyDown}
        className="h-full overflow-auto outline-none"
      >
        {isEmpty ? (
          empty
        ) : (
          <>
            {hiddenOlder > 0 && (
              <Box className="border-b border-border/50 bg-bg-inset px-3 py-1 text-center text-3xs text-text-muted">
                {t('shell.activity.olderHidden')}
              </Box>
            )}
            {display.map((e) => (
              <ActivityRow
                key={e.id}
                entry={e}
                dense={dense}
                scale={scale}
                selected={selectedId === e.id}
                onSelect={() => onSelect(e.id)}
              />
            ))}
          </>
        )}
      </Box>

      {/* Tail pill — only while detached with unseen arrivals. */}
      {!tail.pinned && tail.unseen > 0 && (
        <Box className="pointer-events-none absolute inset-x-0 bottom-2 flex justify-center">
          <Button
            variant="bare"
            size="none"
            type="button"
            onClick={repin}
            title={t('shell.activity.tailResume')}
            className={cn(
              'pointer-events-auto flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-3xs font-medium text-accent-fg shadow-md',
            )}
          >
            <ArrowDown size={11} />
            {t('shell.activity.tailNew', { count: tail.unseen })}
          </Button>
        </Box>
      )}
    </Box>
  )
}
