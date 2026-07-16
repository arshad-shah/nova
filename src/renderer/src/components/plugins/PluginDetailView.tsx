import { useEffect, useState } from 'react'
import { Power, PowerOff, Trash2 } from 'lucide-react'
import { ConfirmDialog } from '@/components/shell/ConfirmDialog'
import { PluginIcon } from './PluginIcon'
import { useToastStore } from '@/stores/toast'
import { usePluginUIStore } from '@/stores/plugin-ui'
import { useTranslation } from '@/i18n/I18nProvider'
import { Flex, Text, Button, Badge, Box, ScrollArea, Tabs } from '@/primitives'
import { IPC_CHANNELS } from '@shared/ipc'
import { STATE_CONFIG, DETAIL_TAB_IDS } from './plugin-detail/constants'
import type { PluginInfo, PermissionState, ErrorRecord, SettingSchema } from './plugin-detail/types'
import { OverviewTab } from './plugin-detail/OverviewTab'
import { ContributionsTab } from './plugin-detail/ContributionsTab'
import { PermissionsTab } from './plugin-detail/PermissionsTab'
import { ErrorsTab } from './plugin-detail/ErrorsTab'
import { SettingsTab } from './plugin-detail/SettingsTab'

interface Props {
  pluginName: string
}

export function PluginDetailView({ pluginName }: Props) {
  const { t } = useTranslation()
  const [plugin, setPlugin] = useState<PluginInfo | null>(null)
  const [activeTab, setActiveTab] = useState('overview')
  const [errors, setErrors] = useState<ErrorRecord[]>([])
  const [expandedError, setExpandedError] = useState<number | null>(null)
  const [showUninstallConfirm, setShowUninstallConfirm] = useState(false)
  const [settingsSchema, setSettingsSchema] = useState<SettingSchema[]>([])
  const [settingsValues, setSettingsValues] = useState<Record<string, unknown>>({})
  const [permissions, setPermissions] = useState<PermissionState | null>(null)
  const addToast = useToastStore(s => s.addToast)

  const loadPlugin = async () => {
    const list: PluginInfo[] = await window.electronAPI.invoke(IPC_CHANNELS.PLUGINS_LIST)
    const found = list.find(p => p.name === pluginName)
    if (found) setPlugin(found)
  }

  useEffect(() => { loadPlugin() }, [pluginName])

  useEffect(() => {
    window.electronAPI.invoke(IPC_CHANNELS.PLUGINS_ERRORS, pluginName)
      .then(setErrors)
      .catch(() => {})
  }, [pluginName])

  useEffect(() => {
    window.electronAPI.invoke(IPC_CHANNELS.PLUGINS_GET_SETTINGS, pluginName)
      .then(({ schema, values }: { schema: SettingSchema[]; values: Record<string, unknown> }) => {
        setSettingsSchema(schema)
        setSettingsValues(values)
      })
      .catch(() => {})
  }, [pluginName])

  useEffect(() => {
    window.electronAPI.invoke(IPC_CHANNELS.PLUGINS_GET_PERMISSIONS, pluginName)
      .then((state: PermissionState | null) => setPermissions(state))
      .catch(() => {})
  }, [pluginName])

  const handleTogglePermission = async (permission: string, granted: boolean) => {
    if (!permissions) return
    const next = granted
      ? [...new Set([...permissions.granted, permission])]
      : permissions.granted.filter(p => p !== permission)
    const result = await window.electronAPI.invoke(IPC_CHANNELS.PLUGINS_SET_PERMISSIONS, pluginName, next)
    setPermissions({ ...permissions, granted: result.granted })
    if (isActive) {
      addToast({
        type: 'info',
        title: t('plugins.detail.toast.reEnableTitle'),
        message: t('plugins.detail.toast.reEnableMessage'),
      })
    }
  }

  const handleActivate = async () => {
    const result = await window.electronAPI.invoke(IPC_CHANNELS.PLUGINS_ACTIVATE, pluginName)
    if (!result.success) addToast({ type: 'error', title: t('plugins.detail.toast.activateFailed'), message: result.error })
    // Force immediate UI refresh
    const uiStore = usePluginUIStore.getState()
    uiStore.invalidateAll()
    await Promise.all([
      uiStore.fetchContributions('statusBar'),
      uiStore.fetchContributions('activityBar'),
      uiStore.fetchContributions('panels'),
      uiStore.fetchContributions('contextMenu'),
    ])
    await loadPlugin()
  }

  const handleDeactivate = async () => {
    await window.electronAPI.invoke(IPC_CHANNELS.PLUGINS_DEACTIVATE, pluginName)
    // Force immediate UI cleanup — don't wait for debounced event
    const uiStore = usePluginUIStore.getState()
    uiStore.invalidateAll()
    await Promise.all([
      uiStore.fetchContributions('statusBar'),
      uiStore.fetchContributions('activityBar'),
      uiStore.fetchContributions('panels'),
      uiStore.fetchContributions('contextMenu'),
    ])
    await loadPlugin()
  }

  const handleUninstall = async () => {
    setShowUninstallConfirm(false)
    await window.electronAPI.invoke(IPC_CHANNELS.PLUGINS_UNINSTALL, pluginName)
  }

  const handleSettingChange = async (key: string, value: unknown) => {
    setSettingsValues(prev => ({ ...prev, [key]: value }))
    await window.electronAPI.invoke(IPC_CHANNELS.PLUGINS_SET_SETTING, pluginName, key, value)
  }

  if (!plugin) {
    return (
      <Flex align="center" justify="center" className="h-full">
        <Text color="muted">{t('plugins.detail.loading')}</Text>
      </Flex>
    )
  }

  const stateConfig = STATE_CONFIG[plugin.status.state] ?? STATE_CONFIG.inactive
  const isActive = plugin.status.state === 'active' || plugin.status.state === 'degraded'

  return (
    <Flex direction="column" className="h-full bg-bg-primary">
      {/* Compact Header */}
      <Box className="px-6 py-5 border-b border-border-default shrink-0">
        <Flex direction="row" align="center" gap="md">
          <PluginIcon plugin={plugin} size="lg" />
          <Box className="flex-1 min-w-0">
            <Flex direction="row" align="center" gap="sm" className="flex-wrap">
              <Text size="lg" weight="semibold" color="primary">{plugin.displayName}</Text>
              <Text size="xs" color="muted">{t('plugins.detail.version', { version: plugin.version })}</Text>
              <Badge size="sm" tone={stateConfig.variant}>{t(stateConfig.labelKey)}</Badge>
              {plugin.bundled && <Badge size="sm">{t('plugins.detail.builtIn')}</Badge>}
            </Flex>
            <Text size="sm" color="secondary" as="p" className="mt-1 leading-relaxed">{plugin.description}</Text>
          </Box>
          <Flex direction="row" gap="sm" className="shrink-0">
            {isActive ? (
              <Button variant="outline" size="sm" onClick={handleDeactivate} className="flex items-center gap-1.5">
                <PowerOff size={14} /> {t('plugins.detail.disable')}
              </Button>
            ) : (
              <Button variant="solid" size="sm" onClick={handleActivate} className="flex items-center gap-1.5">
                <Power size={14} /> {t('plugins.detail.enable')}
              </Button>
            )}
            {!plugin.bundled && (
              <Button variant="outline" size="sm" onClick={() => setShowUninstallConfirm(true)} className="flex items-center gap-1.5 hover:text-error hover:border-error/30">
                <Trash2 size={14} /> {t('plugins.detail.uninstall')}
              </Button>
            )}
          </Flex>
        </Flex>
      </Box>

      {/* Sub-Tabs */}
      <Tabs
        tabs={DETAIL_TAB_IDS.map((id) => ({ id, label: t(`plugins.detail.tabs.${id}`) }))}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        className="px-6 shrink-0"
      />

      {/* Tab Content */}
      <ScrollArea direction="vertical" className="flex-1">
        <Box className="px-6 py-5">
          {activeTab === 'overview' && (
            <OverviewTab plugin={plugin} stateConfig={stateConfig} errors={errors} />
          )}
          {activeTab === 'permissions' && (
            <PermissionsTab permissions={permissions} onToggle={handleTogglePermission} />
          )}
          {activeTab === 'contributions' && (
            <ContributionsTab contributions={plugin.contributions} />
          )}
          {activeTab === 'errors' && (
            <ErrorsTab errors={errors} expandedError={expandedError} onToggleError={setExpandedError} />
          )}
          {activeTab === 'settings' && (
            <SettingsTab schema={settingsSchema} values={settingsValues} onChange={handleSettingChange} />
          )}
        </Box>
      </ScrollArea>

      <ConfirmDialog
        open={showUninstallConfirm}
        title={t('plugins.detail.uninstallConfirm.title', { name: plugin.displayName })}
        message={t('plugins.detail.uninstallConfirm.message')}
        confirmLabel={t('plugins.detail.uninstallConfirm.confirm')}
        variant="danger"
        onConfirm={handleUninstall}
        onCancel={() => setShowUninstallConfirm(false)}
      />
    </Flex>
  )
}
