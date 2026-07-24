import { useMemo, useRef, useState } from 'react'
import { Flex, Text } from '@/primitives'
import type { ActivityEntry, ActivityKind, ActivityLevel } from '@shared/activity'
import { useTranslation } from '@/i18n/I18nProvider'
import { setDiagnosticsVerbose, isDiagnosticsVerbose } from '@/lib/diagnostics'
import { ActivityFilterBar } from './ActivityFilterBar'
import { ActivityStream } from './ActivityStream'

/** Cap rendered rows so a long stream stays smooth; the store keeps more and
 *  export still sees every matching entry. */
const MAX_RENDERED = 400

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
      <ActivityFilterBar
        kinds={kinds}
        levels={levels}
        search={search}
        paused={paused}
        verbose={verbose}
        errorCount={errorCount}
        warnCount={warnCount}
        canExport={matched.length > 0}
        onKindsChange={setKinds}
        onLevelsChange={setLevels}
        onSearchChange={setSearch}
        onToggleLevel={(level) => setLevels((p) => toggle(p, level))}
        onTogglePause={togglePause}
        onToggleVerbose={toggleVerbose}
        onExport={() => downloadEntries(matched)}
        onClear={onClear}
      />
      <ActivityStream
        entries={rendered}
        empty={
          <Flex align="center" justify="center" className="h-full p-6">
            <Text size="sm" color="muted">
              {entries.length === 0 ? t('shell.activity.empty') : t('shell.activity.noMatch')}
            </Text>
          </Flex>
        }
      />
    </Flex>
  )
}
