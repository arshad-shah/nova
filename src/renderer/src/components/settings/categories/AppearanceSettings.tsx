import { Check, Sun, Moon, Monitor, AlertTriangle } from 'lucide-react'
import { Stack, Grid, Divider, Flex, Button, Text, Box, Switch } from '@/primitives'
import { Select, ColorInput } from '@/primitives'
import { useSettingsStore } from '@/stores/settings'
import { useTheme } from '@/primitives'
import { useThemesStore } from '@/stores/themes'
import { useTranslation } from '@/i18n/I18nProvider'
import { SettingRow } from '../SettingRow'
import { PluginContributedSettings } from '../PluginContributedSettings'
import { SettingLabel } from '@/components/settings/SettingLabel'
import { isThemeSelectable } from './theme-utils'

const FALLBACK_PREVIEW = { bg: '#0B0F16', sidebar: '#131825', text: '#E8ECF3', accent: '#2bd9a3' }

const MODE_OPTIONS: { id: 'light' | 'dark' | 'system'; Icon: typeof Sun }[] = [
  { id: 'light', Icon: Sun },
  { id: 'dark', Icon: Moon },
  { id: 'system', Icon: Monitor },
]

type ThemeGridItem = {
  id: string
  name: string
  preview?: { bg: string; sidebar: string; text: string; accent: string }
  validation?: { ok: boolean; missingRequired: string[]; missingRecommended: string[] }
}

function ThemeGrid({
  title,
  list,
  currentTheme,
  setTheme,
}: {
  title: string
  list: ThemeGridItem[]
  currentTheme: string
  setTheme: (id: string) => void
}) {
  const { t: tr } = useTranslation()
  if (list.length === 0) return null
  return (
    <Box>
      <SettingLabel label={title} description="" />
      <Grid columns={4} gap="sm">
        {list.map((t) => {
          const preview = t.preview ?? FALLBACK_PREVIEW
          const v = t.validation
          const selectable = isThemeSelectable(t)
          const hasError = !selectable
          const hasWarning = selectable && v && v.missingRecommended.length > 0
          const tooltip = hasError
            ? tr('settings.appearance.themeMissingRequired', { tokens: v!.missingRequired.join(', ') })
            : hasWarning
              ? tr('settings.appearance.themeMissingRecommended', { tokens: v!.missingRecommended.join(', ') })
              : undefined
          return (
            <Box
              key={t.id}
              as="button"
              type="button"
              onClick={() => { if (selectable) setTheme(t.id) }}
              aria-disabled={!selectable}
              disabled={!selectable}
              className={`relative rounded-lg border-2 p-2.5 transition-colors ${
                !selectable
                  ? 'cursor-not-allowed opacity-50 border-error/40'
                  : 'cursor-pointer ' + (
                      currentTheme === t.id
                        ? 'border-accent'
                        : 'border-transparent hover:border-border-default'
                    )
              }`}
              style={{ background: preview.bg }}
              title={tooltip}
            >
              {(hasError || hasWarning) && (
                <span
                  className={`absolute top-1.5 right-1.5 inline-flex items-center justify-center rounded-full p-0.5 ${
                    hasError ? 'bg-error text-white' : 'bg-warning'
                  }`}
                  style={hasError ? undefined : { color: 'var(--color-on-warning)' }}
                  aria-label={tooltip}
                >
                  <AlertTriangle size={9} />
                </span>
              )}
              <Flex gap="xs" className="mb-2 h-1.5">
                <div className="flex-1 rounded-sm" style={{ background: preview.sidebar }} />
                <div
                  className="flex-2 rounded-sm"
                  style={{ background: preview.bg, border: `1px solid ${preview.sidebar}` }}
                />
              </Flex>
              <Flex gap="xs" className="mb-1.5">
                <div className="h-0.5 w-3 rounded-sm" style={{ background: preview.text }} />
                <div className="h-0.5 w-5 rounded-sm" style={{ background: preview.sidebar }} />
              </Flex>
              <Flex gap="xs">
                <div className="h-0.5 w-2 rounded-sm" style={{ background: preview.accent }} />
                <div className="h-0.5 w-4 rounded-sm" style={{ background: preview.sidebar }} />
              </Flex>
              <Text size="xs" className="mt-2 text-center block" style={{ color: preview.text }}>
                {t.name} {currentTheme === t.id && <Check size={10} className="inline ml-0.5" />}
              </Text>
            </Box>
          )
        })}
      </Grid>
    </Box>
  )
}

export function AppearanceSettings() {
  const { t } = useTranslation()
  const appearance = useSettingsStore((s) => s.settings.appearance)
  const setSetting = useSettingsStore((s) => s.set)
  const resetCategory = useSettingsStore((s) => s.resetCategory)
  const { theme: currentTheme, setTheme, mode, setMode } = useTheme()
  const themes = useThemesStore((s) => s.themes)

  const currentPreview = themes.find((t) => t.id === currentTheme)?.preview ?? FALLBACK_PREVIEW

  // Split theme list by type so the picker groups dark + light. Picking
  // a theme also pins it as the preference for its side, so flipping
  // mode later still lands on the user's preferred theme for that mode.
  const darkThemes = themes.filter((t) => t.type === 'dark')
  const lightThemes = themes.filter((t) => t.type === 'light')

  return (
    <Stack gap="md">
      <Text size="xs" color="muted">{t('settings.appearance.blurb')}</Text>

      <Box>
        <SettingLabel label={t('settings.appearance.colorMode.label')} description={t('settings.appearance.colorMode.description')} />
        <Flex gap="xs">
          {MODE_OPTIONS.map(({ id, Icon }) => (
            <Box
              key={id}
              as="button"
              onClick={() => setMode(id)}
              className={`flex-1 rounded-md border px-3 py-2 cursor-pointer transition-colors ${
                mode === id
                  ? 'border-accent bg-accent-muted text-text-primary'
                  : 'border-border-default bg-transparent text-text-secondary hover:border-border-strong'
              }`}
            >
              <Flex align="center" justify="center" gap="xs">
                <Icon size={14} />
                <Text size="sm">{t(`settings.appearance.mode.${id}`)}</Text>
              </Flex>
            </Box>
          ))}
        </Flex>
        {mode === 'system' && (
          <Text size="xs" color="muted" className="mt-2 block">
            {t('settings.appearance.systemHint')}
          </Text>
        )}
      </Box>

      <Divider />

      <ThemeGrid title={t('settings.appearance.darkThemes')} list={darkThemes} currentTheme={currentTheme} setTheme={setTheme} />
      <ThemeGrid title={t('settings.appearance.lightThemes')} list={lightThemes} currentTheme={currentTheme} setTheme={setTheme} />

      <Divider />

      <SettingRow label={t('settings.appearance.uiDensity.label')} description={t('settings.appearance.uiDensity.description')}>
        <Select
          value={appearance.uiDensity}
          onChange={(v) => setSetting('appearance.uiDensity', v)}
          options={[
            { value: 'compact', label: t('settings.appearance.uiDensity.compact') },
            { value: 'comfortable', label: t('settings.appearance.uiDensity.comfortable') },
            { value: 'spacious', label: t('settings.appearance.uiDensity.spacious') },
          ]}
          size="sm"
          className="w-32"
        />
      </SettingRow>

      <SettingRow label={t('settings.appearance.sidebarPosition.label')} description={t('settings.appearance.sidebarPosition.description')}>
        <Select
          value={appearance.sidebarPosition}
          onChange={(v) => setSetting('appearance.sidebarPosition', v)}
          options={[
            { value: 'left', label: t('settings.appearance.sidebarPosition.left') },
            { value: 'right', label: t('settings.appearance.sidebarPosition.right') },
          ]}
          size="sm"
          className="w-32"
        />
      </SettingRow>

      <SettingRow
        label={t('settings.appearance.accentColor.label')}
        description={
          appearance.accentColor
            ? t('settings.appearance.accentColor.descriptionCustom')
            : t('settings.appearance.accentColor.descriptionDefault')
        }
      >
        <Flex gap="sm" align="center">
          <ColorInput
            value={appearance.accentColor || currentPreview.accent}
            onChange={(v) => setSetting('appearance.accentColor', v)}
            size="sm"
          />
          {appearance.accentColor && (
            <Button variant="ghost" size="sm" onClick={() => setSetting('appearance.accentColor', '')}>
              {t('settings.appearance.accentColor.useThemeDefault')}
            </Button>
          )}
        </Flex>
      </SettingRow>

      <Divider />

      <SettingRow label={t('settings.appearance.showStatusBar.label')} description={t('settings.appearance.showStatusBar.description')}>
        <Switch
          label={t('settings.appearance.showStatusBar.label')}
          checked={appearance.showStatusBar}
          onChange={(e) => setSetting('appearance.showStatusBar', e.target.checked)}
        />
      </SettingRow>

      <SettingRow label={t('settings.appearance.showSecondarySidebar.label')} description={t('settings.appearance.showSecondarySidebar.description')}>
        <Switch
          label={t('settings.appearance.showSecondarySidebar.label')}
          checked={appearance.showSecondarySidebar}
          onChange={(e) => setSetting('appearance.showSecondarySidebar', e.target.checked)}
        />
      </SettingRow>

      <SettingRow label={t('settings.appearance.showBottomDock.label')} description={t('settings.appearance.showBottomDock.description')}>
        <Switch
          label={t('settings.appearance.showBottomDock.label')}
          checked={appearance.showBottomDock}
          onChange={(e) => setSetting('appearance.showBottomDock', e.target.checked)}
        />
      </SettingRow>

      <SettingRow label={t('settings.appearance.animations.label')} description={t('settings.appearance.animations.description')}>
        <Switch
          label={t('settings.appearance.animations.label')}
          checked={appearance.animations}
          onChange={(e) => setSetting('appearance.animations', e.target.checked)}
        />
      </SettingRow>

      <PluginContributedSettings category="appearance" />

      <Divider />

      <Flex justify="end">
        <Button variant="outline" size="sm" onClick={() => resetCategory('appearance')}>
          {t('common.resetToDefaults')}
        </Button>
      </Flex>
    </Stack>
  )
}
