import { useCallback, useState } from 'react'
import { useAsyncEffect } from '@/hooks/useAsyncEffect'
import { parseAppError } from '@/lib/db-error'
import { RefreshCw } from 'lucide-react'
import { Flex, Box, Text, IconButton, Spinner, EmptyState } from '@/primitives'
import { ResultsGrid } from '@/components/results/ResultsGrid'
import { IPC_CHANNELS } from '@shared/ipc'
import type { TableTab, QueryResult, SchemaColumn } from '@shared/types'
import { useTranslation } from '@/i18n/I18nProvider'
import { ipc } from '@/platform/client'

interface LoadState {
  loading: boolean
  result: QueryResult | null
  error: string | null
}

/**
 * Data-grid browse for a table/collection/key-prefix, backed by the driver's own
 * `getTableData` reader (via `db:get-table-data`). This is how non-SQL drivers
 * (Redis key/value, Mongo documents) get a real grid the renderer couldn't build
 * from a SELECT — the renderer stays dialect-agnostic and just renders the
 * driver-shaped rows/columns through the standard results grid.
 */
export function TableDataView({ tab }: { tab: TableTab }) {
  const { t } = useTranslation()
  const [state, setState] = useState<LoadState>({ loading: true, result: null, error: null })

  // `isCancelled` is supplied by the effect so a slow load for a table the user
  // has already navigated away from can't overwrite the new table's grid; the
  // manual refresh button omits it and always applies.
  const load = useCallback(async (isCancelled?: () => boolean) => {
    setState((s) => ({ ...s, loading: true, error: null }))
    try {
      const { rows, columns } = await ipc.invoke(
        IPC_CHANNELS.DB_GET_TABLE_DATA,
        tab.connectionId,
        tab.tableName,
        tab.schema,
      )
      if (isCancelled?.()) return
      const result: QueryResult = {
        rows,
        fields: columns.map((c: SchemaColumn) => ({ name: c.name, dataType: c.dataType, nullable: c.nullable })),
        rowCount: rows.length,
        duration: 0,
        affectedRows: 0,
      }
      setState({ loading: false, result, error: null })
    } catch (err) {
      if (isCancelled?.()) return
      setState({ loading: false, result: null, error: parseAppError(err).message })
    }
  }, [tab.connectionId, tab.tableName, tab.schema])

  useAsyncEffect((isCancelled) => load(isCancelled), [load])

  return (
    <Flex direction="column" className="h-full min-h-0">
      <Flex align="center" justify="between" className="px-3 py-1.5 border-b border-border-default shrink-0">
        <Flex align="center" gap="sm" className="min-w-0">
          <Text size="sm" weight="semibold" color="primary" className="truncate">{tab.tableName}</Text>
          {state.result && <Text size="xs" color="muted">{t('table.rows', { value: state.result.rowCount, n: state.result.rowCount })}</Text>}
        </Flex>
        <IconButton variant="ghost" size="xs" label={t('common.refresh')} onClick={() => void load()} disabled={state.loading}>
          <RefreshCw size={13} className={state.loading ? 'animate-spin' : undefined} />
        </IconButton>
      </Flex>
      <Box className="flex-1 min-h-0">
        {state.loading ? (
          <Flex align="center" justify="center" className="h-full"><Spinner /></Flex>
        ) : state.error ? (
          <Flex align="center" justify="center" className="h-full p-6">
            <Text size="sm" color="error" className="font-mono whitespace-pre-wrap text-center">{state.error}</Text>
          </Flex>
        ) : state.result && state.result.rows.length > 0 ? (
          <ResultsGrid results={state.result} tabId={tab.id} />
        ) : (
          <Flex align="center" justify="center" className="h-full">
            <EmptyState title={t('table.empty')} />
          </Flex>
        )}
      </Box>
    </Flex>
  )
}
