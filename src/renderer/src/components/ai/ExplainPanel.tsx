import { useCallback } from 'react'
import { Sparkles } from 'lucide-react'
import { Spinner } from '@/primitives/feedback/Spinner'
import type { QueryResult } from '@shared/types'
import { Button } from '@/primitives/forms/Button'
import { useExplainStore } from '@/stores/explain'
import { notifyError } from '@/lib/notify-error'
import { parseAppError } from '@/lib/db-error'
import { IPC_CHANNELS } from '@shared/ipc'
import { useTranslation } from '@/i18n/I18nProvider'
import { t as coreT } from '@shared/i18n'
import { ipc } from '@/platform/client'

interface Props {
  tabId: string
  sql: string
  results: QueryResult
  explanation: string | null
}

export function ExplainPanel({ tabId, sql, results, explanation }: Props) {
  const { t } = useTranslation()
  const loading = useExplainStore(s => s.byTab[tabId]?.loading ?? false)
  const startStream = useExplainStore(s => s.startStream)

  const run = useCallback(async () => {
    if (loading) return
    const request = {
      sql,
      columns: results.fields.map(f => f.name),
      rowCount: results.rowCount,
      sampleRows: results.rows.slice(0, 5),
    }
    try {
      const { streamId, model } = await ipc.invoke(
        IPC_CHANNELS.AI_EXPLAIN_START,
        request,
      ) as { streamId: string; model: string }
      startStream(tabId, streamId, model)
    } catch (err) {
      const parsed = parseAppError(err)
      useExplainStore.getState().failStream(tabId, parsed.message)
      notifyError(err, { titlePrefix: coreT('aiui.explain.failedPrefix') })
    }
  }, [tabId, sql, results, loading, startStream])

  return (
    <Button
      variant="ghost"
      size="xs"
      className="!h-6 !px-2 gap-1"
      onClick={run}
      disabled={loading}
    >
      {loading
        ? <Spinner size="xs" />
        : <Sparkles size={10} className={explanation ? 'text-accent' : 'text-text-muted'} />}
      {t('aiui.explain.explain')}
    </Button>
  )
}
