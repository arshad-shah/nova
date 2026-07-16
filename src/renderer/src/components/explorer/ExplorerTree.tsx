import { useEffect } from 'react'
import { Database, Loader2 } from 'lucide-react'
import { useConnectionsStore } from '@/stores/connections'
import { useSchemaStore } from '@/stores/schema'
import { EmptyState } from '@/primitives/data-display/EmptyState'
import { Text } from '@/primitives/typography/Text'
import { SearchFilter } from './SearchFilter'
import { DatabaseNode } from './DatabaseNode'
import { SchemaNode } from './SchemaNode'
import { TableNode } from './TableNode'
import { ViewNode } from './ViewNode'
import { fuzzyMatch } from '@/lib/fuzzy-match'
import { useDataNouns, titleCase } from '@/hooks/useDataNouns'
import { useTranslation } from '@/i18n/I18nProvider'

interface ExplorerTreeProps {
  onExportTable?: (tableName: string) => void
}

export function ExplorerTree({ onExportTable }: ExplorerTreeProps) {
  const { t } = useTranslation()
  const activeConnectionId = useConnectionsStore((s) => s.activeConnectionId)
  const connectedIds = useConnectionsStore((s) => s.connectedIds)
  const nouns = useDataNouns(activeConnectionId)

  const databases = useSchemaStore((s) => s.databases)
  const schemas = useSchemaStore((s) => s.schemas)
  const tables = useSchemaStore((s) => s.tables)
  const filterText = useSchemaStore((s) => s.filterText)
  const loading = useSchemaStore((s) => s.loading)
  const fetchDatabases = useSchemaStore((s) => s.fetchDatabases)
  const fetchSchemas = useSchemaStore((s) => s.fetchSchemas)
  const fetchTables = useSchemaStore((s) => s.fetchTables)

  const isConnected = activeConnectionId != null && connectedIds.has(activeConnectionId)

  // Fetch databases and schemas when connection changes
  useEffect(() => {
    if (!activeConnectionId || !connectedIds.has(activeConnectionId)) return
    fetchDatabases(activeConnectionId)
    fetchSchemas(activeConnectionId)
  }, [activeConnectionId, connectedIds, fetchDatabases, fetchSchemas])

  // Check if we have loaded the hierarchy metadata yet
  const hasDatabases = activeConnectionId ? databases.has(activeConnectionId) : false
  const hasSchemas = activeConnectionId ? schemas.has(activeConnectionId) : false
  const hierarchyLoaded = hasDatabases && hasSchemas

  // Derive hierarchy shape (only meaningful when data has loaded)
  const databaseList = activeConnectionId ? (databases.get(activeConnectionId) ?? []) : []
  const schemaList = activeConnectionId ? (schemas.get(activeConnectionId) ?? []) : []

  const isSingleDb = databaseList.length <= 1
  const isSingleSchema = schemaList.length <= 1
  const isFlat = isSingleDb && isSingleSchema

  // For the flat (single-DB + single-schema) case, fetch tables immediately
  const defaultSchema = schemaList[0] ?? 'public'
  const tableCacheKey = activeConnectionId ? `${activeConnectionId}:${defaultSchema}` : ''
  const allTables = tables.get(tableCacheKey) ?? []

  useEffect(() => {
    if (!hierarchyLoaded || !isFlat || !activeConnectionId || !isConnected) return
    fetchTables(activeConnectionId, defaultSchema)
  }, [hierarchyLoaded, isFlat, activeConnectionId, isConnected, defaultSchema, fetchTables])

  // Fuzzy filter + score-sort for the flat view
  const filteredTables = (filterText
    ? allTables
        .filter((t) => t.type === 'table')
        .map((t) => ({ t, m: fuzzyMatch(filterText, t.name) }))
        .filter((x) => x.m !== null)
        .sort((a, b) => (a.m!.score - b.m!.score) || a.t.name.localeCompare(b.t.name))
        .map((x) => x.t)
    : allTables.filter((t) => t.type === 'table'))
  const filteredViews = (filterText
    ? allTables
        .filter((t) => t.type === 'view')
        .map((t) => ({ t, m: fuzzyMatch(filterText, t.name) }))
        .filter((x) => x.m !== null)
        .sort((a, b) => (a.m!.score - b.m!.score) || a.t.name.localeCompare(b.t.name))
        .map((x) => x.t)
    : allTables.filter((t) => t.type === 'view'))

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Connection selection lives in the secondary sidebar's Connections
          panel (and as a quick-swap in the StatusBar). The Explorer just
          shows the active connection's tree — keeps one source of truth
          for who's connected and which connection is "active". */}
      {!isConnected ? (
        <div className="flex-1 flex items-center justify-center p-4">
          <EmptyState
            title={t('explorer.empty.noConnection.title')}
            description={t('explorer.empty.noConnection.description')}
            icon={<Database size={32} strokeWidth={1.8} className="text-[var(--color-text-disabled)]" />}
          />
        </div>
      ) : !hierarchyLoaded ? (
        /* Show loading while databases/schemas are being fetched */
        <div className="flex-1 flex items-center justify-center p-4">
          <Loader2 size={20} strokeWidth={1.8} className="animate-spin text-text-muted" />
        </div>
      ) : (
        <>
          <SearchFilter
            resultCount={
              isFlat && filterText ? filteredTables.length + filteredViews.length : undefined
            }
          />

          {/* Flat: single-DB + single-schema (e.g. SQLite) */}
          {isFlat && (
            <div className="py-1 flex-1 overflow-y-auto min-h-0">
              {filteredTables.length === 0 && filteredViews.length === 0 && (
                <Text size="xs" color="muted" className="px-4 py-2">
                  {allTables.length === 0
                    ? t('explorer.loading.tables', { objects: nouns.object.many })
                    : filterText
                    ? t('explorer.status.noMatchesFor', { query: filterText })
                    : t('explorer.status.noTables', { objects: nouns.object.many })}
                </Text>
              )}
              {filteredTables.length > 0 && (
                <div>
                  <Text
                    size="xs"
                    color="muted"
                    weight="medium"
                    className="uppercase tracking-wider opacity-40 px-4 py-1"
                  >
                    {titleCase(nouns.object.many)}
                  </Text>
                  {filteredTables.map((t) => (
                    <TableNode
                      key={t.name}
                      tableName={t.name}
                      connectionId={activeConnectionId}
                      schema={defaultSchema}
                      depth={0}
                      onExportTable={onExportTable}
                      highlightQuery={filterText}
                    />
                  ))}
                </div>
              )}
              {filteredViews.length > 0 && (
                <div>
                  <Text
                    size="xs"
                    color="muted"
                    weight="medium"
                    className="uppercase tracking-wider opacity-40 px-4 py-1"
                  >
                    {t('explorer.group.views')}
                  </Text>
                  {filteredViews.map((v) => (
                    <ViewNode
                      key={v.name}
                      viewName={v.name}
                      connectionId={activeConnectionId}
                      schema={defaultSchema}
                      depth={0}
                      highlightQuery={filterText}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Single-DB + multiple schemas */}
          {isSingleDb && !isSingleSchema && (
            <div className="py-1 flex-1 overflow-y-auto min-h-0">
              {schemaList.map((s) => (
                <SchemaNode
                  key={s}
                  schemaName={s}
                  connectionId={activeConnectionId}
                  depth={0}
                  onExportTable={onExportTable}
                />
              ))}
            </div>
          )}

          {/* Multiple databases */}
          {!isSingleDb && (
            <div className="py-1 flex-1 overflow-y-auto min-h-0">
              {databaseList.filter(Boolean).map((db) => (
                <DatabaseNode
                  key={db}
                  databaseName={db}
                  connectionId={activeConnectionId}
                  depth={0}
                  onExportTable={onExportTable}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
