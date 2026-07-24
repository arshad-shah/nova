import { useEffect } from 'react'
import { Flex, Box, Text } from '@/primitives'
import { useUiStore, BOTTOM_PANEL, PLUGIN_PANEL_PREFIX, type BottomPanelId } from '@/stores/ui'
import { useTabsStore } from '@/stores/tabs'
import { useConnectionsStore } from '@/stores/connections'
import { usePluginUIStore, selectContributions } from '@/stores/plugin-ui'
import { ResultsPanel } from '@/components/results/ResultsPanel'
import { QueryErrorView } from '@/components/results/QueryErrorView'
import { QueryPlanView } from '@/components/query-plan/QueryPlanView'
// (plan parsing now lives in the driver via db:parse-plan; tab.queryPlan holds it)
import { ChartPanel } from '@/components/charts/ChartPanel.lazy'
import { PluginPanelMount } from '@/components/plugins/PluginPanelMount'
import { BottomDockTabs, type BottomTab } from './BottomDockTabs'
import type { QueryTab } from '@shared/types'
import { useTranslation } from '@/i18n/I18nProvider'

export function useHasBottomPanels(): boolean {
  const activeTab = useTabsStore(s => s.tabs.find(t => t.id === s.activeTabId))
  const panelContributions = usePluginUIStore(selectContributions('panels'))
  const fetchContributions = usePluginUIStore(s => s.fetchContributions)
  useEffect(() => { fetchContributions('panels') }, [fetchContributions])
  const showResults = activeTab?.type === 'query'
  const hasBottomPlugins = panelContributions.some(c => c.meta.location === 'bottom')
  return showResults || hasBottomPlugins
}

export function BottomDock() {
  const { t } = useTranslation()
  const activeTab = useTabsStore(s => s.tabs.find(tab => tab.id === s.activeTabId))
  const connections = useConnectionsStore(s => s.connections)
  const bottomActivePanel = useUiStore(s => s.bottomDockActivePanel)
  const setBottomActivePanel = useUiStore(s => s.setBottomDockActivePanel)
  const toggleBottomDock = useUiStore(s => s.toggleBottomDock)
  const panelContributions = usePluginUIStore(selectContributions('panels'))
  const fetchContributions = usePluginUIStore(s => s.fetchContributions)

  useEffect(() => { fetchContributions('panels') }, [fetchContributions])

  const showResults = activeTab?.type === 'query'

  // Detect whether the current results parse as an execution plan. We only
  // surface the "Query Plan" tab when there's something to show — otherwise
  // every query run would leave a permanent dead tab next to Results. The
  // parser already handles both Postgres JSON plans and plain-text plans
  // and returns [] for non-plan rows, so this also doubles as the "do we
  // even have a plan to render" check inside the tab body below.
  // The driver parses EXPLAIN output into tab.queryPlan (db:parse-plan); we only
  // surface the "Query Plan" tab when there's a parsed plan to show.
  const queryPlan = showResults ? ((activeTab as QueryTab).queryPlan ?? []) : []
  const hasPlan = queryPlan.length > 0

  // The Chart tab is meaningful any time results have at least two columns —
  // ChartPanel needs an X and a Y axis. Single-column scalar results (e.g.
  // `SELECT COUNT(*)`) can't be charted, so we hide the tab rather than
  // surface a permanent empty-state.
  const resultsForChart = showResults ? (activeTab as QueryTab).results : null
  const hasChart = Boolean(resultsForChart && resultsForChart.fields.length >= 2 && resultsForChart.rows.length > 0)

  const bottomPluginPanels: BottomTab[] = panelContributions
    .filter(c => c.meta.location === 'bottom')
    .map(c => ({ id: `${PLUGIN_PANEL_PREFIX}${c.contributionId}`, title: (c.meta.title as string) ?? c.contributionId }))

  const tabs: BottomTab[] = [
    ...(showResults ? [{ id: BOTTOM_PANEL.RESULTS, title: t('shell.bottomDock.results') }] : []),
    ...(hasChart ? [{ id: BOTTOM_PANEL.CHART, title: t('shell.bottomDock.chart') }] : []),
    ...(hasPlan ? [{ id: BOTTOM_PANEL.QUERY_PLAN, title: t('shell.bottomDock.queryPlan') }] : []),
    ...bottomPluginPanels,
  ]

  useEffect(() => {
    if (tabs.length === 0) return
    if (!tabs.find(tab => tab.id === bottomActivePanel)) {
      setBottomActivePanel(tabs[0].id as BottomPanelId)
    }
  }, [tabs, bottomActivePanel, setBottomActivePanel])

  if (tabs.length === 0) {
    return null
  }

  const renderBody = () => {
    if (bottomActivePanel === BOTTOM_PANEL.RESULTS && showResults && activeTab) {
      const qt = activeTab as QueryTab
      if (qt.results) {
        return <ResultsPanel results={qt.results} sql={qt.sql} tabId={qt.id} aiExplanation={qt.aiExplanation} />
      }
      if (qt.error) {
        const dbType = connections.find(c => c.id === qt.connectionId)?.type
        return <QueryErrorView error={qt.error} dbType={dbType} />
      }
      return (
        <Flex align="center" justify="center" className="h-full">
          <Text color="muted" size="sm">{t('shell.bottomDock.runToSeeResults')}</Text>
        </Flex>
      )
    }
    if (bottomActivePanel === BOTTOM_PANEL.QUERY_PLAN && hasPlan && activeTab) {
      return <QueryPlanView plan={(activeTab as QueryTab).queryPlan ?? []} />
    }
    if (bottomActivePanel === BOTTOM_PANEL.CHART && hasChart && resultsForChart) {
      return <ChartPanel results={resultsForChart} />
    }
    if (bottomActivePanel.startsWith(PLUGIN_PANEL_PREFIX)) {
      const contributionId = bottomActivePanel.slice(PLUGIN_PANEL_PREFIX.length)
      const contribution = panelContributions.find(c => c.contributionId === contributionId)
      const hostWidget = contribution?.widgets.find(w => w.type === 'host-component') as { type: 'host-component'; componentId: string } | undefined
      const componentId = hostWidget?.componentId ?? contributionId
      return <PluginPanelMount surface="panels" componentId={componentId} />
    }
    return null
  }

  return (
    <Flex direction="column" className="h-full bg-bg-primary overflow-hidden">
      <BottomDockTabs
        tabs={tabs}
        activeId={bottomActivePanel}
        onSelect={(id) => setBottomActivePanel(id as BottomPanelId)}
        onClose={toggleBottomDock}
      />
      <Box className="flex-1 overflow-hidden">
        {renderBody()}
      </Box>
    </Flex>
  )
}
