import { useEffect, useState } from 'react'
import { Stack, Divider, Flex, Button, Text } from '@/primitives'
import { Input } from '@/primitives'
import { useSettingsStore } from '@/stores/settings'
import { useTranslation } from '@/i18n/I18nProvider'
import { SettingRow } from '../SettingRow'
import { PluginContributedSettings } from '../PluginContributedSettings'
import { IPC_CHANNELS } from '@shared/ipc'
import { ipc } from '@/platform/client'

type Provider = 'openai' | 'anthropic'

function ApiKeyField({ provider, label, description, placeholder }: {
  provider: Provider
  label: string
  description: string
  placeholder: string
}) {
  const { t } = useTranslation()
  const [hasKey, setHasKey] = useState(false)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    ipc.invoke(IPC_CHANNELS.AI_KEYS_HAS, provider).then(setHasKey).catch(() => {})
  }, [provider])

  const save = async () => {
    setSaving(true)
    try {
      await ipc.invoke(IPC_CHANNELS.AI_KEYS_SET, provider, draft)
      setHasKey(Boolean(draft))
      setDraft('')
    } finally {
      setSaving(false)
    }
  }

  const clear = async () => {
    await ipc.invoke(IPC_CHANNELS.AI_KEYS_SET, provider, '')
    setHasKey(false)
    setDraft('')
  }

  return (
    <SettingRow label={label} description={description}>
      <Flex gap="xs" align="center">
        <Input
          type="password"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          size="sm"
          className="w-72"
          placeholder={hasKey ? t('settings.ai.apiKeySavedPlaceholder') : placeholder}
          autoComplete="off"
          spellCheck={false}
          aria-label={t('settings.ai.apiKeyInputAria', { label })}
        />
        <Button size="sm" onClick={save} disabled={!draft || saving}>
          {hasKey ? t('settings.ai.replace') : t('common.save')}
        </Button>
        {hasKey && (
          <Button size="sm" variant="outline" onClick={clear}>{t('settings.ai.clear')}</Button>
        )}
      </Flex>
    </SettingRow>
  )
}

export function AISettings() {
  const { t } = useTranslation()
  const ai = useSettingsStore((s) => s.settings.ai ?? { openaiKey: '', anthropicKey: '', ollamaEndpoint: '' })
  const setSetting = useSettingsStore((s) => s.set)
  const resetCategory = useSettingsStore((s) => s.resetCategory)

  return (
    <Stack gap="md">
      <Text size="xs" color="muted">{t('settings.ai.blurb')}</Text>

      <ApiKeyField
        provider="openai"
        label={t('settings.ai.openaiKey.label')}
        description={t('settings.ai.openaiKey.description')}
        placeholder="sk-..."
      />

      <ApiKeyField
        provider="anthropic"
        label={t('settings.ai.anthropicKey.label')}
        description={t('settings.ai.anthropicKey.description')}
        placeholder="sk-ant-..."
      />

      <Divider />

      <SettingRow label={t('settings.ai.ollamaEndpoint.label')} description={t('settings.ai.ollamaEndpoint.description')}>
        <Input
          value={ai.ollamaEndpoint}
          onChange={(e) => setSetting('ai.ollamaEndpoint', e.target.value)}
          size="sm"
          className="w-72"
          placeholder="http://localhost:11434"
          aria-label={t('settings.ai.ollamaEndpoint.aria')}
        />
      </SettingRow>

      <PluginContributedSettings category="ai" />

      <Divider />

      <Flex justify="end">
        <Button variant="outline" size="sm" onClick={() => resetCategory('ai')}>
          {t('common.resetToDefaults')}
        </Button>
      </Flex>
    </Stack>
  )
}
