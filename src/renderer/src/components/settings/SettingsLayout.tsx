import { JSX, useEffect, useMemo, useState } from 'react'
import { matchesFilter } from '@/lib/fuzzy-match'
import { Search, X } from 'lucide-react'
import { Flex, Box, ScrollArea, Text, Divider, Input, IconButton, SearchInput } from '@/primitives'
import { useUiStore } from '@/stores/ui'
import { SETTINGS_CATEGORY, type SettingsCategoryId } from '@/lib/settings-categories'
import { useToastStore } from '@/stores/toast'
import { useTabsStore } from '@/stores/tabs'
import { tabActions } from '@/stores/tab-actions'
import { useTranslation } from '@/i18n/I18nProvider'
import { SectionErrorBoundary } from '@/components/shell/SectionErrorBoundary'
import { SETTINGS_CATEGORIES, SettingsCategoryNav } from './SettingsCategoryNav'
import { GeneralSettings } from './categories/GeneralSettings'
import { AppearanceSettings } from './categories/AppearanceSettings'
import { EditorSettings } from './categories/EditorSettings'
import { ConnectionSettings } from './categories/ConnectionSettings'
import { DataDisplaySettings } from './categories/DataDisplaySettings'
import { KeybindingsSettings } from './categories/KeybindingsSettings'
import { PluginSettings } from './categories/PluginSettings'
import { AISettings } from './categories/AISettings'
import { MCPSettings } from './categories/MCPSettings'

const categoryComponents: Record<SettingsCategoryId, () => JSX.Element> = {
  [SETTINGS_CATEGORY.GENERAL]: GeneralSettings,
  [SETTINGS_CATEGORY.APPEARANCE]: AppearanceSettings,
  [SETTINGS_CATEGORY.EDITOR]: EditorSettings,
  [SETTINGS_CATEGORY.CONNECTIONS]: ConnectionSettings,
  [SETTINGS_CATEGORY.DATA_DISPLAY]: DataDisplaySettings,
  [SETTINGS_CATEGORY.KEYBINDINGS]: KeybindingsSettings,
  [SETTINGS_CATEGORY.AI]: AISettings,
  [SETTINGS_CATEGORY.MCP]: MCPSettings,
  [SETTINGS_CATEGORY.PLUGINS]: PluginSettings,
}

/**
 * Settings tab body. Follows VS Code's UX for the Settings UI:
 *   - Settings auto-apply as you change them (no draft/save split). This is
 *     what users coming from VS Code expect, and our existing settings store
 *     is already wired this way — every input commits straight through.
 *   - A persistent search input at the top filters the *category list*; the
 *     visible content is whichever category is selected. Filtering across
 *     setting bodies would require a flat content index we don't have yet,
 *     so we filter what we can today (categories) and leave a clear path
 *     forward for full-content search.
 *   - A subtle banner reminds the user that changes save automatically, so
 *     Cmd+S — which the rest of the app uses for explicit saves — doesn't
 *     feel broken here.
 *   - Cmd+S still registers a handler (via tabActions) so the keystroke
 *     produces user feedback ("Settings auto-save" toast) instead of
 *     silently doing nothing.
 */
export function SettingsLayout() {
  const { t } = useTranslation()
  const activeCategory = useUiStore((s) => s.activeSettingsCategory)
  const ActiveComponent = categoryComponents[activeCategory] ?? GeneralSettings
  const currentLabel =
    SETTINGS_CATEGORIES.find((c) => c.id === activeCategory)?.label ?? t('settings.layout.fallbackTitle')

  const [query, setQuery] = useState('')

  // Filter category nav by name match — VS Code shows matched categories
  // bolded; we surface filtered list when the user has typed something. When
  // the query is empty we show every category so the panel reads as a normal
  // settings dialog at rest.
  const filteredCategories = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return SETTINGS_CATEGORIES
    return SETTINGS_CATEGORIES.filter(c => matchesFilter(q, c.label, c.id))
  }, [query])

  // Register with the tab-actions registry so the global Cmd+S handler in
  // App.tsx routes through us. Settings already persist eagerly, so save
  // is a no-op — we surface a toast so the user gets feedback instead of
  // wondering if the keystroke was eaten. Mirrors VS Code's behaviour
  // where Cmd+S on the Settings UI is a no-op.
  const activeTabId = useTabsStore(s => s.activeTabId)
  useEffect(() => {
    if (!activeTabId) return
    // Confirm this tab is actually the settings one before claiming the slot.
    const tab = useTabsStore.getState().tabs.find(t => t.id === activeTabId)
    if (tab?.type !== 'settings') return
    tabActions.register(activeTabId, {
      label: t('settings.layout.fallbackTitle'),
      // Settings auto-save; nothing to flush. We still register so Cmd+S
      // feels acknowledged and `tabActions.isDirty(id)` returns false
      // (no confirm prompt on close).
      isDirty: () => false,
      onSave: () => {
        useToastStore.getState().addToast({
          type: 'info',
          title: t('settings.layout.autoSaveToastTitle'),
          message: t('settings.layout.autoSaveToastMessage'),
        })
      },
    })
    return () => tabActions.unregister(activeTabId)
  }, [activeTabId, t])

  return (
    <Flex direction="row" className="h-full">
      {/* Left rail: search + category nav. */}
      <Flex direction="column" className="w-60 border-r border-border-default shrink-0 bg-bg-secondary">
        <Box className="px-3 pt-3 pb-2 border-b border-border-default">
          <SearchInput size={"lg"} onClear={() => setQuery("")} value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('settings.layout.searchPlaceholder')} className="mt-2" />
        </Box>
        <ScrollArea direction="vertical" className="flex-1">
          <Box paddingY="sm">
            <Text size="xs" color="muted" weight="bold" className="px-4 py-2 uppercase tracking-wider">
              {query ? t('settings.layout.matches', { count: filteredCategories.length }) : t('settings.layout.categories')}
            </Text>
          </Box>
          <Divider />
          <SettingsCategoryNav categories={filteredCategories} />
        </ScrollArea>
      </Flex>

      {/* Right pane: header + auto-save hint + category body. */}
      <Flex direction="column" className="flex-1 overflow-hidden">
        <Box className="px-6 py-3 border-b border-border-default">
          <Flex align="center" justify="between" gap="md">
            <Text size="sm" weight="medium">{currentLabel}</Text>
            {/* VS Code shows a "User / Workspace" breadcrumb here; we have a
                single scope today, so we just confirm the auto-save behaviour
                instead — keeps users from looking for a save button. */}
            <Text size="xs" color="muted" className="italic">
              {t('settings.layout.autoSaveHint')}
            </Text>
          </Flex>
        </Box>
        <ScrollArea direction="vertical" className="flex-1">
          {/* Fluid up to ~1280px, then centred so a 4K display doesn't put the
              label on one coast and the control on the other. Padding scales
              with breakpoint so the body breathes when the user widens the
              tab. */}
          <Box className="w-full max-w-7xl mx-auto px-4 py-5 sm:px-6 lg:px-8 xl:px-10">
            <SectionErrorBoundary label={t('settings.layout.sectionLabel', { label: currentLabel })} resetKey={activeCategory}>
              <ActiveComponent />
            </SectionErrorBoundary>
          </Box>
        </ScrollArea>
      </Flex>
    </Flex>
  )
}
