import { useEffect, useState } from 'react'
import { ChevronRight, ChevronDown, Database, RefreshCw } from 'lucide-react'
import { useUiStore } from '@/stores/ui'
import { useSchemaStore } from '@/stores/schema'
import { useToastStore } from '@/stores/toast'
import { useClipboard } from '@/hooks/useClipboard'
import { ContextMenu } from '@/primitives/surfaces/ContextMenu'
import { IconButton } from '@/primitives/forms/Button'
import { Tooltip } from '@/primitives/surfaces/Tooltip'
import { SchemaNode } from './SchemaNode'
import { useTranslation } from '@/i18n/I18nProvider'

interface DatabaseNodeProps {
  databaseName: string
  connectionId: string
  depth: number
  onExportTable?: (tableName: string) => void
}

export function DatabaseNode({
  databaseName,
  connectionId,
  depth,
  onExportTable,
}: DatabaseNodeProps) {
  const { t } = useTranslation()
  const nodeKey = `db:${connectionId}:${databaseName}`

  const expandedTreeNodes = useUiStore((s) => s.expandedTreeNodes)
  const toggleTreeNode = useUiStore((s) => s.toggleTreeNode)
  const isExpanded = expandedTreeNodes.has(nodeKey)

  const schemas = useSchemaStore((s) => s.schemas)
  const switchDatabase = useSchemaStore((s) => s.switchDatabase)
  const fetchSchemas = useSchemaStore((s) => s.fetchSchemas)
  const clearCache = useSchemaStore((s) => s.clearCache)

  const addToast = useToastStore((s) => s.addToast)
  const { copy } = useClipboard()

  const [switchError, setSwitchError] = useState(false)

  // Schemas are keyed by connectionId:databaseName
  const schemaCacheKey = `${connectionId}:${databaseName}`
  const schemaList = schemas.get(schemaCacheKey) ?? []

  // When expanded, switch to this database and fetch its schemas
  useEffect(() => {
    if (!isExpanded || switchError) return
    if (schemaList.length > 0) return // already cached

    let cancelled = false
    ;(async () => {
      try {
        await switchDatabase(connectionId, databaseName)
        if (!cancelled) {
          await fetchSchemas(connectionId, databaseName)
        }
      } catch {
        if (!cancelled) {
          setSwitchError(true)
          addToast({ type: 'error', title: t('explorer.toast.cannotAccessDatabase', { name: databaseName }) })
        }
      }
    })()
    return () => { cancelled = true }
  }, [isExpanded, connectionId, databaseName, switchError, schemaList.length])

  function handleToggle() {
    setSwitchError(false)
    toggleTreeNode(nodeKey)
  }

  async function handleRefresh() {
    setSwitchError(false)
    try {
      await switchDatabase(connectionId, databaseName)
      clearCache(connectionId)
      await fetchSchemas(connectionId, databaseName)
      addToast({ type: 'success', title: t('explorer.toast.refreshedDatabase', { name: databaseName }) })
    } catch {
      addToast({ type: 'error', title: t('explorer.toast.cannotAccess', { name: databaseName }) })
    }
  }

  function handleCopyName() {
    copy(databaseName, { toast: 'explorer.toast.copiedDatabaseName' })
  }

  const menuItems = [
    { label: t('explorer.menu.refresh'), onSelect: handleRefresh },
    { label: t('explorer.menu.copyDatabaseName'), onSelect: handleCopyName },
  ]

  const paddingLeft = 8 + depth * 16

  const chevron = isExpanded ? (
    <ChevronDown size={12} className="text-text-muted shrink-0" strokeWidth={1.8} />
  ) : (
    <ChevronRight size={12} className="text-text-muted shrink-0" strokeWidth={1.8} />
  )

  return (
    <ContextMenu items={menuItems}>
      <div>
        <div
          className="group flex items-center gap-1.5 h-7 rounded cursor-pointer select-none min-w-0 pr-1 hover:bg-hover"
          style={{ paddingLeft }}
          onClick={handleToggle}
        >
          {chevron}
          <Database
            size={14}
            className="text-info shrink-0"
            strokeWidth={1.8}
          />
          <span
            className="flex-1 truncate min-w-0 text-xs font-semibold text-text-primary"
          >
            {databaseName}
          </span>

          <span
            className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center"
            onClick={(e) => e.stopPropagation()}
          >
            <Tooltip content={t('explorer.tooltip.refresh')} side="top">
              <IconButton
                label={t('explorer.action.refreshDatabase')}
                size="xs"
                variant="ghost"
                className="h-5 w-5"
                onClick={handleRefresh}
              >
                <RefreshCw size={10} strokeWidth={1.8} />
              </IconButton>
            </Tooltip>
          </span>
        </div>

        {isExpanded && (
          <div>
            {switchError ? (
              <p
                className="text-xs px-3 py-1 text-error"
                style={{ paddingLeft: paddingLeft + 20 }}
              >
                {t('explorer.status.cannotAccessDatabase')}
              </p>
            ) : schemaList.length === 0 ? (
              <p
                className="text-xs px-3 py-1 text-text-muted"
                style={{ paddingLeft: paddingLeft + 20 }}
              >
                {t('explorer.loading.generic')}
              </p>
            ) : (
              schemaList.map((schemaName) => (
                <SchemaNode
                  key={schemaName}
                  schemaName={schemaName}
                  connectionId={connectionId}
                  databaseName={databaseName}
                  depth={depth + 1}
                  onExportTable={onExportTable}
                />
              ))
            )}
          </div>
        )}
      </div>
    </ContextMenu>
  )
}
