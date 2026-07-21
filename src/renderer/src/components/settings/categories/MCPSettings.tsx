import { useState, useEffect, useCallback } from 'react'
import { Stack, Divider, Flex, Button, Text, Input, CodeView, Switch, Alert } from '@/primitives'
import { useSettingsStore } from '@/stores/settings'
import { useClipboard } from '@/hooks/useClipboard'
import { useTranslation } from '@/i18n/I18nProvider'
import { SettingRow } from '../SettingRow'
import { PluginContributedSettings } from '../PluginContributedSettings'
import { Copy, Check, RefreshCw } from 'lucide-react'
import { IPC_CHANNELS, IPC_EVENTS } from '@shared/ipc'
import { buildMcpClientConfig, MCP_ACTIVITY_STATUS, type MCPServerStatus, type MCPToolInfo, type MCPActivityEntry } from '@shared/mcp'
import { CONFIG_KEY } from '@shared/settings'

const DEFAULT_STATUS: MCPServerStatus = { running: false, port: 3100, clients: 0, token: '', autoSelectedPort: false }

export function MCPSettings() {
  const { t } = useTranslation()
  const mcp = useSettingsStore((s) => s.settings.mcp)
  const setSetting = useSettingsStore((s) => s.set)
  const [status, setStatus] = useState<MCPServerStatus>(DEFAULT_STATUS)
  const [tools, setTools] = useState<MCPToolInfo[]>([])
  const [activity, setActivity] = useState<MCPActivityEntry[]>([])
  const { copied, copy } = useClipboard()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      setStatus(await window.electronAPI.invoke(IPC_CHANNELS.MCP_STATUS) as MCPServerStatus)
      setTools(await window.electronAPI.invoke(IPC_CHANNELS.MCP_TOOLS) as MCPToolInfo[])
      setActivity(await window.electronAPI.invoke(IPC_CHANNELS.MCP_ACTIVITY) as MCPActivityEntry[])
    } catch { /* */ }
  }, [])

  useEffect(() => {
    refresh()
    const interval = setInterval(refresh, 5000)
    const off = window.electronAPI.on(IPC_EVENTS.MCP_ACTIVITY_EVENT, (entry: unknown) => {
      setActivity(prev => [...prev.slice(-99), entry as MCPActivityEntry])
    })
    return () => { clearInterval(interval); off() }
  }, [refresh])

  const toggleServer = async () => {
    setLoading(true); setError(null)
    try {
      if (status.running) await window.electronAPI.invoke(IPC_CHANNELS.MCP_STOP)
      else await window.electronAPI.invoke(IPC_CHANNELS.MCP_START)
      await refresh()
    } catch (err) {
      // Electron IPC strips custom error props (code/port), so detect the
      // port conflict from the message text the main process throws
      // ("Port N is already in use") rather than an error code.
      const msg = (err as { message?: string }).message ?? ''
      setError(/EADDRINUSE|already in use/i.test(msg)
        ? t('settings.mcp.portInUse', { port: mcp.port })
        : (msg || t('settings.mcp.startFailed')))
    } finally { setLoading(false) }
  }

  const token = status.token || mcp.token
  const port = status.running ? status.port : mcp.port
  const configJson = JSON.stringify(buildMcpClientConfig({ port, token: token || t('settings.mcp.tokenPlaceholderConfig') }), null, 2)

  const copyConfig = () => {
    copy(JSON.stringify(buildMcpClientConfig({ port, token }), null, 2), { resetDelay: 2000 })
  }

  const regenerate = async () => {
    setStatus(await window.electronAPI.invoke(IPC_CHANNELS.MCP_REGENERATE_TOKEN) as MCPServerStatus)
    await refresh()
  }

  const setReadOnly = async (v: boolean) => {
    await setSetting(CONFIG_KEY.MCP_READ_ONLY, v)
    if (status.running) { await window.electronAPI.invoke(IPC_CHANNELS.MCP_RELOAD); await refresh() }
  }

  const setToolEnabled = async (id: string, enabled: boolean) => {
    setTools(prev => prev.map(t => t.id === id ? { ...t, enabled } : t))
    await window.electronAPI.invoke(IPC_CHANNELS.MCP_SET_TOOL_ENABLED, id, enabled)
    await refresh()
  }

  return (
    <Stack gap="md">
      <Text size="xs" color="muted">{t('settings.mcp.blurb')}</Text>

      <SettingRow label={t('settings.mcp.serverStatus.label')} description={
        status.running
          ? t('settings.mcp.serverStatus.running', { port: status.port, clients: status.clients })
          : t('settings.mcp.serverStatus.stopped')
      }>
        <Button variant={status.running ? 'outline' : 'solid'} size="sm" onClick={toggleServer} disabled={loading}>
          {loading ? t('settings.mcp.working') : status.running ? t('settings.mcp.stopServer') : t('settings.mcp.startServer')}
        </Button>
      </SettingRow>

      {status.running && status.autoSelectedPort && (
        <Text size="xs" color="muted">{t('settings.mcp.autoSelectedPort', { requested: mcp.port, actual: status.port })}</Text>
      )}
      {error && <Alert tone={'error'}>{error}</Alert>}

      <SettingRow label={t('settings.mcp.port.label')} description={t('settings.mcp.port.description')}>
        <Input type="number" value={mcp.port} onChange={(e) => setSetting('mcp.port', parseInt(e.target.value) || 3100)} size="sm" className="w-28" min={1024} max={65535} disabled={status.running} aria-label={t('settings.mcp.port.aria')} />
      </SettingRow>

      <SettingRow label={t('settings.mcp.autoPort.label')} description={t('settings.mcp.autoPort.description')}>
        <Switch checked={mcp.autoPort} onChange={(e) => setSetting('mcp.autoPort', e.target.checked)} disabled={status.running} label={t('settings.mcp.autoPort.label')} />
      </SettingRow>

      <SettingRow label={t('settings.mcp.readOnly.label')} description={t('settings.mcp.readOnly.description')}>
        <Switch checked={mcp.readOnly} onChange={(e) => setReadOnly(e.target.checked)} label={t('settings.mcp.readOnly.label')} />
      </SettingRow>

      <SettingRow label={t('settings.mcp.maxRows.label')} description={t('settings.mcp.maxRows.description')}>
        <Input type="number" value={mcp.maxRows} onChange={(e) => setSetting('mcp.maxRows', parseInt(e.target.value) || 500)} size="sm" className="w-28" min={1} max={100000} aria-label={t('settings.mcp.maxRows.aria')} />
      </SettingRow>

      <Divider />
      <Text size="sm" color="muted">{t('settings.mcp.toolsHeading')}</Text>
      <Stack gap="xs">
        {tools.map(tool => (
          <SettingRow key={tool.id} label={tool.name} description={tool.description}>
            <Switch checked={tool.enabled} onChange={(e) => setToolEnabled(tool.id, e.target.checked)} label={t('settings.mcp.enableTool', { tool: tool.name })} />
          </SettingRow>
        ))}
      </Stack>

      <Divider />
      <SettingRow label={t('settings.mcp.authToken.label')} description={t('settings.mcp.authToken.description')}>
        <Flex direction="row" align="center" gap="sm">
          <Input type="password" value={token || t('settings.mcp.authToken.placeholder')} readOnly size="sm" className="w-56 font-mono" aria-label={t('settings.mcp.authToken.aria')} />
          <Button variant="ghost" size="sm" onClick={regenerate} title={t('settings.mcp.authToken.regenerate')}><RefreshCw size={14} /></Button>
        </Flex>
      </SettingRow>

      <SettingRow label={t('settings.mcp.claudeConfig.label')} description={t('settings.mcp.claudeConfig.description')}>
        <Button variant="outline" size="sm" onClick={copyConfig}>
          {copied ? <Check size={14} className="mr-1" /> : <Copy size={14} className="mr-1" />} {t('settings.mcp.claudeConfig.copy')}
        </Button>
      </SettingRow>
      <CodeView code={configJson} language="json" />

      <Divider />
      <Text size="xs" color="muted">{t('settings.mcp.recentActivity')}</Text>
      <Stack gap="xs">
        {activity.length === 0 && <Text size="xs" color="muted">{t('settings.mcp.noActivity')}</Text>}
        {[...activity].reverse().map(a => (
          <Flex key={a.id} direction="row" align="center" gap="sm">
            <Text as="span" size="xs" color={a.status === MCP_ACTIVITY_STATUS.OK ? 'success' : a.status === MCP_ACTIVITY_STATUS.REJECTED ? 'warning' : 'error'}>●</Text>
            <Text size="xs" className="font-mono">{a.toolId}</Text>
            <Text size="xs" color="muted" truncate>{a.paramsSummary}</Text>
            <Text size="xs" color="muted">{a.durationMs}ms</Text>
          </Flex>
        ))}
      </Stack>

      <PluginContributedSettings category="mcp" />
    </Stack>
  )
}
