import { useState, useEffect } from 'react'
import { useUiStore, ACTIVITY_PANEL, PLUGIN_PANEL_PREFIX } from '@/stores/ui'
import { useConnectionsStore } from '@/stores/connections'
import { usePluginUIStore, selectContributions } from '@/stores/plugin-ui'
import { WidgetRenderer } from '@/components/plugin-ui/WidgetRenderer'
import { ExplorerTree } from '@/components/explorer/ExplorerTree'
import { SavedQueriesPanel } from '@/components/saved-queries/SavedQueriesPanel'
import { QueryHistoryPanel } from '@/components/query-history/QueryHistoryPanel'
import { ChartsDashboard } from '@/components/charts-panel/ChartsDashboard'
import { PluginsPanel } from '@/components/plugins/PluginsPanel'
import { ExportModal } from '@/components/export/ExportModal'
import { ImportModal } from '@/components/import/ImportModal'
import { Upload } from 'lucide-react'
import { Panel, Flex, Box, Text, ScrollArea, IconButton, Tooltip, Tabs } from '@/primitives'
import { useTranslation } from '@/i18n/I18nProvider'

export function Sidebar() {
  const { t } = useTranslation()
  const activePanel = useUiStore(s => s.activePanel)
  const activeConnectionId = useConnectionsStore(s => s.activeConnectionId)
  const connectedIds = useConnectionsStore(s => s.connectedIds)

  const [exportTable, setExportTable] = useState<string | null>(null)
  const [showImport, setShowImport] = useState(false)
  const [queryView, setQueryView] = useState<'saved' | 'history'>('saved')

  const panelContributions = usePluginUIStore(selectContributions('panels'))

  useEffect(() => {
    usePluginUIStore.getState().fetchContributions('panels')
  }, [])

  const titles: Record<string, string> = {
    [ACTIVITY_PANEL.EXPLORER]: t('shell.sidebar.explorer'),
    [ACTIVITY_PANEL.QUERY]: t('shell.sidebar.savedQueries'),
    [ACTIVITY_PANEL.CHARTS]: t('shell.sidebar.charts'),
    [ACTIVITY_PANEL.PLUGINS]: t('shell.sidebar.plugins'),
    [ACTIVITY_PANEL.SETTINGS]: t('shell.sidebar.settings'),
  }
  const pluginTitles = Object.fromEntries(
    panelContributions.map((c) => [`${PLUGIN_PANEL_PREFIX}${c.contributionId}`, c.pluginName])
  )
  const allTitles: Record<string, string> = { ...titles, ...pluginTitles }

  const isConnected = activeConnectionId && connectedIds.has(activeConnectionId)

  return (
    <Panel className="w-full h-full flex flex-col border-r border-b-0 border-t-0">
      <Flex
        align="center"
        justify="between"
        className="px-3 py-2 border-b border-border"
      >
        <Text size="xs" color="muted" className="uppercase tracking-wider">
          {allTitles[activePanel] ?? t('shell.sidebar.explorer')}
        </Text>
        {isConnected && activePanel === ACTIVITY_PANEL.EXPLORER && (
          <Tooltip content={t('shell.sidebar.importData')} side="left">
            <IconButton
              label={t('shell.sidebar.importData')}
              size="xs"
              variant="ghost"
              onClick={() => setShowImport(true)}
              className="text-text-muted hover:text-accent"
            >
              <Upload size={12} />
            </IconButton>
          </Tooltip>
        )}
      </Flex>
      <ScrollArea direction="vertical" className="flex-1">
        {activePanel === ACTIVITY_PANEL.EXPLORER && (
          <ExplorerTree onExportTable={(name) => setExportTable(name)} />
        )}
        {activePanel === ACTIVITY_PANEL.QUERY && (
          <Flex direction="column" className="h-full">
            <Tabs size="md" className="px-2" tabs={[
              { id: 'saved', label: t('shell.sidebar.saved') },
              { id: 'history', label: t('shell.sidebar.history') },
            ]} activeTab={queryView} onTabChange={(id) => setQueryView(id as 'saved' | 'history')} />
            <Box className="flex-1 min-h-0">
              {queryView === 'saved' ? <SavedQueriesPanel /> : <QueryHistoryPanel />}
            </Box>
          </Flex>
        )}
        {activePanel === ACTIVITY_PANEL.CHARTS && (
          isConnected ? <ChartsDashboard /> : (
            <Text size="xs" color="muted" as="p" className="px-3 py-8 text-center">
              {t('shell.sidebar.chartsEmpty')}
            </Text>
          )
        )}
        {activePanel === ACTIVITY_PANEL.PLUGINS && <PluginsPanel />}
        {/* Plugin-contributed panels */}
        {panelContributions
          .filter((c) => activePanel === `${PLUGIN_PANEL_PREFIX}${c.contributionId}`)
          .map((c) => (
            <Box key={c.contributionId} className="p-3 space-y-2">
              <WidgetRenderer widgets={c.widgets} pluginId={c.pluginId} />
            </Box>
          ))}
      </ScrollArea>

      {/* Modals */}
      {exportTable && activeConnectionId && (
        <ExportModal tableName={exportTable} connectionId={activeConnectionId} onClose={() => setExportTable(null)} />
      )}
      {showImport && activeConnectionId && (
        <ImportModal connectionId={activeConnectionId} onClose={() => setShowImport(false)} />
      )}
    </Panel>
  )
}
