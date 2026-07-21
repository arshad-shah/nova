import { useEffect } from 'react'
import { ChevronRight, ChevronDown, Table2 } from 'lucide-react'
import { useUiStore } from '@/stores/ui'
import { useSchemaStore } from '@/stores/schema'
import { ContextMenu } from '@/primitives/surfaces/ContextMenu'
import type { MenuNode } from '@/primitives/surfaces/menu/types'
import { Badge, Box, Card, Text, Button } from '@/primitives'
import { ColumnRow } from './ColumnRow'
import { HighlightedText } from './HighlightedText'
import { TableHoverActions } from './TableHoverActions'
import { useTableNodeActions } from './useTableNodeActions'
import { formatCompactNumber } from '@/lib/format'
import { useDataNouns } from '@/hooks/useDataNouns'
import { useTranslation } from '@/i18n/I18nProvider'
import { treeIndent } from '@/lib/math'

interface TableNodeProps {
  tableName: string
  connectionId: string
  schema: string
  depth: number
  onExportTable?: (tableName: string) => void
  highlightQuery?: string
}

export function TableNode({
  tableName,
  connectionId,
  schema,
  depth,
  onExportTable,
  highlightQuery,
}: TableNodeProps) {
  const { t } = useTranslation()
  const nodeKey = `table:${connectionId}:${schema}:${tableName}`
  const cacheKey = `${connectionId}:${schema}:${tableName}`

  const expandedTreeNodes = useUiStore((s) => s.expandedTreeNodes)
  const toggleTreeNode = useUiStore((s) => s.toggleTreeNode)
  const isExpanded = expandedTreeNodes.has(nodeKey)

  const columns = useSchemaStore((s) => s.columns)
  const indexes = useSchemaStore((s) => s.indexes)
  const rowCounts = useSchemaStore((s) => s.rowCounts)
  const fetchColumns = useSchemaStore((s) => s.fetchColumns)
  const fetchIndexes = useSchemaStore((s) => s.fetchIndexes)
  const fetchRowCount = useSchemaStore((s) => s.fetchRowCount)

  const tableColumns = columns.get(cacheKey) ?? []
  const tableIndexes = indexes.get(cacheKey) ?? []
  const rowCount = rowCounts.get(cacheKey)

  const { canViewData, openData, openInQueryTab, copySampleQuery, menuItems } =
    useTableNodeActions(connectionId, tableName, schema, onExportTable)
  const nouns = useDataNouns(connectionId)

  // Lazy-fetch when expanded
  useEffect(() => {
    if (isExpanded) {
      fetchColumns(connectionId, tableName, schema)
      fetchIndexes(connectionId, tableName, schema)
      fetchRowCount(connectionId, tableName, schema)
    }
  }, [isExpanded, connectionId, tableName, schema, fetchColumns, fetchIndexes, fetchRowCount])

  function handleToggle() {
    toggleTreeNode(nodeKey)
  }

  const paddingLeft = treeIndent(depth)

  // ── Shared header content ──────────────────────────────────────────────────

  const chevron = isExpanded ? (
    <ChevronDown size={12} className="text-text-muted shrink-0" strokeWidth={1.8} />
  ) : (
    <ChevronRight size={12} className="text-text-muted shrink-0" strokeWidth={1.8} />
  )

  const rowCountDisplay =
    rowCount !== undefined ? (
      <Box as="span" className="text-xs shrink-0 text-text-secondary">
        {formatCompactNumber(rowCount)}
      </Box>
    ) : null

  // ── Collapsed view ─────────────────────────────────────────────────────────

  if (!isExpanded) {
    return (
      <ContextMenu items={menuItems}>
        <Button
          variant="bare"
          size="none"
          className="group w-full flex items-center gap-1.5 rounded text-left transition-colors duration-[var(--transition-fast)] hover:bg-hover"
          style={{ paddingLeft, paddingRight: 4, paddingTop: 2, paddingBottom: 2 }}
          onClick={handleToggle}
        >
          {chevron}
          <Table2 size={14} className="text-accent shrink-0" strokeWidth={1.8} />
          <Text
            as="span"
            truncate
            size="xs"
            className="flex-1 min-w-0"
            title={tableName}
          >
            <HighlightedText text={tableName} query={highlightQuery ?? ''} />
          </Text>
          {rowCountDisplay}

          <TableHoverActions
            canViewData={canViewData}
            onViewData={openData}
            onOpenInQueryTab={openInQueryTab}
            objectNoun={nouns.object.one}
            onCopySampleQuery={copySampleQuery}
          />
        </Button>
      </ContextMenu>
    )
  }

  // ── Expanded view (contained card) ─────────────────────────────────────────

  return (
    <ContextMenu items={menuItems}>
      {/* The comment above already called this a contained card — it just
          predated Card being able to express it. */}
      <Card
        padding="none"
        className="mb-1 overflow-hidden"
        style={{
          marginLeft: paddingLeft,
          marginRight: 4,
        }}
      >
        {/* Card header button */}
        <Button
          variant="bare"
          size="none"
          className="group w-full flex items-center gap-1.5 text-left transition-colors duration-[var(--transition-fast)] bg-bg-tertiary border-b border-border-default hover:bg-[color-mix(in_srgb,var(--color-hover)_60%,var(--color-bg-tertiary))]"
          style={{
            paddingLeft: 8,
            paddingRight: 6,
            paddingTop: 3,
            paddingBottom: 3,
          }}
          onClick={handleToggle}
        >
          {chevron}
          <Table2 size={14} className="text-accent shrink-0" strokeWidth={1.8} />
          <Text
            as="span"
            truncate
            size="xs"
            weight="medium"
            className="flex-1 min-w-0"
            title={tableName}
          >
            <HighlightedText text={tableName} query={highlightQuery ?? ''} />
          </Text>

          {/* Stat pills */}
          <Box as="span" className="flex items-center gap-1 shrink-0">
            {rowCount !== undefined && (
              <Badge size="pill" className="font-normal shadow-none">
                {t('explorer.table.rows', { value: formatCompactNumber(rowCount), records: rowCount === 1 ? nouns.record.one : nouns.record.many })}
              </Badge>
            )}
            {tableIndexes.length > 0 && (
              <Badge size="pill" className="font-normal shadow-none">
                {t('explorer.table.indexes', { value: tableIndexes.length, n: tableIndexes.length })}
              </Badge>
            )}
          </Box>

          <TableHoverActions
            canViewData={canViewData}
            onViewData={openData}
            onOpenInQueryTab={openInQueryTab}
            objectNoun={nouns.object.one}
            onExportTable={onExportTable ? () => onExportTable(tableName) : undefined}
          />
        </Button>

        {/* Column rows */}
        <Box className="py-1">
          {tableColumns.length === 0 ? (
            <Text as="p" className="px-3 py-1 text-xs text-text-secondary">
              {/* Distinguish "loaded, but this driver has no columns" (e.g. Redis)
                  from "still fetching" — otherwise schema-less drivers show a
                  perpetual "Loading columns…". */}
              {columns.has(cacheKey)
                ? t('explorer.noColumns', { fields: nouns.field.many })
                : t('explorer.loading.columns', { fields: nouns.field.many })}
            </Text>
          ) : (
            tableColumns.map((col) => (
              <ColumnRow key={col.name} column={col} tableName={tableName} connectionId={connectionId} />
            ))
          )}
        </Box>
      </Card>
    </ContextMenu>
  )
}
