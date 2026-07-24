import React, { useState } from 'react'
import { ChevronRight, ChevronDown } from 'lucide-react'
import { Flex, Box, Button, cn } from '@/primitives'
import type { ActivityEntry } from '@shared/activity'
import { useTranslation } from '@/i18n/I18nProvider'
import { clamp } from '@/lib/math'
import { formatClockTime } from '@/lib/format-time'
import { KIND_META, KIND_TONE_CLASS, LEVEL_RAIL_CLASS } from '@/lib/activity/meta'
import type { DurationScale } from '@/lib/activity/scale'
import type { TraceGroup } from '@/lib/activity/group'
import { ActivityRow } from './ActivityRow'

/** Fixed timestamp-gutter width — matches ActivityRow (sanctioned inline
 *  exception, not a design width step). */
const GUTTER_WIDTH = 44

/**
 * A child's span within the parent's window — offset + duration, so you can see
 * where the time went. Same hairline as the row duration bar, but positioned
 * (the duration bar is left-anchored; a span needs an offset).
 */
function SpanBar({ entry, start, window }: { entry: ActivityEntry; start: number; window: number }) {
  const offset = window > 0 ? clamp((entry.ts - start) / window, 0, 1) : 0
  const raw = window > 0 && entry.durationMs ? entry.durationMs / window : 0
  const width = clamp(raw, 0, 1 - offset)
  return (
    <Box aria-hidden className="relative mt-1 h-0.5 w-full overflow-hidden rounded-full bg-bg-inset">
      <Box
        className="absolute h-full rounded-full bg-text-muted/60"
        // Positioned fill — sanctioned inline width/offset exception.
        style={{ left: `${offset * 100}%`, width: `${Math.max(width * 100, 2)}%` }}
      />
    </Box>
  )
}

export interface ActivityGroupProps {
  group: TraceGroup
  dense: boolean
  scale: DurationScale
  selectedId: string | null
  onSelect: (id: string) => void
}

/**
 * A trace rendered as its parent row plus a collapsible set of children. The
 * rail takes the group's rolled-up severity, so a child error is visible without
 * expanding — the whole point of grouping. Children are collapsed by default and
 * auto-expand when one is selected (e.g. via keyboard).
 */
export function ActivityGroup({ group, dense, scale, selectedId, onSelect }: ActivityGroupProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const containsSelectedChild = group.children.some((c) => c.id === selectedId)
  const expanded = open || containsSelectedChild
  const parent = group.parent
  const { label, tone } = KIND_META[parent.kind]
  const { icon: Icon } = KIND_META[parent.kind]
  const parentSelected = selectedId === parent.id
  const window = group.end - group.start
  const accessibleName = `${group.level} ${t(label)}: ${parent.title}`

  return (
    <Box>
      {/* Parent header — rolled-up rail, expand toggle, count. */}
      <Box
        className={cn(
          'relative cursor-pointer border-b border-border/50',
          parentSelected ? 'bg-accent/10' : 'hover:bg-hover',
          group.level === 'error' && !parentSelected && 'bg-error/5',
        )}
        role="option"
        aria-selected={parentSelected}
        aria-label={accessibleName}
        tabIndex={parentSelected ? 0 : -1}
        data-activity-row={parent.id}
        onClick={() => onSelect(parent.id)}
        onKeyDown={(e: React.KeyboardEvent) => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(parent.id) }
        }}
      >
        <Box aria-hidden className={cn('absolute left-0 top-0 bottom-0 w-0.5', LEVEL_RAIL_CLASS[group.level])} />
        <Flex align="center" gap="xs" className="min-w-0 py-1.5 pl-1.5 pr-3">
          <Button
            variant="bare"
            size="none"
            type="button"
            onClick={(e: React.MouseEvent) => { e.stopPropagation(); setOpen((o) => !o) }}
            aria-label={t('shell.activity.groupByTrace')}
            aria-expanded={expanded}
            className="flex shrink-0 items-center rounded p-0.5 text-text-muted hover:bg-hover hover:text-text-primary"
          >
            {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          </Button>
          <Box as="span" className="shrink-0 font-mono text-3xs tabular-nums text-text-tertiary" style={{ width: GUTTER_WIDTH }}>
            {formatClockTime(parent.ts)}
          </Box>
          <Box as="span" className={cn('min-w-0 flex-1 truncate text-xs', group.level === 'error' ? 'text-error' : 'text-text-primary')}>
            {parent.title}
          </Box>
          {!dense && (
            <Box as="span" className={cn('inline-flex shrink-0 items-center gap-1 text-3xs', KIND_TONE_CLASS[tone])}>
              <Icon size={11} />
            </Box>
          )}
          <Box as="span" className="shrink-0 rounded-full bg-bg-elevated px-1.5 py-px text-3xs text-text-muted">
            {t('shell.activity.groupSteps', { count: group.children.length })}
            {group.hiddenChildren > 0 && <> · {t('shell.activity.groupHidden', { count: group.hiddenChildren })}</>}
          </Box>
        </Flex>
      </Box>

      {expanded &&
        group.children.map((child) => (
          <ActivityRow
            key={child.id}
            entry={child}
            dense={dense}
            scale={scale}
            selected={selectedId === child.id}
            onSelect={() => onSelect(child.id)}
            indent
            spanBar={<SpanBar entry={child} start={group.start} window={window} />}
          />
        ))}
    </Box>
  )
}
