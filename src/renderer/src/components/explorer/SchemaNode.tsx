import { useEffect, useState } from 'react'
import { ChevronDown, ChevronRight, FolderOpen, RefreshCw, GitFork, Layers, FunctionSquare, Workflow, Zap, Hash, Table2, Eye, KeySquare, Package } from 'lucide-react'
import { useUiStore } from '@/stores/ui'
import { useSchemaStore } from '@/stores/schema'
import { useTabsStore } from '@/stores/tabs'
import { useToastStore } from '@/stores/toast'
import { useClipboard } from '@/hooks/useClipboard'
import { useDataNouns, titleCase } from '@/hooks/useDataNouns'
import { ContextMenu } from '@/primitives/surfaces/ContextMenu'
import type { MenuNode } from '@/primitives/surfaces/menu/types'
import { IconButton } from '@/primitives/forms/Button'
import { Tooltip } from '@/primitives/surfaces/Tooltip'
import { Box, Text, Button } from '@/primitives'
import { TableNode } from './TableNode'
import { ViewNode } from './ViewNode'
import { HighlightedText } from './HighlightedText'
import { SchemaGroup } from './schema-group/SchemaGroup'
import { SchemaObjectGroup } from './schema-group/SchemaObjectGroup'
import { fuzzyMatch } from '@/lib/fuzzy-match'
import { useTranslation } from '@/i18n/I18nProvider'

interface SchemaNodeProps {
  schemaName: string
  connectionId: string
  databaseName?: string
  depth: number
  onExportTable?: (tableName: string) => void
}

export function SchemaNode({ schemaName, connectionId, databaseName, depth, onExportTable }: SchemaNodeProps) {
  const { t } = useTranslation()
  const nodeKey = databaseName
    ? `schema:${connectionId}:${databaseName}:${schemaName}`
    : `schema:${connectionId}:${schemaName}`
  const tableCacheKey = databaseName
    ? `${connectionId}:${databaseName}:${schemaName}`
    : `${connectionId}:${schemaName}`

  const expandedTreeNodes = useUiStore((s) => s.expandedTreeNodes)
  const toggleTreeNode = useUiStore((s) => s.toggleTreeNode)
  const isExpanded = expandedTreeNodes.has(nodeKey)

  const tables = useSchemaStore((s) => s.tables)
  const objects = useSchemaStore((s) => s.objects)
  const filterText = useSchemaStore((s) => s.filterText)
  const switchDatabase = useSchemaStore((s) => s.switchDatabase)
  const fetchTables = useSchemaStore((s) => s.fetchTables)
  const fetchSchemaObjects = useSchemaStore((s) => s.fetchSchemaObjects)
  const clearCache = useSchemaStore((s) => s.clearCache)

  const openErDiagram = useTabsStore((s) => s.openErDiagram)
  const addToast = useToastStore((s) => s.addToast)
  const { copy } = useClipboard()
  const nouns = useDataNouns(connectionId)

  const allTables = tables.get(tableCacheKey) ?? []
  const allObjects = objects.get(tableCacheKey) ?? []

  const loadAll = async () => {
    if (databaseName) await switchDatabase(connectionId, databaseName)
    await Promise.all([
      fetchTables(connectionId, schemaName, databaseName),
      fetchSchemaObjects(connectionId, schemaName, databaseName)
    ])
  }

  useEffect(() => {
    if (!isExpanded || allTables.length > 0) return
    let cancelled = false
    ;(async () => {
      try { if (!cancelled) await loadAll() } catch { /* handled by store */ }
    })()
    return () => { cancelled = true }
  }, [isExpanded, connectionId, databaseName, schemaName]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleToggle() {
    toggleTreeNode(nodeKey)
    if (!isExpanded) {
      try { await loadAll() } catch { /* handled by store */ }
    }
  }

  async function handleRefresh() {
    try {
      clearCache(connectionId)
      await loadAll()
      addToast({ type: 'success', title: t('explorer.toast.schemaRefreshed') })
    } catch {
      addToast({ type: 'error', title: t('explorer.toast.schemaRefreshFailed') })
    }
  }

  function handleCopySchemaName() {
    copy(schemaName, { toast: 'explorer.toast.copiedSchemaName' })
  }

  const menuItems: MenuNode[] = [
    { kind: 'item', id: 'open-er-diagram', label: t('explorer.menu.openErDiagram'), onSelect: () => openErDiagram(connectionId, schemaName) },
    { kind: 'item', id: 'refresh', label: t('explorer.menu.refresh'), onSelect: handleRefresh },
    { kind: 'item', id: 'copy-schema-name', label: t('explorer.menu.copySchemaName'), onSelect: handleCopySchemaName },
  ]

  const matches = (name: string) => !filterText || fuzzyMatch(filterText, name) !== null
  const byScore = <T extends { name: string }>(a: T, b: T) => {
    if (!filterText) return a.name.localeCompare(b.name)
    const sa = fuzzyMatch(filterText, a.name)?.score ?? 0
    const sb = fuzzyMatch(filterText, b.name)?.score ?? 0
    return sa - sb || a.name.localeCompare(b.name)
  }
  const filteredTables = allTables.filter((t) => t.type === 'table' && matches(t.name)).sort(byScore)
  const filteredViews = allTables.filter((t) => t.type === 'view' && matches(t.name)).sort(byScore)
  const matViews = allObjects.filter((o) => o.kind === 'materialized_view' && matches(o.name)).sort(byScore)
  const functions = allObjects.filter((o) => o.kind === 'function' && matches(o.name)).sort(byScore)
  const procedures = allObjects.filter((o) => o.kind === 'procedure' && matches(o.name)).sort(byScore)
  const triggers = allObjects.filter((o) => o.kind === 'trigger' && matches(o.name)).sort(byScore)
  const sequences = allObjects.filter((o) => o.kind === 'sequence' && matches(o.name)).sort(byScore)
  const indexes = allObjects.filter((o) => o.kind === 'index' && matches(o.name)).sort(byScore)
  const extensions = allObjects.filter((o) => o.kind === 'extension' && matches(o.name)).sort(byScore)

  const paddingLeft = 8 + depth * 16
  // One indent step in from the schema row, so group headers sit clearly under it.
  const groupLabelPaddingLeft = paddingLeft + 16
  // Items inside a group nest one step further in (matches TableNode/ViewNode depth+2).
  const groupItemPaddingLeft = paddingLeft + 32
  // Tables/Views rows are real TreeItems with their own chevron; depth+2 keeps
  // them visually nested under their group header instead of crashing into it.
  const childDepth = depth + 2

  const chevron = isExpanded ? (
    <ChevronDown size={12} className="text-text-muted shrink-0" strokeWidth={1.8} />
  ) : (
    <ChevronRight size={12} className="text-text-muted shrink-0" strokeWidth={1.8} />
  )

  return (
    <ContextMenu items={menuItems}>
      <Box>
        {/* Header row */}
        <Button
          variant="bare"
          size="none"
          className="group w-full flex items-center gap-1.5 rounded text-left transition-colors duration-[var(--transition-fast)] hover:bg-hover"
          style={{ paddingLeft, paddingRight: 4, paddingTop: 2, paddingBottom: 2 }}
          onClick={handleToggle}
        >
          {chevron}
          <FolderOpen
            size={14}
            className="text-warning shrink-0"
            strokeWidth={1.8}
          />
          <Box
            as="span"
            className="flex-1 truncate min-w-0 text-xs font-medium text-text-primary"
            title={schemaName}
          >
            <HighlightedText text={schemaName} query={filterText} />
          </Box>

          {/* Hover actions */}
          <Box
            as="span"
            className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5"
          >
            <Box as="span" onClick={(e) => { e.stopPropagation(); openErDiagram(connectionId, schemaName) }}>
              <Tooltip content={t('explorer.tooltip.erDiagram')} side="top">
                <IconButton
                  label={t('explorer.action.erDiagram')}
                  size="xs"
                  variant="ghost"
                  className="h-5 w-5"
                  tabIndex={-1}
                >
                  <GitFork size={10} strokeWidth={1.8} />
                </IconButton>
              </Tooltip>
            </Box>
            <Box as="span" onClick={(e) => { e.stopPropagation(); handleRefresh() }}>
              <Tooltip content={t('explorer.tooltip.refreshSchema')} side="top">
                <IconButton
                  label={t('explorer.action.refreshSchema')}
                  size="xs"
                  variant="ghost"
                  className="h-5 w-5"
                  tabIndex={-1}
                >
                  <RefreshCw size={10} strokeWidth={1.8} />
                </IconButton>
              </Tooltip>
            </Box>
          </Box>
        </Button>

        {/* Expanded content */}
        {isExpanded && (
          <Box>
            {allTables.length === 0 ? (
              <Text
                as="p"
                className="py-1 text-xs text-text-muted"
                style={{ paddingLeft: groupLabelPaddingLeft }}
              >
                {t('explorer.loading.generic')}
              </Text>
            ) : filteredTables.length === 0 && filteredViews.length === 0 ? (
              <Text
                as="p"
                className="py-1 text-xs text-text-muted"
                style={{ paddingLeft: groupLabelPaddingLeft }}
              >
                {t('explorer.status.noMatches')}
              </Text>
            ) : (
              <>
                <SchemaGroup
                  storageKey={`${tableCacheKey}:tables`}
                  label={titleCase(nouns.object.many)}
                  count={filteredTables.length}
                  icon={<Table2 size={12} className="text-accent shrink-0" strokeWidth={1.8} />}
                  headerPaddingLeft={groupLabelPaddingLeft}
                  defaultExpanded
                >
                  {filteredTables.map((t) => (
                    <TableNode
                      key={t.name}
                      tableName={t.name}
                      connectionId={connectionId}
                      schema={schemaName}
                      depth={childDepth}
                      onExportTable={onExportTable}
                      highlightQuery={filterText}
                    />
                  ))}
                </SchemaGroup>

                <SchemaGroup
                  storageKey={`${tableCacheKey}:views`}
                  label={t('explorer.group.views')}
                  count={filteredViews.length}
                  icon={<Eye size={12} className="text-info shrink-0" strokeWidth={1.8} />}
                  headerPaddingLeft={groupLabelPaddingLeft}
                >
                  {filteredViews.map((v) => (
                    <ViewNode
                      key={v.name}
                      viewName={v.name}
                      connectionId={connectionId}
                      schema={schemaName}
                      depth={childDepth}
                      highlightQuery={filterText}
                    />
                  ))}
                </SchemaGroup>

                <SchemaObjectGroup
                  storageKey={`${tableCacheKey}:mvs`}
                  label={t('explorer.group.materializedViews')}
                  items={matViews.map((o) => ({ key: o.name, label: o.name }))}
                  icon={<Layers size={12} className="text-accent shrink-0" strokeWidth={1.8} />}
                  headerPaddingLeft={groupLabelPaddingLeft}
                  itemPaddingLeft={groupItemPaddingLeft}
                />
                <SchemaObjectGroup
                  storageKey={`${tableCacheKey}:indexes`}
                  label={t('explorer.group.indexes')}
                  items={indexes.map((o) => ({
                    key: `${o.parent ?? ''}.${o.name}`,
                    label: o.name,
                    sub: o.parent
                      ? o.returnType
                        ? t('explorer.object.indexOnWithType', { parent: o.parent, type: o.returnType })
                        : t('explorer.object.indexOn', { parent: o.parent })
                      : o.returnType ?? undefined
                  }))}
                  icon={<KeySquare size={12} className="text-warning shrink-0" strokeWidth={1.8} />}
                  headerPaddingLeft={groupLabelPaddingLeft}
                  itemPaddingLeft={groupItemPaddingLeft}
                />
                <SchemaObjectGroup
                  storageKey={`${tableCacheKey}:functions`}
                  label={t('explorer.group.functions')}
                  items={functions.map((o) => ({
                    key: `${o.name}${o.signature ?? ''}`,
                    label: `${o.name}${o.signature ?? ''}`,
                    sub: o.returnType ? t('explorer.object.functionReturns', { type: o.returnType }) : undefined,
                  }))}
                  icon={<FunctionSquare size={12} className="text-info shrink-0" strokeWidth={1.8} />}
                  headerPaddingLeft={groupLabelPaddingLeft}
                  itemPaddingLeft={groupItemPaddingLeft}
                />
                <SchemaObjectGroup
                  storageKey={`${tableCacheKey}:procedures`}
                  label={t('explorer.group.procedures')}
                  items={procedures.map((o) => ({
                    key: `${o.name}${o.signature ?? ''}`,
                    label: `${o.name}${o.signature ?? ''}`,
                  }))}
                  icon={<Workflow size={12} className="text-info shrink-0" strokeWidth={1.8} />}
                  headerPaddingLeft={groupLabelPaddingLeft}
                  itemPaddingLeft={groupItemPaddingLeft}
                />
                <SchemaObjectGroup
                  storageKey={`${tableCacheKey}:triggers`}
                  label={t('explorer.group.triggers')}
                  items={triggers.map((o) => ({
                    key: `${o.parent ?? ''}.${o.name}`,
                    label: o.name,
                    sub: o.parent ? t('explorer.object.triggerOn', { parent: o.parent }) : undefined,
                  }))}
                  icon={<Zap size={12} className="text-warning shrink-0" strokeWidth={1.8} />}
                  headerPaddingLeft={groupLabelPaddingLeft}
                  itemPaddingLeft={groupItemPaddingLeft}
                />
                <SchemaObjectGroup
                  storageKey={`${tableCacheKey}:sequences`}
                  label={t('explorer.group.sequences')}
                  items={sequences.map((o) => ({ key: o.name, label: o.name }))}
                  icon={<Hash size={12} className="text-text-muted shrink-0" strokeWidth={1.8} />}
                  headerPaddingLeft={groupLabelPaddingLeft}
                  itemPaddingLeft={groupItemPaddingLeft}
                />
                <SchemaObjectGroup
                  storageKey={`${tableCacheKey}:extensions`}
                  label={t('explorer.group.extensions')}
                  items={extensions.map((o) => ({ key: o.name, label: o.name }))}
                  icon={<Package size={12} className="text-text-muted shrink-0" strokeWidth={1.8} />}
                  headerPaddingLeft={groupLabelPaddingLeft}
                  itemPaddingLeft={groupItemPaddingLeft}
                />
              </>
            )}
          </Box>
        )}
      </Box>
    </ContextMenu>
  )
}

