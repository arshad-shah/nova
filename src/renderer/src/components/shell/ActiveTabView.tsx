import { Box } from '@/primitives'
import { SectionErrorBoundary } from './SectionErrorBoundary'
import { WelcomeScreen } from './WelcomeScreen'
import { QueryPanel } from '@/components/query/QueryPanel'
import { TableDataView } from '@/components/table/TableDataView'
import { ERDiagram } from '@/components/er/ERDiagram.lazy'
import { ConnectionFormView } from '@/components/connections/ConnectionFormView'
import { PluginDetailView } from '@/components/plugins/PluginDetailView'
import { InstallPluginTab } from '@/components/plugins/InstallPluginTab'
import { SettingsLayout } from '@/components/settings/SettingsLayout'
import { WelcomeView } from '@/components/welcome/WelcomeView'
import { ReleaseNotesView } from '@/components/release-notes/ReleaseNotesView'
import type { QueryTab, TableTab, ErDiagramTab, ConnectionFormTab, PluginDetailTab, ReleaseNotesTab } from '@shared/types'
import type { useTabsStore } from '@/stores/tabs'
import { useTranslation } from '@/i18n/I18nProvider'

type AppTab = ReturnType<typeof useTabsStore.getState>['tabs'][number]

/** Renders the content for the active tab, dispatched by its discriminated
 *  `type`, or the welcome screen when no tab is open. Each branch is wrapped
 *  in a section error boundary keyed to the tab so a crash is isolated. */
export function ActiveTabView({ activeTab, activeTabId }: { activeTab: AppTab | undefined; activeTabId: string | null }) {
  const { t } = useTranslation()
  return (
    <Box
      className="flex-1 overflow-hidden"
      {...(activeTab ? { role: 'tabpanel', 'aria-labelledby': `tab-${activeTab.id}` } : {})}
    >
      <SectionErrorBoundary label={activeTab?.title ?? t('shell.sectionLabels.tab')} resetKey={activeTabId}>
        {activeTab?.type === 'query' && (
          <QueryPanel tab={activeTab as QueryTab} />
        )}
        {activeTab?.type === 'table' && (
          <TableDataView tab={activeTab as TableTab} />
        )}
        {activeTab?.type === 'er-diagram' && (
          <ERDiagram
            connectionId={(activeTab as ErDiagramTab).connectionId}
            schema={(activeTab as ErDiagramTab).schema}
          />
        )}
        {activeTab?.type === 'connection-form' && (
          <ConnectionFormView
            tabId={activeTab.id}
            editingId={(activeTab as ConnectionFormTab).editingId}
          />
        )}
        {activeTab?.type === 'plugin-detail' && (
          <PluginDetailView
            pluginName={(activeTab as PluginDetailTab).pluginName}
          />
        )}
        {activeTab?.type === 'install-plugin' && (
          <InstallPluginTab />
        )}
        {activeTab?.type === 'settings' && (
          <SettingsLayout />
        )}
        {activeTab?.type === 'welcome' && (
          <WelcomeView />
        )}
        {activeTab?.type === 'release-notes' && (
          <ReleaseNotesView version={(activeTab as ReleaseNotesTab).version} />
        )}
      </SectionErrorBoundary>
      {!activeTab && (
        <SectionErrorBoundary label={t('shell.sectionLabels.welcome')}>
          <WelcomeScreen />
        </SectionErrorBoundary>
      )}
    </Box>
  )
}
