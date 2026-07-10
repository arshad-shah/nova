import { useMemo, useRef, useState } from 'react'
import {
  Database, Wrench, Plug, Bell, Globe, ScrollText, Trash2, Search, Download, Pause, Play,
  Cable, Puzzle, Layers, Gauge, ChevronRight, ChevronDown, AlertCircle, TriangleAlert,
} from 'lucide-react'
import { Flex, Box, Text, cn } from '@/primitives'
import type { ActivityEntry, ActivityKind, ActivityLevel } from '@shared/activity'
import { useTranslation } from '@/i18n/I18nProvider'
import type { MessageKey } from '@shared/i18n'
import { formatClockTime, formatClockTimeWithMillis } from '@/lib/format-time'
import { setDiagnosticsVerbose, isDiagnosticsVerbose } from '@/lib/diagnostics'

const KIND_META: Record<ActivityKind, { icon: typeof Database; label: MessageKey }> = {
  query: { icon: Database, label: 'shell.activity.queries' },
  'tool-call': { icon: Wrench, label: 'shell.activity.tools' },
  connection: { icon: Plug, label: 'shell.activity.connections' },
  notification: { icon: Bell, label: 'shell.activity.notifications' },
  network: { icon: Globe, label: 'shell.activity.network' },
  ipc: { icon: Cable, label: 'shell.activity.ipc' },
  plugin: { icon: Puzzle, label: 'shell.activity.plugins' },
  store: { icon: Layers, label: 'shell.activity.store' },
  perf: { icon: Gauge, label: 'shell.activity.perf' },
  log: { icon: ScrollText, label: 'shell.activity.logs' },
}

const LEVEL_CLASS: Record<ActivityLevel, string> = {
  error: 'text-error',
  warn: 'text-warning',
  success: 'text-success',
  info: 'text-text-muted',
  debug: 'text-text-muted/60',
}

const LEVEL_META: { level: ActivityLevel; label: MessageKey }[] = [
  { level: 'error', label: 'shell.activity.levelError' },
  { level: 'warn', label: 'shell.activity.levelWarn' },
  { level: 'success', label: 'shell.activity.levelSuccess' },
  { level: 'info', label: 'shell.activity.levelInfo' },
  { level: 'debug', label: 'shell.activity.levelDebug' },
]

const ALL_KINDS = Object.keys(KIND_META) as ActivityKind[]

/** Cap rendered rows so a long stream stays smooth; the store keeps more and
 *  export still sees every matching entry. */
const MAX_RENDERED = 400


/** A labelled field row in the detail drawer. */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2">
      <span className="w-20 shrink-0 text-[10px] uppercase tracking-wider text-text-muted">{label}</span>
      <span className="flex-1 min-w-0 break-words font-mono text-[10px] text-text-secondary">{children}</span>
    </div>
  )
}

function Pre({ text, tone }: { text: string; tone?: 'error' }) {
  return (
    <pre className={cn(
      'mt-1 whitespace-pre-wrap break-words font-mono text-[10px] rounded p-2 max-h-56 overflow-auto bg-bg-inset',
      tone === 'error' ? 'text-error/90' : 'text-text-secondary',
    )}>
      {text}
    </pre>
  )
}

function ActivityRow({ entry }: { entry: ActivityEntry }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const { icon: Icon } = KIND_META[entry.kind]
  const meta = entry.metadata
  const metaJson = meta ? JSON.stringify(meta, null, 2) : null
  // A row is expandable when there's anything structured to inspect.
  const expandable = Boolean(entry.detail || entry.stack || metaJson || entry.source || entry.traceId)

  return (
    <Box
      className={cn(
        'px-3 py-1.5 border-b border-border/50 text-xs',
        expandable && 'cursor-pointer hover:bg-white/[0.03]',
      )}
      onClick={expandable ? () => setOpen((o) => !o) : undefined}
    >
      <Flex align="center" gap="sm" className="min-w-0">
        {expandable
          ? (open ? <ChevronDown size={11} className="shrink-0 text-text-muted" /> : <ChevronRight size={11} className="shrink-0 text-text-muted" />)
          : <span className="w-[11px] shrink-0" />}
        <Icon size={13} className={cn('shrink-0', LEVEL_CLASS[entry.level])} />
        <span className="font-mono text-[10px] text-text-muted shrink-0 tabular-nums">
          {formatClockTime(entry.ts)}
        </span>
        <span className={cn('truncate flex-1 min-w-0', entry.level === 'error' && 'text-error')}>
          {entry.title}
        </span>
        {entry.durationMs !== undefined && (
          <span className="font-mono text-[10px] text-text-muted shrink-0 tabular-nums">{Math.round(entry.durationMs)}ms</span>
        )}
        {entry.source && (
          <span className="text-[10px] text-text-muted shrink-0 max-w-[30%] truncate">
            {entry.source}
          </span>
        )}
      </Flex>

      {open && expandable && (
        <div className="mt-2 ml-[24px] flex flex-col gap-1.5 pb-1">
          <Field label={t('shell.activity.fieldTime')}>{formatClockTimeWithMillis(entry.ts)}</Field>
          <Field label={t('shell.activity.fieldKind')}>{t(KIND_META[entry.kind].label)} · {entry.level}</Field>
          {entry.source && <Field label={t('shell.activity.fieldSource')}>{entry.source}</Field>}
          {entry.durationMs !== undefined && <Field label={t('shell.activity.fieldDuration')}>{Math.round(entry.durationMs)}ms</Field>}
          {entry.traceId && <Field label={t('shell.activity.fieldTrace')}>{entry.traceId}</Field>}
          {entry.detail && <Pre text={entry.detail} />}
          {metaJson && <Pre text={metaJson} />}
          {entry.stack && <Pre text={entry.stack} tone="error" />}
        </div>
      )}
    </Box>
  )
}

function toggle<T>(set: Set<T>, value: T): Set<T> {
  const next = new Set(set)
  if (next.has(value)) next.delete(value)
  else next.add(value)
  return next
}

function downloadEntries(entries: ActivityEntry[]): void {
  const blob = new Blob([JSON.stringify(entries, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `verql-activity-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
  a.click()
  URL.revokeObjectURL(url)
}

export interface ActivityListProps {
  entries: ActivityEntry[]
  onClear: () => void
}

/** Presentational, store-free — used by the panel and Storybook. Owns its own
 *  filter/search/pause state so the live container stays a thin wiring layer. */
export function ActivityList({ entries, onClear }: ActivityListProps) {
  const { t } = useTranslation()
  const [kinds, setKinds] = useState<Set<ActivityKind>>(new Set())
  const [levels, setLevels] = useState<Set<ActivityLevel>>(new Set())
  const [search, setSearch] = useState('')
  const [paused, setPaused] = useState(false)
  const [verbose, setVerbose] = useState(isDiagnosticsVerbose())
  // While paused we render a frozen snapshot so a fast stream can't yank rows
  // out from under the reader; live entries keep accumulating in the store.
  const frozen = useRef<ActivityEntry[]>([])
  const togglePause = () => {
    setPaused((p) => {
      frozen.current = p ? [] : entries
      return !p
    })
  }
  const toggleVerbose = () => {
    setVerbose((v) => {
      const next = !v
      // Enables/disables the renderer store + perf capture at the source, so
      // there's zero overhead when off.
      setDiagnosticsVerbose(next)
      return next
    })
  }
  const source = paused ? frozen.current : entries

  // Session severity counts for the summary header (from the live store).
  const errorCount = useMemo(() => entries.filter((e) => e.level === 'error').length, [entries])
  const warnCount = useMemo(() => entries.filter((e) => e.level === 'warn').length, [entries])

  // Full match set (used for export); the rendered slice is capped below.
  const matched = useMemo(() => {
    const q = search.trim().toLowerCase()
    return source.filter((e) => {
      if (kinds.size > 0 && !kinds.has(e.kind)) return false
      if (levels.size > 0 && !levels.has(e.level)) return false
      if (q) {
        const hay = `${e.title} ${e.detail ?? ''} ${e.source ?? ''} ${e.metadata ? JSON.stringify(e.metadata) : ''}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [source, kinds, levels, search])

  const rendered = useMemo(() => matched.slice(0, MAX_RENDERED), [matched])

  return (
    <Flex direction="column" className="h-full min-h-0">
      <Box className="border-b border-border shrink-0">
        <Flex align="center" gap="xs" className="px-2 pt-1.5 pb-1">
          <Flex
            align="center"
            gap="xs"
            className="flex-1 min-w-0 rounded bg-bg-inset px-1.5 py-0.5"
          >
            <Search size={12} className="text-text-muted shrink-0" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('shell.activity.search')}
              className="flex-1 min-w-0 bg-transparent text-[11px] text-text-primary placeholder:text-text-muted outline-none"
            />
          </Flex>
          {/* Session severity summary — click to filter that level. */}
          {errorCount > 0 && (
            <button
              type="button"
              onClick={() => setLevels((p) => toggle(p, 'error'))}
              className={cn('flex items-center gap-0.5 rounded px-1 py-0.5 text-[10px]', levels.has('error') ? 'bg-error/15 text-error' : 'text-error hover:bg-hover')}
            >
              <AlertCircle size={11} />{errorCount}
            </button>
          )}
          {warnCount > 0 && (
            <button
              type="button"
              onClick={() => setLevels((p) => toggle(p, 'warn'))}
              className={cn('flex items-center gap-0.5 rounded px-1 py-0.5 text-[10px]', levels.has('warn') ? 'bg-warning/15 text-warning' : 'text-warning hover:bg-hover')}
            >
              <TriangleAlert size={11} />{warnCount}
            </button>
          )}
          <button
            type="button"
            onClick={toggleVerbose}
            title={t('shell.activity.verbose')}
            className={cn(
              'flex items-center rounded p-1 hover:bg-hover',
              verbose ? 'text-accent' : 'text-text-muted hover:text-text-primary',
            )}
          >
            <Gauge size={13} />
          </button>
          <button
            type="button"
            onClick={togglePause}
            title={t(paused ? 'shell.activity.resume' : 'shell.activity.pause')}
            className={cn(
              'flex items-center rounded p-1 hover:bg-hover',
              paused ? 'text-warning' : 'text-text-muted hover:text-text-primary',
            )}
          >
            {paused ? <Play size={13} /> : <Pause size={13} />}
          </button>
          <button
            type="button"
            onClick={() => downloadEntries(matched)}
            disabled={matched.length === 0}
            title={t('shell.activity.export')}
            className="flex items-center rounded p-1 text-text-muted hover:text-text-primary hover:bg-hover disabled:opacity-40 disabled:hover:bg-transparent"
          >
            <Download size={13} />
          </button>
          <button
            type="button"
            onClick={onClear}
            title={t('shell.activity.clear')}
            className="flex items-center rounded p-1 text-text-muted hover:text-error hover:bg-hover"
          >
            <Trash2 size={13} />
          </button>
        </Flex>
        <Flex align="center" gap="xs" className="px-2 pb-1 flex-wrap">
          {ALL_KINDS.map((kind) => {
            const on = kinds.has(kind)
            const { icon: Icon, label } = KIND_META[kind]
            return (
              <button
                key={kind}
                type="button"
                onClick={() => setKinds((prev) => toggle(prev, kind))}
                title={t(label)}
                className={cn(
                  'flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] transition-colors',
                  on ? 'bg-accent/15 text-accent' : 'text-text-muted hover:text-text-primary hover:bg-hover',
                )}
              >
                <Icon size={12} />
                {t(label)}
              </button>
            )
          })}
        </Flex>
        <Flex align="center" gap="xs" className="px-2 pb-1.5 flex-wrap">
          {LEVEL_META.map(({ level, label }) => {
            const on = levels.has(level)
            return (
              <button
                key={level}
                type="button"
                onClick={() => setLevels((prev) => toggle(prev, level))}
                title={t(label)}
                className={cn(
                  'flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] transition-colors',
                  on ? 'bg-accent/15 text-accent' : 'text-text-muted hover:text-text-primary hover:bg-hover',
                )}
              >
                <span className={cn('h-1.5 w-1.5 rounded-full bg-current', LEVEL_CLASS[level])} />
                {t(label)}
              </button>
            )
          })}
          {paused && (
            <>
              <span className="flex-1" />
              <span className="text-[10px] text-warning">{t('shell.activity.paused')}</span>
            </>
          )}
        </Flex>
      </Box>

      <Box className="flex-1 min-h-0 overflow-auto">
        {rendered.length === 0 ? (
          <Flex align="center" justify="center" className="h-full p-6">
            <Text size="sm" color="muted">
              {entries.length === 0 ? t('shell.activity.empty') : t('shell.activity.noMatch')}
            </Text>
          </Flex>
        ) : (
          rendered.map((e) => <ActivityRow key={e.id} entry={e} />)
        )}
      </Box>
    </Flex>
  )
}
