import { useEffect, useState } from 'react'
import { Database, PenSquare, BarChart3, Puzzle, Settings, Radio } from 'lucide-react'
import { useUiStore, ACTIVITY_PANEL, PLUGIN_PANEL_PREFIX, type ActivityPanel } from '@/stores/ui'
import { useTabsStore } from '@/stores/tabs'
import { SETTINGS_CATEGORY } from '@/lib/settings-categories'
import { usePluginUIStore, selectContributions } from '@/stores/plugin-ui'
import { Stack, Spacer, Tooltip, IconButton, cn } from '@/primitives'
import { PluginSlot } from '@/components/plugins/PluginSlot'
import { IPC_CHANNELS } from '@shared/ipc'
import type { MCPServerStatus } from '@shared/mcp'
import { useTranslation } from '@/i18n/I18nProvider'
import type { MessageKey } from '@shared/i18n'
import { ipc } from '@/platform/client'

const topItems: { id: ActivityPanel; icon: typeof Database; labelKey: MessageKey }[] = [
  { id: ACTIVITY_PANEL.EXPLORER, icon: Database, labelKey: 'shell.activityBar.explorer' },
  { id: ACTIVITY_PANEL.QUERY, icon: PenSquare, labelKey: 'shell.activityBar.savedQueries' },
  { id: ACTIVITY_PANEL.CHARTS, icon: BarChart3, labelKey: 'shell.activityBar.charts' },
  { id: ACTIVITY_PANEL.PLUGINS, icon: Puzzle, labelKey: 'shell.activityBar.plugins' }
]

export function ActivityBar() {
  const { t } = useTranslation()
  const { activePanel, sidebarVisible, setActivePanel } = useUiStore()
  const openSettings = useTabsStore((s) => s.openSettings)
  const activeTabType = useTabsStore((s) => s.tabs.find((t) => t.id === s.activeTabId)?.type)
  const activityBarContributions = usePluginUIStore(selectContributions('activityBar'))
  const [mcpRunning, setMcpRunning] = useState(false)
  const [mcpClients, setMcpClients] = useState(0)

  useEffect(() => {
    usePluginUIStore.getState().fetchContributions('activityBar')
  }, [])

  // Poll MCP server status
  useEffect(() => {
    const checkMcp = async () => {
      try {
        const status = await ipc.invoke(IPC_CHANNELS.MCP_STATUS) as MCPServerStatus
        setMcpRunning(status.running)
        setMcpClients(status.clients)
      } catch { /* */ }
    }
    checkMcp()
    const interval = setInterval(checkMcp, 10000)
    return () => clearInterval(interval)
  }, [])

  const renderButton = (id: ActivityPanel, Icon: typeof Database, label: string) => {
    const isActive = activePanel === id && sidebarVisible
    return (
      <Tooltip key={id} content={label} side="right">
        <IconButton
          label={label}
          size="lg"
          variant="nav"
          active={isActive}
          onClick={() => setActivePanel(id)}
          className={cn(
            'relative rounded-lg',
            // The rail indicator is one of the surfaces the brand gradient
            // is reserved for.
            isActive &&
              'before:absolute before:left-0 before:top-1.5 before:bottom-1.5 before:w-0.5 before:rounded-full before:bg-[image:var(--vq-gradient)]'
          )}
        >
          <Icon size={20} strokeWidth={1.8} />
        </IconButton>
      </Tooltip>
    )
  }

  return (
    <Stack
      align="center"
      gap="xs"
      className="w-12 bg-bg-primary border-r border-border shrink-0 pt-2"
    >
      {topItems.map(({ id, icon, labelKey }) => renderButton(id, icon, t(labelKey)))}
      {activityBarContributions
        .filter((c) => c.meta.zone === 'top' || !c.meta.zone)
        .map((c) => renderButton(
          `${PLUGIN_PANEL_PREFIX}${c.contributionId}` as ActivityPanel,
          Puzzle,
          c.meta.title as string
        ))}
      <PluginSlot id="app.activityBar.top" />
      <Spacer />
      <PluginSlot id="app.activityBar.bottom" />
      {mcpRunning && (
        <Tooltip content={t('shell.activityBar.mcpServerStatus', { count: mcpClients })} side="right">
          <IconButton
            label={t('shell.activityBar.mcpServer')}
            size="lg"
            variant="ghost"
            onClick={() => openSettings(SETTINGS_CATEGORY.MCP)}
            className="rounded-lg transition-colors text-agent-accent hover:text-agent-accent hover:bg-hover"
          >
            <Radio size={18} />
          </IconButton>
        </Tooltip>
      )}
      <Tooltip content={t('shell.activityBar.settings')} side="right">
        <IconButton
          label={t('shell.activityBar.settings')}
          size="lg"
          variant="nav"
          active={activeTabType === 'settings'}
          onClick={() => openSettings()}
          className="rounded-lg"
        >
          <Settings size={20} />
        </IconButton>
      </Tooltip>
    </Stack>
  )
}
