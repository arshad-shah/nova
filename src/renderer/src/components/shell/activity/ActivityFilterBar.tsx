import React from 'react'
import {
  Trash2, Search, Download, Pause, Play, Gauge, AlertCircle, TriangleAlert,
} from 'lucide-react'
import { Flex, Box, cn, Button, ToggleGroup, StatusDot, type StatusDotTone } from '@/primitives'
import type { ActivityKind, ActivityLevel } from '@shared/activity'
import { useTranslation } from '@/i18n/I18nProvider'
import type { MessageKey } from '@shared/i18n'
import { KIND_META } from '@/lib/activity/meta'

const LEVEL_DOT_TONE: Record<ActivityLevel, StatusDotTone> = {
  error: 'error',
  warn: 'warning',
  success: 'success',
  info: 'muted',
  debug: 'muted',
}

const LEVEL_META: { level: ActivityLevel; label: MessageKey }[] = [
  { level: 'error', label: 'shell.activity.levelError' },
  { level: 'warn', label: 'shell.activity.levelWarn' },
  { level: 'success', label: 'shell.activity.levelSuccess' },
  { level: 'info', label: 'shell.activity.levelInfo' },
  { level: 'debug', label: 'shell.activity.levelDebug' },
]

const ALL_KINDS = Object.keys(KIND_META) as ActivityKind[]

export interface ActivityFilterBarProps {
  kinds: Set<ActivityKind>
  levels: Set<ActivityLevel>
  search: string
  paused: boolean
  verbose: boolean
  errorCount: number
  warnCount: number
  canExport: boolean
  onKindsChange: (next: Set<ActivityKind>) => void
  onLevelsChange: (next: Set<ActivityLevel>) => void
  onSearchChange: (value: string) => void
  onToggleLevel: (level: ActivityLevel) => void
  onTogglePause: () => void
  onToggleVerbose: () => void
  onExport: () => void
  onClear: () => void
}

/** The panel's controls: search, severity summary, verbose/pause/export/clear,
 *  and the kind + level chip grids. Presentational — all state lives upstream. */
export function ActivityFilterBar(props: ActivityFilterBarProps) {
  const { t } = useTranslation()
  const {
    kinds, levels, search, paused, verbose, errorCount, warnCount, canExport,
    onKindsChange, onLevelsChange, onSearchChange, onToggleLevel,
    onTogglePause, onToggleVerbose, onExport, onClear,
  } = props

  return (
    <Box className="shrink-0 border-b border-border">
      <Flex align="center" gap="xs" className="px-2 pb-1 pt-1.5">
        <Flex align="center" gap="xs" className="min-w-0 flex-1 rounded bg-bg-inset px-1.5 py-0.5">
          <Search size={12} className="shrink-0 text-text-muted" />
          <Box
            as="input"
            type="text"
            value={search}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => onSearchChange(e.target.value)}
            placeholder={t('shell.activity.search')}
            className="min-w-0 flex-1 bg-transparent text-2xs text-text-primary outline-none placeholder:text-text-muted"
          />
        </Flex>
        {errorCount > 0 && (
          <Button
            variant="bare"
            size="none"
            type="button"
            onClick={() => onToggleLevel('error')}
            className={cn('flex items-center gap-0.5 rounded px-1 py-0.5 text-3xs', levels.has('error') ? 'bg-error/15 text-error' : 'text-error hover:bg-hover')}
          >
            <AlertCircle size={11} />{errorCount}
          </Button>
        )}
        {warnCount > 0 && (
          <Button
            variant="bare"
            size="none"
            type="button"
            onClick={() => onToggleLevel('warn')}
            className={cn('flex items-center gap-0.5 rounded px-1 py-0.5 text-3xs', levels.has('warn') ? 'bg-warning/15 text-warning' : 'text-warning hover:bg-hover')}
          >
            <TriangleAlert size={11} />{warnCount}
          </Button>
        )}
        <Button
          variant="bare"
          size="none"
          type="button"
          onClick={onToggleVerbose}
          title={t('shell.activity.verbose')}
          className={cn('flex items-center rounded p-1 hover:bg-hover', verbose ? 'text-accent' : 'text-text-muted hover:text-text-primary')}
        >
          <Gauge size={13} />
        </Button>
        <Button
          variant="bare"
          size="none"
          type="button"
          onClick={onTogglePause}
          title={t(paused ? 'shell.activity.resume' : 'shell.activity.pause')}
          className={cn('flex items-center rounded p-1 hover:bg-hover', paused ? 'text-warning' : 'text-text-muted hover:text-text-primary')}
        >
          {paused ? <Play size={13} /> : <Pause size={13} />}
        </Button>
        <Button
          variant="bare"
          size="none"
          type="button"
          onClick={onExport}
          disabled={!canExport}
          title={t('shell.activity.export')}
          className="flex items-center rounded p-1 text-text-muted hover:bg-hover hover:text-text-primary disabled:opacity-40 disabled:hover:bg-transparent"
        >
          <Download size={13} />
        </Button>
        <Button
          variant="bare"
          size="none"
          type="button"
          onClick={onClear}
          title={t('shell.activity.clear')}
          className="flex items-center rounded p-1 text-text-muted hover:bg-hover hover:text-error"
        >
          <Trash2 size={13} />
        </Button>
      </Flex>
      <ToggleGroup
        wrap
        size="xs"
        className="px-2 pb-1"
        label={t('shell.activity.fieldKind')}
        value={[...kinds]}
        onChange={(next) => onKindsChange(new Set(next as ActivityKind[]))}
        options={ALL_KINDS.map((kind) => {
          const { icon: Icon, label } = KIND_META[kind]
          return { value: kind, label: t(label), icon: <Icon size={12} /> }
        })}
      />
      <Flex align="center" gap="xs" className="flex-wrap px-2 pb-1.5">
        <ToggleGroup
          wrap
          size="xs"
          label={t('shell.activity.levelInfo')}
          value={[...levels]}
          onChange={(next) => onLevelsChange(new Set(next as ActivityLevel[]))}
          options={LEVEL_META.map(({ level, label }) => ({
            value: level,
            label: t(label),
            icon: (
              <StatusDot
                size="xs"
                tone={LEVEL_DOT_TONE[level]}
                className={level === 'debug' ? 'opacity-60' : undefined}
              />
            ),
          }))}
        />
        {paused && (
          <>
            <Box as="span" className="flex-1" />
            <Box as="span" className="text-3xs text-warning">{t('shell.activity.paused')}</Box>
          </>
        )}
      </Flex>
    </Box>
  )
}
