import { useEffect } from 'react'
import { useSchemaStore } from '@/stores/schema'
import { useTabsStore } from '@/stores/tabs'
import { useConnectionsStore } from '@/stores/connections'
import { useDriverCapabilitiesStore } from '@/stores/driver-capabilities'
import { initialAutoCommit } from '@/lib/initial-autocommit'
import { usePluginContextMenuItems } from '@/components/plugin-ui/usePluginContextMenu'
import { useClipboard } from '@/hooks/useClipboard'
import { resolveDataNouns } from '@/lib/data-nouns'
import { IPC_CHANNELS } from '@shared/ipc'
import { useTranslation } from '@/i18n/I18nProvider'
import type { MenuNode } from '@/primitives/surfaces/menu/types'

export interface TableNodeActions {
  /** Whether the driver exposes a data reader (browse grid available). */
  canViewData: boolean
  openData: () => void
  openInQueryTab: () => Promise<void>
  copyTableName: () => void
  copySampleQuery: () => Promise<void>
  /** Context-menu items (view/open/copy/export + plugin contributions). */
  menuItems: MenuNode[]
}

/** Owns a table tree-node's data actions: open the browse grid, open a sample
 *  query in a new tab, copy the name / sample query, and assemble the
 *  context-menu items (including capability gating and plugin contributions). */
export function useTableNodeActions(
  connectionId: string,
  tableName: string,
  schema: string,
  onExportTable?: (tableName: string) => void
): TableNodeActions {
  const { t } = useTranslation()
  const addQueryTab = useTabsStore((s) => s.addQueryTab)
  const updateTabSql = useTabsStore((s) => s.updateTabSql)
  const { copy } = useClipboard()
  const pluginTableItems = usePluginContextMenuItems('table')
  const profile = useConnectionsStore((s) => s.connections.find(c => c.id === connectionId) ?? null)
  const openTableData = useTabsStore((s) => s.openTableData)

  // Capability-gated: any driver that provides a data reader (Redis/Mongo, and
  // the relational drivers) can render the browse grid — no db-type branching.
  const caps = useDriverCapabilitiesStore((s) => profile ? s.resolveCapabilities(connectionId, profile.type) : null)
  const canViewData = Boolean(caps?.hasGetTableData)
  const nouns = resolveDataNouns(caps?.nouns, t)
  useEffect(() => { if (profile?.type) void useDriverCapabilitiesStore.getState().fetch(profile.type) }, [profile?.type])

  const openData = () => { openTableData(connectionId, tableName, schema) }

  async function getSampleQuery(): Promise<string> {
    try {
      return await window.electronAPI.invoke(IPC_CHANNELS.DB_SAMPLE_QUERY, connectionId, tableName, schema) as string
    } catch {
      return `SELECT * FROM ${tableName} LIMIT 100;`
    }
  }

  async function openInQueryTab() {
    const query = await getSampleQuery()
    const tabId = addQueryTab(connectionId, schema, { autoCommit: initialAutoCommit(profile) })
    updateTabSql(tabId, query)
  }

  function copyTableName() {
    copy(tableName, { toast: { key: 'explorer.toast.copiedTableName', vars: { object: nouns.object.one } } })
  }

  async function copySampleQuery() {
    const query = await getSampleQuery()
    copy(query, { toast: 'explorer.toast.copiedSampleQuery' })
  }

  const menuItems: MenuNode[] = [
    ...(canViewData
      ? [{ kind: 'item' as const, id: 'view-data', label: t('explorer.menu.viewData'), onSelect: openData }]
      : []),
    {
      kind: 'item',
      id: 'open-in-query-tab',
      label: t('explorer.menu.openInQueryTab'),
      onSelect: openInQueryTab,
    },
    {
      kind: 'item',
      id: 'copy-table-name',
      label: t('explorer.menu.copyTableName', { object: nouns.object.one }),
      onSelect: copyTableName,
    },
    {
      kind: 'item',
      id: 'copy-sample-query',
      label: t('explorer.menu.copySampleQuery'),
      onSelect: copySampleQuery,
    },
    ...(onExportTable
      ? [
          {
            kind: 'item' as const,
            id: 'export-table',
            label: t('explorer.menu.exportTable', { object: nouns.object.one }),
            onSelect: () => onExportTable(tableName),
          },
        ]
      : []),
    ...pluginTableItems,
  ]

  return { canViewData, openData, openInQueryTab, copyTableName, copySampleQuery, menuItems }
}
