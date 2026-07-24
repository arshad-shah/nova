import React, { useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import { Flex, Box, Button, cn } from '@/primitives'
import type { ActivityEntry } from '@shared/activity'
import { useTranslation } from '@/i18n/I18nProvider'
import { formatClockTimeWithMillis } from '@/lib/format-time'
import { KIND_META } from '@/lib/activity/meta'

/** A labelled field row. */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Box className="flex gap-2">
      <Box as="span" className="w-20 shrink-0 text-3xs uppercase tracking-wider text-text-muted">{label}</Box>
      <Box as="span" className="min-w-0 flex-1 break-words font-mono text-3xs text-text-secondary">{children}</Box>
    </Box>
  )
}

function Pre({ text, tone }: { text: string; tone?: 'error' }) {
  return (
    <Box as="pre" className={cn(
      'mt-1 max-h-56 overflow-auto whitespace-pre-wrap break-words rounded bg-bg-inset p-2 font-mono text-3xs',
      tone === 'error' ? 'text-error/90' : 'text-text-secondary',
    )}>
      {text}
    </Box>
  )
}

export interface ActivityDetailProps {
  entry: ActivityEntry
  onClose: () => void
}

/**
 * The pinned detail drawer. Carries the structured fields that used to expand
 * inline in the row (so selecting a row never reflows the stream), plus the
 * detail text, metadata JSON and the error stack. Focus moves here on open and
 * returns to the row on close (handled by the stream).
 */
export function ActivityDetail({ entry, onClose }: ActivityDetailProps) {
  const { t } = useTranslation()
  const ref = useRef<HTMLDivElement>(null)
  const metaJson = entry.metadata ? JSON.stringify(entry.metadata, null, 2) : null
  const { label } = KIND_META[entry.kind]

  // Move focus into the drawer on open so keyboard users land here; Escape (or
  // the close button) returns them to the stream.
  useEffect(() => { ref.current?.focus() }, [entry.id])

  return (
    <Box
      ref={ref}
      tabIndex={-1}
      role="region"
      aria-label={t('shell.activity.detailTitle')}
      onKeyDown={(e: React.KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose() } }}
      className="flex h-full min-h-0 flex-col overflow-hidden border-t border-border bg-bg-secondary outline-none"
    >
      <Flex align="center" gap="xs" className="shrink-0 border-b border-border/60 px-3 py-1.5">
        <Box as="span" className="min-w-0 flex-1 truncate text-2xs font-medium text-text-primary">{entry.title}</Box>
        <Button
          variant="bare"
          size="none"
          type="button"
          onClick={onClose}
          title={t('common.close')}
          aria-label={t('common.close')}
          className="flex shrink-0 items-center rounded p-1 text-text-muted hover:bg-hover hover:text-text-primary"
        >
          <X size={13} />
        </Button>
      </Flex>
      <Box className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-auto px-3 py-2">
        <Field label={t('shell.activity.fieldTime')}>{formatClockTimeWithMillis(entry.ts)}</Field>
        <Field label={t('shell.activity.fieldKind')}>{t(label)} · {entry.level}</Field>
        {entry.source && <Field label={t('shell.activity.fieldSource')}>{entry.source}</Field>}
        {entry.durationMs !== undefined && <Field label={t('shell.activity.fieldDuration')}>{Math.round(entry.durationMs)}ms</Field>}
        {entry.traceId && <Field label={t('shell.activity.fieldTrace')}>{entry.traceId}</Field>}
        {entry.detail && <Pre text={entry.detail} />}
        {metaJson && <Pre text={metaJson} />}
        {entry.stack && <Pre text={entry.stack} tone="error" />}
      </Box>
    </Box>
  )
}
