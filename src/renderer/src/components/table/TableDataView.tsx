import { useCallback, useMemo, useState } from 'react'
import { useAsyncEffect } from '@/hooks/useAsyncEffect'
import { parseAppError } from '@/lib/db-error'
import { RefreshCw } from 'lucide-react'
import { Flex, Box, Text, Button, IconButton, Spinner, EmptyState } from '@/primitives'
import { ResultsGrid } from '@/components/results/ResultsGrid.lazy'
import { IPC_CHANNELS } from '@shared/ipc'
import type { TableTab, QueryResult, SchemaColumn } from '@shared/types'
import { useTranslation } from '@/i18n/I18nProvider'
import { useSettingsStore } from '@/stores/settings'
import { ipc } from '@/platform/client'

interface DataState {
  loading: boolean
  loadingMore: boolean
  rows: Record<string, unknown>[]
  columns: SchemaColumn[]
  hasMore: boolean
  error: string | null
}

const EMPTY: DataState = {
  loading: true,
  loadingMore: false,
  rows: [],
  columns: [],
  hasMore: false,
  error: null,
}

/**
 * Data-grid browse for a table/collection/key-prefix, backed by the driver's own
 * `getTableData` reader (via `db:get-table-data`). This is how non-SQL drivers
 * (Redis key/value, Mongo documents) get a real grid the renderer couldn't build
 * from a SELECT — the renderer stays dialect-agnostic and just renders the
 * driver-shaped rows/columns through the standard results grid.
 *
 * The read is bounded by the `general.maxViewDataRows` setting so a huge table
 * loads a page at a time instead of whole; when more rows remain the header
 * offers a "load more" affordance that fetches the next page.
 */
export function TableDataView({ tab }: { tab: TableTab }) {
  const { t } = useTranslation()
  const pageSize = useSettingsStore((s) => Math.max(1, s.settings.general.maxViewDataRows))
  const [state, setState] = useState<DataState>(EMPTY)

  // `isCancelled` is supplied by the effect so a slow load for a table the user
  // has already navigated away from can't overwrite the new table's grid; the
  // manual refresh / load-more buttons omit it and always apply.
  const fetchPage = useCallback(
    async (offset: number, append: boolean, isCancelled?: () => boolean) => {
      setState((s) =>
        append
          ? { ...s, loadingMore: true, error: null }
          : { ...EMPTY, loading: true },
      )
      try {
        const { rows, columns, hasMore } = await ipc.invoke(
          IPC_CHANNELS.DB_GET_TABLE_DATA,
          tab.connectionId,
          tab.tableName,
          tab.schema,
          { limit: pageSize, offset },
        )
        if (isCancelled?.()) return
        setState((s) => ({
          loading: false,
          loadingMore: false,
          rows: append ? [...s.rows, ...rows] : rows,
          columns,
          hasMore: !!hasMore,
          error: null,
        }))
      } catch (err) {
        if (isCancelled?.()) return
        setState((s) => ({
          ...s,
          loading: false,
          loadingMore: false,
          error: parseAppError(err).message,
        }))
      }
    },
    [tab.connectionId, tab.tableName, tab.schema, pageSize],
  )

  useAsyncEffect((isCancelled) => fetchPage(0, false, isCancelled), [fetchPage])

  const result = useMemo<QueryResult>(
    () => ({
      rows: state.rows,
      fields: state.columns.map((c) => ({ name: c.name, dataType: c.dataType, nullable: c.nullable })),
      rowCount: state.rows.length,
      duration: 0,
      affectedRows: 0,
    }),
    [state.rows, state.columns],
  )

  const busy = state.loading || state.loadingMore

  return (
    <Flex direction="column" className="h-full min-h-0">
      <Flex align="center" justify="between" className="px-3 py-1.5 border-b border-border-default shrink-0">
        <Flex align="center" gap="sm" className="min-w-0">
          <Text size="sm" weight="semibold" color="primary" className="truncate">{tab.tableName}</Text>
          {!state.loading && !state.error && (
            <Text size="xs" color="muted">
              {state.hasMore
                ? t('table.showingFirst', { value: state.rows.length, n: state.rows.length })
                : t('table.rows', { value: state.rows.length, n: state.rows.length })}
            </Text>
          )}
        </Flex>
        <Flex align="center" gap="xs">
          {state.hasMore && !state.error && (
            <Button variant="ghost" size="xs" onClick={() => void fetchPage(state.rows.length, true)} disabled={busy} loading={state.loadingMore}>
              {t('table.loadMore')}
            </Button>
          )}
          <IconButton variant="ghost" size="xs" label={t('common.refresh')} onClick={() => void fetchPage(0, false)} disabled={busy}>
            <RefreshCw size={13} className={state.loading ? 'animate-spin' : undefined} />
          </IconButton>
        </Flex>
      </Flex>
      <Box className="flex-1 min-h-0">
        {state.loading ? (
          <Flex align="center" justify="center" className="h-full"><Spinner /></Flex>
        ) : state.error ? (
          <Flex align="center" justify="center" className="h-full p-6">
            <Text size="sm" color="error" className="font-mono whitespace-pre-wrap text-center">{state.error}</Text>
          </Flex>
        ) : state.rows.length > 0 ? (
          <ResultsGrid results={result} tabId={tab.id} />
        ) : (
          <Flex align="center" justify="center" className="h-full">
            <EmptyState title={t('table.empty')} />
          </Flex>
        )}
      </Box>
    </Flex>
  )
}
