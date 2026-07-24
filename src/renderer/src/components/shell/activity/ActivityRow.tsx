import React from 'react'
import { Flex, Box, cn } from '@/primitives'
import type { ActivityEntry } from '@shared/activity'
import { useTranslation } from '@/i18n/I18nProvider'
import { formatClockTime } from '@/lib/format-time'
import { KIND_META, KIND_TONE_CLASS, LEVEL_RAIL_CLASS } from '@/lib/activity/meta'
import type { DurationScale } from '@/lib/activity/scale'

/** Fixed timestamp-gutter width. An inline pixel width (the sanctioned
 *  exception for a density-independent gutter), not a design width step. */
const GUTTER_WIDTH = 44

function Timestamp({ ts }: { ts: number }) {
  return (
    <Box
      as="span"
      className="shrink-0 font-mono text-3xs tabular-nums text-text-tertiary"
      // Fixed gutter width — sanctioned inline exception (density-independent).
      style={{ width: GUTTER_WIDTH }}
    >
      {formatClockTime(ts)}
    </Box>
  )
}

/** The kind glyph + label, tinted by the kind's accent tone (data / agent /
 *  muted). Interface state (purple) is never a kind colour. */
function KindTag({ entry }: { entry: ActivityEntry }) {
  const { t } = useTranslation()
  const { icon: Icon, label, tone } = KIND_META[entry.kind]
  return (
    <Box as="span" className={cn('inline-flex shrink-0 items-center gap-1', KIND_TONE_CLASS[tone])}>
      <Icon size={11} className="shrink-0" />
      <Box as="span">{t(label)}</Box>
    </Box>
  )
}

/** The 2px duration hairline, scaled against the slowest entry in view; past the
 *  p95 of visible durations it takes the warning tone. */
function DurationBar({ durationMs, scale }: { durationMs: number; scale: DurationScale }) {
  return (
    <Box aria-hidden className="mt-1 h-0.5 w-full overflow-hidden rounded-full bg-bg-inset">
      <Box
        className={cn('h-full rounded-full', scale.isSlow(durationMs) ? 'bg-warning' : 'bg-text-muted/60')}
        // Dynamic fill — sanctioned inline width exception.
        style={{ width: `${scale.fraction(durationMs) * 100}%` }}
      />
    </Box>
  )
}

export interface ActivityRowProps {
  entry: ActivityEntry
  /** Panel is wide enough for one line (drops the duration bar). */
  dense: boolean
  scale: DurationScale
  selected: boolean
  onSelect: () => void
}

/**
 * One activity entry. The message owns the full width; everything else is a
 * gutter. Severity moves to the panel edge (the rail); the kind, source and
 * duration sit quietly on the meta line beneath the message (or inline, when the
 * panel is wide). The whole row is the affordance — no chevron; selecting it
 * fills the detail drawer rather than expanding inline.
 */
export function ActivityRow({ entry, dense, scale, selected, onSelect }: ActivityRowProps) {
  const { t } = useTranslation()
  const { label } = KIND_META[entry.kind]
  const durationText = entry.durationMs !== undefined ? `${Math.round(entry.durationMs)}ms` : null
  const showBar = !dense && entry.durationMs !== undefined

  // Severity is never colour-only: the accessible name carries level + kind.
  const accessibleName = `${entry.level} ${t(label)}: ${entry.title}`

  return (
    <Box
      className={cn(
        'relative cursor-pointer border-b border-border/50',
        // Selection reads as interface state (accent) at low opacity, alongside
        // the rail; hover is a plain wash.
        selected ? 'bg-accent/10' : 'hover:bg-hover',
        // ~5% error wash so a failure has more visual mass than the rail alone.
        entry.level === 'error' && !selected && 'bg-error/5',
      )}
      role="option"
      aria-selected={selected}
      tabIndex={selected ? 0 : -1}
      data-activity-row={entry.id}
      aria-label={accessibleName}
      onClick={onSelect}
      onKeyDown={(e: React.KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect() }
      }}
    >
      {/* Severity rail — the full-bleed 2px left edge (2px = w-0.5). */}
      <Box aria-hidden className={cn('absolute left-0 top-0 bottom-0 w-0.5', LEVEL_RAIL_CLASS[entry.level])} />

      <Box className="py-1.5 pl-3 pr-3">
        {dense ? (
          // Wide panel: single line, no duration bar.
          <Flex align="center" gap="sm" className="min-w-0">
            <Timestamp ts={entry.ts} />
            <Box as="span" className={cn('min-w-0 flex-1 truncate text-xs', entry.level === 'error' ? 'text-error' : 'text-text-primary')}>
              {entry.title}
            </Box>
            <Box as="span" className="shrink-0 text-3xs"><KindTag entry={entry} /></Box>
            {entry.source && (
              <Box as="span" className="max-w-[30%] shrink-0 truncate text-3xs text-text-muted">{entry.source}</Box>
            )}
            {durationText && (
              <Box as="span" className="shrink-0 font-mono text-3xs tabular-nums text-text-muted">{durationText}</Box>
            )}
          </Flex>
        ) : (
          // Narrow panel: message wraps on its own line, meta beneath it.
          <>
            <Flex gap="sm" className="min-w-0">
              <Timestamp ts={entry.ts} />
              <Box as="span" className={cn('min-w-0 flex-1 break-words text-xs', entry.level === 'error' ? 'text-error' : 'text-text-primary')}>
                {entry.title}
              </Box>
            </Flex>
            <Flex align="center" gap="xs" className="mt-0.5 min-w-0 text-3xs text-text-muted">
              <KindTag entry={entry} />
              {entry.source && <Box as="span" className="min-w-0 truncate">· {entry.source}</Box>}
              <Box as="span" className="flex-1" />
              {durationText && <Box as="span" className="shrink-0 font-mono tabular-nums">{durationText}</Box>}
            </Flex>
            {showBar && <DurationBar durationMs={entry.durationMs!} scale={scale} />}
          </>
        )}
      </Box>
    </Box>
  )
}
