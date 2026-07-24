import React, { useRef } from 'react'
import {
  Trash2, Download, Pause, Play, Gauge, AlertCircle, TriangleAlert, Filter, X, ListFilter,
} from 'lucide-react'
import { Flex, Box, cn, Button, ToggleGroup, StatusDot, Popover, Text, type StatusDotTone } from '@/primitives'
import type { ActivityKind, ActivityLevel } from '@shared/activity'
import { useTranslation } from '@/i18n/I18nProvider'
import type { MessageKey } from '@shared/i18n'
import { KIND_META } from '@/lib/activity/meta'
import {
  type FilterToken, type SeveritySummary,
  parseFilter, serializeToken, dedupeTokens, tokenKey,
} from '@/lib/activity/filter'

const LEVEL_DOT_TONE: Record<ActivityLevel, StatusDotTone> = {
  error: 'error', warn: 'warning', success: 'success', info: 'muted', debug: 'muted',
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
  tokens: FilterToken[]
  draft: string
  paused: boolean
  verbose: boolean
  errorSummary: SeveritySummary
  warnSummary: SeveritySummary
  canExport: boolean
  onTokensChange: (next: FilterToken[]) => void
  onDraftChange: (value: string) => void
  onTogglePause: () => void
  onToggleVerbose: () => void
  onExport: () => void
  onClear: () => void
}

/** Whether an odd number of quotes means we're mid-quoted-value (so a space
 *  belongs to the value, not a token boundary). */
function insideOpenQuote(s: string): boolean {
  return ((s.match(/"/g)?.length ?? 0) % 2) === 1
}

/**
 * One compact filter bar replacing the old search row + two chip grids: an
 * expression field whose applied filters show as removable tokens (so filter
 * state stays visible after scrolling), a popover for the kind/level chips, the
 * severity pills, and the verbose/pause/export/clear actions.
 */
export function ActivityFilterBar(props: ActivityFilterBarProps) {
  const { t } = useTranslation()
  const {
    tokens, draft, paused, verbose, errorSummary, warnSummary, canExport,
    onTokensChange, onDraftChange, onTogglePause, onToggleVerbose, onExport, onClear,
  } = props
  const inputRef = useRef<HTMLInputElement>(null)

  const activeKinds = tokens.filter((tk): tk is Extract<FilterToken, { type: 'kind' }> => tk.type === 'kind').map((tk) => tk.value)
  const activeLevels = tokens.filter((tk): tk is Extract<FilterToken, { type: 'level' }> => tk.type === 'level').map((tk) => tk.value)

  const commitDraft = () => {
    onTokensChange(dedupeTokens([...tokens, ...parseFilter(draft)]))
    onDraftChange('')
  }
  const removeAt = (index: number) => onTokensChange(tokens.filter((_, i) => i !== index))
  const setKindTokens = (next: ActivityKind[]) =>
    onTokensChange(dedupeTokens([...tokens.filter((tk) => tk.type !== 'kind'), ...next.map((v) => ({ type: 'kind', value: v }) as FilterToken)]))
  const setLevelTokens = (next: ActivityLevel[]) =>
    onTokensChange(dedupeTokens([...tokens.filter((tk) => tk.type !== 'level'), ...next.map((v) => ({ type: 'level', value: v }) as FilterToken)]))
  const toggleLevel = (level: ActivityLevel) =>
    activeLevels.includes(level) ? setLevelTokens(activeLevels.filter((l) => l !== level)) : setLevelTokens([...activeLevels, level])

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if ((e.key === 'Enter' || (e.key === ' ' && !insideOpenQuote(draft))) && draft.trim()) {
      e.preventDefault()
      commitDraft()
    } else if (e.key === 'Backspace' && draft === '' && tokens.length > 0) {
      e.preventDefault()
      const last = tokens[tokens.length - 1]
      onTokensChange(tokens.slice(0, -1))
      onDraftChange(serializeToken(last))
    }
  }

  const filterPopover = (
    <Popover
      placement="bottom"
      trigger={
        <Button
          variant="bare"
          size="none"
          type="button"
          title={t('shell.activity.filterOptions')}
          className={cn('flex shrink-0 items-center rounded p-1 hover:bg-hover', tokens.some((tk) => tk.type === 'kind' || tk.type === 'level') ? 'text-accent' : 'text-text-muted hover:text-text-primary')}
        >
          <ListFilter size={13} />
        </Button>
      }
      content={
        <Box className="flex w-56 flex-col gap-2 p-2">
          <Text size="2xs" color="muted" className="uppercase tracking-wider">{t('shell.activity.fieldKind')}</Text>
          <ToggleGroup
            wrap
            size="xs"
            label={t('shell.activity.fieldKind')}
            value={activeKinds}
            onChange={(next) => setKindTokens(next as ActivityKind[])}
            options={ALL_KINDS.map((kind) => {
              const { icon: Icon, label } = KIND_META[kind]
              return { value: kind, label: t(label), icon: <Icon size={12} /> }
            })}
          />
          <Text size="2xs" color="muted" className="mt-1 uppercase tracking-wider">{t('shell.activity.levelInfo')}</Text>
          <ToggleGroup
            wrap
            size="xs"
            label={t('shell.activity.levelInfo')}
            value={activeLevels}
            onChange={(next) => setLevelTokens(next as ActivityLevel[])}
            options={LEVEL_META.map(({ level, label }) => ({
              value: level,
              label: t(label),
              icon: <StatusDot size="xs" tone={LEVEL_DOT_TONE[level]} className={level === 'debug' ? 'opacity-60' : undefined} />,
            }))}
          />
        </Box>
      }
    />
  )

  return (
    <Box className="shrink-0 border-b border-border">
      {/* Actions row: severity pills · spacer · verbose / pause / export / clear. */}
      <Flex align="center" gap="xs" className="px-2 pb-1 pt-1.5">
        {errorSummary.total > 0 && (
          <Button
            variant="bare"
            size="none"
            type="button"
            onClick={() => toggleLevel('error')}
            title={t('shell.activity.occurrences', { count: errorSummary.total })}
            className={cn('flex items-center gap-0.5 rounded px-1 py-0.5 text-3xs', activeLevels.includes('error') ? 'bg-error/15 text-error' : 'text-error hover:bg-hover')}
          >
            <AlertCircle size={11} />{errorSummary.distinct}
            {errorSummary.total > errorSummary.distinct && <Box as="span" className="opacity-60">·{errorSummary.total}</Box>}
          </Button>
        )}
        {warnSummary.total > 0 && (
          <Button
            variant="bare"
            size="none"
            type="button"
            onClick={() => toggleLevel('warn')}
            title={t('shell.activity.occurrences', { count: warnSummary.total })}
            className={cn('flex items-center gap-0.5 rounded px-1 py-0.5 text-3xs', activeLevels.includes('warn') ? 'bg-warning/15 text-warning' : 'text-warning hover:bg-hover')}
          >
            <TriangleAlert size={11} />{warnSummary.distinct}
            {warnSummary.total > warnSummary.distinct && <Box as="span" className="opacity-60">·{warnSummary.total}</Box>}
          </Button>
        )}
        <Box as="span" className="flex-1" />
        {paused && <Box as="span" className="mr-1 text-3xs text-warning">{t('shell.activity.paused')}</Box>}
        <Button
          variant="bare" size="none" type="button" onClick={onToggleVerbose} title={t('shell.activity.verbose')}
          className={cn('flex items-center rounded p-1 hover:bg-hover', verbose ? 'text-accent' : 'text-text-muted hover:text-text-primary')}
        >
          <Gauge size={13} />
        </Button>
        <Button
          variant="bare" size="none" type="button" onClick={onTogglePause} title={t(paused ? 'shell.activity.resume' : 'shell.activity.pause')}
          className={cn('flex items-center rounded p-1 hover:bg-hover', paused ? 'text-warning' : 'text-text-muted hover:text-text-primary')}
        >
          {paused ? <Play size={13} /> : <Pause size={13} />}
        </Button>
        <Button
          variant="bare" size="none" type="button" onClick={onExport} disabled={!canExport} title={t('shell.activity.export')}
          className="flex items-center rounded p-1 text-text-muted hover:bg-hover hover:text-text-primary disabled:opacity-40 disabled:hover:bg-transparent"
        >
          <Download size={13} />
        </Button>
        <Button
          variant="bare" size="none" type="button" onClick={onClear} title={t('shell.activity.clear')}
          className="flex items-center rounded p-1 text-text-muted hover:bg-hover hover:text-error"
        >
          <Trash2 size={13} />
        </Button>
      </Flex>

      {/* Filter field: removable tokens + expression input + kind/level popover. */}
      <Flex align="center" gap="xs" className="px-2 pb-1.5">
        <Flex
          align="center"
          gap="xs"
          wrap
          className="min-w-0 flex-1 cursor-text rounded bg-bg-inset px-1.5 py-0.5"
          onClick={() => inputRef.current?.focus()}
        >
          <Filter size={12} className="shrink-0 text-text-muted" />
          {tokens.map((token, i) => (
            <Box
              key={`${tokenKey(token)}-${i}`}
              as="span"
              className="inline-flex shrink-0 items-center gap-1 rounded bg-bg-elevated px-1 py-px font-mono text-3xs text-text-secondary"
            >
              <Box as="span">{serializeToken(token)}</Box>
              <Button
                variant="bare"
                size="none"
                type="button"
                onClick={(e: React.MouseEvent) => { e.stopPropagation(); removeAt(i) }}
                aria-label={t('shell.activity.removeFilter')}
                className="flex items-center text-text-muted hover:text-error"
              >
                <X size={10} />
              </Button>
            </Box>
          ))}
          <Box
            as="input"
            ref={inputRef}
            type="text"
            value={draft}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => onDraftChange(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={tokens.length === 0 ? t('shell.activity.filterPlaceholder') : ''}
            aria-label={t('shell.activity.filterPlaceholder')}
            className="min-w-0 flex-1 basis-16 bg-transparent font-mono text-2xs text-text-primary outline-none placeholder:text-text-muted"
          />
        </Flex>
        {filterPopover}
      </Flex>
    </Box>
  )
}
