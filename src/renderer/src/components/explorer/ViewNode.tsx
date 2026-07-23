import { ChevronRight, ChevronDown, Eye, ExternalLink } from 'lucide-react'
import { useUiStore } from '@/stores/ui'
import { useSchemaStore } from '@/stores/schema'
import { useTabsStore } from '@/stores/tabs'
import { useConnectionsStore } from '@/stores/connections'
import { useClipboard } from '@/hooks/useClipboard'
import { useDataNouns } from '@/hooks/useDataNouns'
import { initialAutoCommit } from '@/lib/initial-autocommit'
import { ContextMenu } from '@/primitives/surfaces/ContextMenu'
import type { MenuNode } from '@/primitives/surfaces/menu/types'
import { IconButton } from '@/primitives/forms/Button'
import { Box, Text } from '@/primitives'
import { ColumnRow } from './ColumnRow'
import { HighlightedText } from './HighlightedText'
import { IPC_CHANNELS } from '@shared/ipc'
import { useTranslation } from '@/i18n/I18nProvider'
import { treeIndent } from '@/lib/math'
import { ipc } from '@/platform/client'

interface ViewNodeProps {
  viewName: string
  connectionId: string
  schema: string
  depth: number
  highlightQuery?: string
}

export function ViewNode({ viewName, connectionId, schema, depth, highlightQuery }: ViewNodeProps) {
  const { t } = useTranslation()
  const expandedTreeNodes = useUiStore((s) => s.expandedTreeNodes)
  const toggleTreeNode = useUiStore((s) => s.toggleTreeNode)
  const columns = useSchemaStore((s) => s.columns)
  const fetchColumns = useSchemaStore((s) => s.fetchColumns)
  const addQueryTab = useTabsStore((s) => s.addQueryTab)
  const updateTabSql = useTabsStore((s) => s.updateTabSql)
  const { copy } = useClipboard()
  const nouns = useDataNouns(connectionId)
  const profile = useConnectionsStore((s) => s.connections.find(c => c.id === connectionId) ?? null)

  const nodeKey = `view:${connectionId}:${schema}:${viewName}`
  const colCacheKey = `${connectionId}:${schema}:${viewName}`
  const isExpanded = expandedTreeNodes.has(nodeKey)
  const cols = columns.get(colCacheKey) ?? []

  async function getSampleQuery(): Promise<string> {
    try {
      return await ipc.invoke(IPC_CHANNELS.DB_SAMPLE_QUERY, connectionId, viewName, schema) as string
    } catch {
      return `SELECT * FROM "${viewName}" LIMIT 100;`
    }
  }

  function handleToggle() {
    toggleTreeNode(nodeKey)
    if (!isExpanded) {
      fetchColumns(connectionId, viewName, schema)
    }
  }

  async function handleOpenInTab() {
    const query = await getSampleQuery()
    const tabId = addQueryTab(connectionId, schema, { autoCommit: initialAutoCommit(profile) })
    updateTabSql(tabId, query)
  }

  const menuItems: MenuNode[] = [
    {
      kind: 'item',
      id: 'open-in-query-tab',
      label: t('explorer.menu.openInQueryTab'),
      onSelect: handleOpenInTab,
    },
    {
      kind: 'item',
      id: 'copy-view-name',
      label: t('explorer.menu.copyViewName'),
      onSelect: () => copy(viewName, { toast: 'explorer.toast.copiedViewName' }),
    },
    {
      kind: 'item',
      id: 'copy-sample-query',
      label: t('explorer.menu.copySampleQuery'),
      onSelect: async () => {
        const query = await getSampleQuery()
        copy(query, { toast: 'explorer.toast.copiedSampleQuery' })
      },
    },
  ]

  const paddingLeft = treeIndent(depth)

  if (!isExpanded) {
    return (
      <ContextMenu items={menuItems}>
        <Box
          className="group flex items-center gap-1 h-7 rounded cursor-pointer select-none min-w-0 pr-1 hover:bg-hover"
          style={{ paddingLeft }}
          onClick={handleToggle}
        >
          <ChevronRight
            size={12}
            className="text-text-muted shrink-0"
            strokeWidth={1.8}
          />
          <Eye
            size={14}
            className="text-info shrink-0"
            strokeWidth={1.8}
          />
          <Text
            as="span"
            truncate
            size="xs"
            className="flex-1 min-w-0"
            title={viewName}
          >
            <HighlightedText text={viewName} query={highlightQuery ?? ''} />
          </Text>
          <Box
            as="span"
            className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center"
            onClick={(e) => e.stopPropagation()}
          >
            <IconButton
              label={t('explorer.action.openInQueryTab')}
              size="xs"
              variant="ghost"
              className="h-5 w-5"
              onClick={handleOpenInTab}
            >
              <ExternalLink size={10} strokeWidth={1.8} />
            </IconButton>
          </Box>
        </Box>
      </ContextMenu>
    )
  }

  // Expanded: contained card
  return (
    <ContextMenu items={menuItems}>
      <Box
        className="rounded my-0.5 overflow-hidden border border-border-default bg-bg-secondary"
        style={{
          marginLeft: paddingLeft,
          marginRight: 4,
        }}
      >
        {/* Card header */}
        <Box
          className="flex items-center gap-1 h-7 px-2 cursor-pointer select-none bg-bg-tertiary hover:bg-hover"
          onClick={handleToggle}
        >
          <ChevronDown
            size={12}
            className="text-text-muted shrink-0"
            strokeWidth={1.8}
          />
          <Eye
            size={14}
            className="text-info shrink-0"
            strokeWidth={1.8}
          />
          <Text
            as="span"
            truncate
            size="xs"
            weight="medium"
            className="flex-1 min-w-0"
            title={viewName}
          >
            <HighlightedText text={viewName} query={highlightQuery ?? ''} />
          </Text>
        </Box>

        {/* Column rows */}
        <Box className="py-0.5">
          {cols.length === 0 ? (
            <Text as="p" className="text-xs px-2 py-1.5 text-text-muted">
              {t('explorer.loading.columns', { fields: nouns.field.many })}
            </Text>
          ) : (
            cols.map((col) => (
              <ColumnRow key={col.name} column={col} tableName={viewName} connectionId={connectionId} />
            ))
          )}
        </Box>
      </Box>
    </ContextMenu>
  )
}
