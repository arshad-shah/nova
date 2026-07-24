import { useMemo, useRef, useState } from 'react'
import { Flex, Box, Text, ResizeHandle } from '@/primitives'
import type { ActivityEntry } from '@shared/activity'
import { useTranslation } from '@/i18n/I18nProvider'
import { setDiagnosticsVerbose, isDiagnosticsVerbose } from '@/lib/diagnostics'
import { useSettingsStore } from '@/stores/settings'
import { useUiStore } from '@/stores/ui'
import { usePanelResize } from '@/hooks/usePanelResize'
import { type FilterToken, parseFilter, applyFilter, summarizeLevel } from '@/lib/activity/filter'
import { ActivityFilterBar } from './ActivityFilterBar'
import { ActivityStream } from './ActivityStream'
import { ActivityDetail } from './ActivityDetail'

/** Cap rendered rows so a long stream stays smooth; the store keeps more and
 *  export still sees every matching entry. */
const MAX_RENDERED = 400

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

/** Presentational, store-free (data-wise) — used by the panel and Storybook.
 *  Owns its own filter/pause/selection state so the live container stays a thin
 *  wiring layer. */
export function ActivityList({ entries, onClear }: ActivityListProps) {
  const { t } = useTranslation()
  // Committed filter tokens (shown as removable chips) + the in-progress draft.
  const [tokens, setTokens] = useState<FilterToken[]>([])
  const [draft, setDraft] = useState('')
  const [paused, setPaused] = useState(false)
  const [verbose, setVerbose] = useState(isDiagnosticsVerbose())
  const [selectedId, setSelectedId] = useState<string | null>(null)

  // The drawer height persists alongside the other layout dimensions; the
  // splitter reuses the shared panel-resize behaviour (a mouse-down grows the
  // stream / shrinks the drawer, hence direction -1).
  const detailHeight = useSettingsStore((s) => s.settings.appearance.activityDetailHeight)
  const setDetailHeight = useUiStore((s) => s.setActivityDetailHeight)
  const resize = usePanelResize({
    value: detailHeight, min: 120, max: 640, restoreDefault: 220, direction: -1,
    read: () => useSettingsStore.getState().settings.appearance.activityDetailHeight,
    commit: setDetailHeight,
  })

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

  // Deduplicated severity summaries for the pills (from the live store).
  const errorSummary = useMemo(() => summarizeLevel(entries, 'error'), [entries])
  const warnSummary = useMemo(() => summarizeLevel(entries, 'warn'), [entries])

  // Live filter = committed tokens + whatever's being typed, so partial input
  // narrows the stream without waiting for a commit.
  const activeTokens = useMemo(() => [...tokens, ...parseFilter(draft)], [tokens, draft])

  // Full match set (used for export); the rendered slice is capped below.
  const matched = useMemo(() => applyFilter(source, activeTokens), [source, activeTokens])
  const rendered = useMemo(() => matched.slice(0, MAX_RENDERED), [matched])

  // The selected entry closes itself if a filter (or clear) removes it, so the
  // drawer never shows a stale row.
  const selected = useMemo(
    () => (selectedId ? matched.find((e) => e.id === selectedId) ?? null : null),
    [selectedId, matched],
  )

  return (
    <Flex direction="column" className="h-full min-h-0">
      <ActivityFilterBar
        tokens={tokens}
        draft={draft}
        paused={paused}
        verbose={verbose}
        errorSummary={errorSummary}
        warnSummary={warnSummary}
        canExport={matched.length > 0}
        onTokensChange={setTokens}
        onDraftChange={setDraft}
        onTogglePause={togglePause}
        onToggleVerbose={toggleVerbose}
        onExport={() => downloadEntries(matched)}
        onClear={onClear}
      />
      <ActivityStream
        entries={rendered}
        selectedId={selected ? selectedId : null}
        onSelect={setSelectedId}
        onClose={() => setSelectedId(null)}
        empty={
          <Flex align="center" justify="center" className="h-full p-6">
            <Text size="sm" color="muted">
              {entries.length === 0 ? t('shell.activity.empty') : t('shell.activity.noMatch')}
            </Text>
          </Flex>
        }
      />
      {selected && (
        <>
          <ResizeHandle
            direction="vertical"
            onResize={resize.onResize}
            onResizeEnd={resize.onResizeEnd}
            onDoubleClick={resize.onDoubleClick}
          />
          {/* Fixed height, but capped so the stream keeps at least ~120px. */}
          <Box style={{ height: resize.effective, maxHeight: 'calc(100% - 120px)' }} className="min-h-0 shrink-0">
            <ActivityDetail entry={selected} onClose={() => setSelectedId(null)} />
          </Box>
        </>
      )}
    </Flex>
  )
}
