import { useCallback, useState } from 'react'
import { useAsyncEffect } from '@/hooks/useAsyncEffect'
import { Power, PowerOff, Trash2 } from 'lucide-react'
import { ConfirmDialog } from '@/components/shell/ConfirmDialog'
import { PluginIcon } from './PluginIcon'
import { useToastStore } from '@/stores/toast'
import { usePluginUIStore } from '@/stores/plugin-ui'
import { useTranslation } from '@/i18n/I18nProvider'
import { Flex, Text, Button, Badge, Box, ScrollArea, Tabs } from '@/primitives'
import { IPC_CHANNELS } from '@shared/ipc'
import { STATE_CONFIG, DETAIL_TAB, DETAIL_TAB_IDS, type DetailTabId } from './plugin-detail/constants'
import type { PluginInfo, PermissionState, ErrorRecord, SettingSchema } from './plugin-detail/types'
import { OverviewTab } from './plugin-detail/OverviewTab'
import { ContributionsTab } from './plugin-detail/ContributionsTab'
import { PermissionsTab } from './plugin-detail/PermissionsTab'
import { ErrorsTab } from './plugin-detail/ErrorsTab'
import { SettingsTab } from './plugin-detail/SettingsTab'
import { ipc } from '@/platform/client'

interface Props {
  pluginName: string
}

export function PluginDetailView({ pluginName }: Props) {
  const { t } = useTranslation()
  const [plugin, setPlugin] = useState<PluginInfo | null>(null)
  const [activeTab, setActiveTab] = useState<DetailTabId>(DETAIL_TAB.OVERVIEW)
  const [errors, setErrors] = useState<ErrorRecord[]>([])
  const [expandedError, setExpandedError] = useState<number | null>(null)
  const [showUninstallConfirm, setShowUninstallConfirm] = useState(false)
  const [settingsSchema, setSettingsSchema] = useState<SettingSchema[]>([])
  const [settingsValues, setSettingsValues] = useState<Record<string, unknown>>({})
  const [permissions, setPermissions] = useState<PermissionState | null>(null)
  const addToast = useToastStore(s => s.addToast)

  // Shared by the mount effect and the activate/deactivate handlers. The effect
  // passes an `isCancelled` probe so a list that resolves after the viewer has
  // navigated to a different plugin is dropped; handler calls omit it (the
  // component is still mounted on the same plugin) and always apply.
  const loadPlugin = useCallback(async (isCancelled?: () => boolean) => {
    const list: PluginInfo[] = await ipc.invoke(IPC_CHANNELS.PLUGINS_LIST)
    const found = list.find(p => p.name === pluginName)
    if (found && !isCancelled?.()) setPlugin(found)
  }, [pluginName])

  useAsyncEffect((isCancelled) => loadPlugin(isCancelled), [loadPlugin])

  useAsyncEffect(async (isCancelled) => {
    try {
      const errors = await ipc.invoke(IPC_CHANNELS.PLUGINS_ERRORS, pluginName)
      if (!isCancelled()) setErrors(errors)
    } catch { /* best-effort */ }
  }, [pluginName])

  useAsyncEffect(async (isCancelled) => {
    try {
      const { schema, values }: { schema: SettingSchema[]; values: Record<string, unknown> } =
        await ipc.invoke(IPC_CHANNELS.PLUGINS_GET_SETTINGS, pluginName)
      if (isCancelled()) return
      setSettingsSchema(schema)
      setSettingsValues(values)
    } catch { /* best-effort */ }
  }, [pluginName])

  useAsyncEffect(async (isCancelled) => {
    try {
      const state: PermissionState | null = await ipc.invoke(IPC_CHANNELS.PLUGINS_GET_PERMISSIONS, pluginName)
      if (!isCancelled()) setPermissions(state)
    } catch { /* best-effort */ }
  }, [pluginName])

  const handleTogglePermission = async (permission: string, granted: boolean) => {
    if (!permissions) return
    const next = granted
      ? [...new Set([...permissions.granted, permission])]
      : permissions.granted.filter(p => p !== permission)
    const result = await ipc.invoke(IPC_CHANNELS.PLUGINS_SET_PERMISSIONS, pluginName, next)
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
    const result = await ipc.invoke(IPC_CHANNELS.PLUGINS_ACTIVATE, pluginName)
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
    await ipc.invoke(IPC_CHANNELS.PLUGINS_DEACTIVATE, pluginName)
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
    await ipc.invoke(IPC_CHANNELS.PLUGINS_UNINSTALL, pluginName)
  }

  const handleSettingChange = async (key: string, value: unknown) => {
    setSettingsValues(prev => ({ ...prev, [key]: value }))
    await ipc.invoke(IPC_CHANNELS.PLUGINS_SET_SETTING, pluginName, key, value)
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
        onTabChange={(id) => setActiveTab(id as DetailTabId)}
        className="px-6 shrink-0"
      />

      {/* Tab Content */}
      <ScrollArea direction="vertical" className="flex-1">
        <Box className="px-6 py-5">
          {activeTab === DETAIL_TAB.OVERVIEW && (
            <OverviewTab plugin={plugin} stateConfig={stateConfig} errors={errors} />
          )}
          {activeTab === DETAIL_TAB.PERMISSIONS && (
            <PermissionsTab permissions={permissions} onToggle={handleTogglePermission} />
          )}
          {activeTab === DETAIL_TAB.CONTRIBUTIONS && (
            <ContributionsTab contributions={plugin.contributions} />
          )}
          {activeTab === DETAIL_TAB.ERRORS && (
            <ErrorsTab errors={errors} expandedError={expandedError} onToggleError={setExpandedError} />
          )}
          {activeTab === DETAIL_TAB.SETTINGS && (
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
