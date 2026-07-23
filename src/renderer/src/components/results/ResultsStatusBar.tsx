import { useState, type ReactNode } from 'react'
import { Download } from 'lucide-react'
import type { QueryResult } from '@shared/types'
import { Flex, Text, Button } from '@/primitives'
import { IPC_CHANNELS } from '@shared/ipc'
import { useTranslation } from '@/i18n/I18nProvider'
import { ipc } from '@/platform/client'

interface Props {
  results: QueryResult
  /** Plugin-contributed action buttons (e.g. AI Explain). Rendered inline. */
  actions?: ReactNode
}

export function ResultsStatusBar({ results, actions }: Props) {
  const { t } = useTranslation()
  const [exporting, setExporting] = useState(false)

  const handleExport = async (format: 'csv' | 'json') => {
    setExporting(true)
    try {
      const fields = results.fields.map(f => f.name)
      await ipc.invoke(IPC_CHANNELS.EXPORT_QUERY_RESULT, results.rows, fields, format)
    } catch {
      // ignore — user may have cancelled
    }
    setExporting(false)
  }

  return (
    <Flex
      direction="row"
      align="center"
      justify="between"
      gap="md"
      className="px-3 py-1 border-t border-border bg-bg-secondary text-xs shrink-0"
    >
      <Flex direction="row" align="center" gap="md" className="min-w-0">
        <Text size="xs" color="success">
          {t('query.results.rows', { count: results.rowCount })}
        </Text>
        <Text size="xs" color="muted">·</Text>
        <Text size="xs" color="secondary">{t('query.results.duration', { ms: results.duration })}</Text>
        <Text size="xs" color="muted">·</Text>
        <Text size="xs" color="muted">{t('query.results.cols', { count: results.fields.length })}</Text>
        {results.affectedRows > 0 && (
          <>
            <Text size="xs" color="muted">·</Text>
            <Text size="xs" color="warning">{t('query.results.affected', { count: results.affectedRows })}</Text>
          </>
        )}
      </Flex>
      <Flex direction="row" align="center" gap="xs">
        {actions}
        <Button
          variant="ghost"
          size="xs"
          onClick={() => handleExport('csv')}
          disabled={exporting}
          className="flex items-center gap-1 text-text-muted hover:text-text-primary h-auto py-0"
          title={t('query.results.exportCsvTitle')}
        >
          <Download size={10} /> {t('query.results.exportCsv')}
        </Button>
        <Button
          variant="ghost"
          size="xs"
          onClick={() => handleExport('json')}
          disabled={exporting}
          className="flex items-center gap-1 text-text-muted hover:text-text-primary h-auto py-0"
          title={t('query.results.exportJsonTitle')}
        >
          <Download size={10} /> {t('query.results.exportJson')}
        </Button>
      </Flex>
    </Flex>
  )
}
