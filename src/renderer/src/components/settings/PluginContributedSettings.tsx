import { useCallback, useEffect, useState } from 'react'
import { Box, Divider, Stack, Text, Input, NumberInput, PasswordInput, Select, Switch } from '@/primitives'
import { useIsMounted } from '@/hooks/useIsMounted'
import { useTranslation } from '@/i18n/I18nProvider'
import { SettingRow } from './SettingRow'
import { IPC_CHANNELS, IPC_EVENTS } from '@shared/ipc'
import { ipc } from '@/platform/client'

interface PluginSettingSchema {
  key: string
  title: string
  type: 'text' | 'password' | 'number' | 'boolean' | 'select'
  default?: string | number | boolean
  description?: string
  min?: number
  max?: number
  step?: number
  options?: { value: string; label: string }[]
}

interface PluginContribution {
  pluginName: string
  pluginDisplayName: string
  schema: PluginSettingSchema[]
  values: Record<string, unknown>
}

interface Props {
  category: string
}

/**
 * Renders plugin-contributed settings that target a core category. Refreshes
 * when plugins are activated/deactivated/uninstalled so disabled plugins
 * disappear from the host's Settings UI without a restart.
 */
export function PluginContributedSettings({ category }: Props) {
  const { t } = useTranslation()
  const [contributions, setContributions] = useState<PluginContribution[]>([])
  const isMounted = useIsMounted()

  // Re-run on plugin lifecycle events, which can fire after this pane unmounts.
  const reload = useCallback(async () => {
    try {
      const result = await ipc.invoke(IPC_CHANNELS.PLUGINS_GET_CATEGORIZED_SETTINGS, category)
      if (isMounted()) setContributions(result)
    } catch {
      if (isMounted()) setContributions([])
    }
  }, [category, isMounted])

  useEffect(() => {
    reload()
    const offLifecycle = ipc.on(IPC_EVENTS.PLUGINS_LIFECYCLE, reload)
    return () => offLifecycle?.()
  }, [reload])

  const updateValue = async (pluginName: string, key: string, value: unknown) => {
    await ipc.invoke(IPC_CHANNELS.PLUGINS_SET_SETTING, pluginName, key, value)
    setContributions((prev) =>
      prev.map((c) =>
        c.pluginName === pluginName ? { ...c, values: { ...c.values, [key]: value } } : c
      )
    )
  }

  if (contributions.length === 0) return null

  return (
    <Stack gap="md">
      {contributions.map((c) => (
        <Box key={c.pluginName}>
          <Divider />
          <Box className="py-3">
            <Text size="xs" color="muted" weight="bold" className="uppercase tracking-wider">
              {t('settings.contributed.from', { plugin: c.pluginDisplayName })}
            </Text>
          </Box>
          {c.schema.map((s) => (
            <SettingRow key={s.key} label={s.title} description={s.description ?? ''}>
              <Control
                schema={s}
                value={c.values[s.key]}
                onChange={(v) => updateValue(c.pluginName, s.key, v)}
              />
            </SettingRow>
          ))}
        </Box>
      ))}
    </Stack>
  )
}

function Control({
  schema,
  value,
  onChange
}: {
  schema: PluginSettingSchema
  value: unknown
  onChange: (value: unknown) => void
}) {
  switch (schema.type) {
    case 'boolean':
      return (
        <Switch
          label={schema.title}
          checked={Boolean(value)}
          onChange={(e) => onChange(e.target.checked)}
        />
      )
    case 'password':
      return (
        <PasswordInput
          size="sm"
          className="w-64"
          value={String(value ?? '')}
          onChange={(e) => onChange(e.target.value)}
        />
      )
    case 'number':
      return (
        <NumberInput
          size="sm"
          className="w-28"
          value={Number(value ?? schema.default ?? 0)}
          min={schema.min}
          max={schema.max}
          step={schema.step ?? 1}
          onChange={(v) => onChange(v)}
        />
      )
    case 'select':
      return (
        <Select
          size="sm"
          className="w-48"
          value={String(value ?? schema.default ?? '')}
          options={schema.options ?? []}
          onChange={(v) => onChange(v)}
        />
      )
    default:
      return (
        <Input
          size="sm"
          className="w-64"
          value={String(value ?? '')}
          onChange={(e) => onChange(e.target.value)}
        />
      )
  }
}
