import { create } from 'zustand'
import { useSettingsStore } from './settings'
import { SETTINGS_CATEGORY, type SettingsCategoryId } from '@/lib/settings-categories'
import { CONFIG_KEY } from '@shared/settings'

// Namespace prefix plugin-contributed panel ids are given, e.g. `plugin:ai-chat`
// (built from a contribution's `contributionId`). Centralised because both the
// construction (`${PLUGIN_PANEL_PREFIX}${id}`) and the parsing
// (`startsWith`/`slice`) sides are repeated across the shell.
export const PLUGIN_PANEL_PREFIX = 'plugin:' as const

// Built-in panel ids, centralised so call sites stop repeating literals (the
// types stay open with `string & {}` because plugins contribute their own
// panel ids, e.g. `plugin:ai-chat`).
export const ACTIVITY_PANEL = {
  EXPLORER: 'explorer',
  QUERY: 'query',
  CHARTS: 'charts',
  PLUGINS: 'plugins',
  SETTINGS: 'settings',
} as const
export const SECONDARY_PANEL = {
  INSPECTOR: 'inspector',
  NOTIFICATIONS: 'notifications',
  CONNECTIONS: 'connections',
  ACTIVITY: 'activity',
} as const
export const BOTTOM_PANEL = {
  RESULTS: 'results',
  QUERY_PLAN: 'query-plan',
  CHART: 'chart',
} as const

export type ActivityPanel = (typeof ACTIVITY_PANEL)[keyof typeof ACTIVITY_PANEL] | (string & {})
export type SecondaryPanelId = (typeof SECONDARY_PANEL)[keyof typeof SECONDARY_PANEL] | (string & {})
export type BottomPanelId = (typeof BOTTOM_PANEL)[keyof typeof BOTTOM_PANEL] | (string & {})

export type { SettingsCategoryId }

interface UiState {
  activePanel: ActivityPanel
  sidebarVisible: boolean
  expandedTreeNodes: Set<string>
  /** Which settings category is shown in the editor area when activePanel === 'settings'. */
  activeSettingsCategory: SettingsCategoryId
  setActivePanel: (panel: ActivityPanel) => void
  setActiveSettingsCategory: (category: SettingsCategoryId) => void
  toggleSidebar: () => void
  setSidebarWidth: (width: number) => void
  toggleTreeNode: (path: string) => void
  expandTreeNode: (path: string) => void
  collapseAllTreeNodes: () => void
  // Secondary sidebar (right)
  secondarySidebarVisible: boolean
  secondaryActivePanel: SecondaryPanelId
  setSecondaryActivePanel: (panel: SecondaryPanelId) => void
  toggleSecondarySidebar: () => void
  setSecondarySidebarWidth: (width: number) => void
  // Bottom dock
  bottomDockVisible: boolean
  bottomDockActivePanel: BottomPanelId
  setBottomDockActivePanel: (panel: BottomPanelId) => void
  toggleBottomDock: () => void
  setBottomDockHeight: (height: number) => void
  setActivityDetailHeight: (height: number) => void
  setActivityGrouping: (on: boolean) => void
  // Command palette — open state lives here so the keybinding, the in-app menu,
  // and the native-menu IPC event all toggle one source of truth.
  commandPaletteOpen: boolean
  setCommandPaletteOpen: (open: boolean) => void
  toggleCommandPalette: () => void
  // About modal (Help → About Verql)
  aboutModalOpen: boolean
  setAboutModalOpen: (open: boolean) => void
}

export const useUiStore = create<UiState>((set) => ({
  activePanel: ACTIVITY_PANEL.EXPLORER,
  sidebarVisible: true,
  expandedTreeNodes: new Set<string>(),
  activeSettingsCategory: SETTINGS_CATEGORY.GENERAL,
  setActivePanel: (panel) =>
    set((state) => ({
      activePanel: panel,
      sidebarVisible: state.activePanel === panel ? !state.sidebarVisible : true,
    })),
  setActiveSettingsCategory: (category) => set({ activeSettingsCategory: category }),
  toggleSidebar: () => set((state) => ({ sidebarVisible: !state.sidebarVisible })),
  setSidebarWidth: (width) => {
    const clamped = Math.min(480, Math.max(180, width))
    useSettingsStore.getState().set(CONFIG_KEY.APPEARANCE_SIDEBAR_WIDTH, clamped)
  },
  toggleTreeNode: (path) =>
    set((state) => {
      const next = new Set(state.expandedTreeNodes)
      if (next.has(path)) {
        next.delete(path)
      } else {
        next.add(path)
      }
      return { expandedTreeNodes: next }
    }),
  expandTreeNode: (path) =>
    set((state) => {
      if (state.expandedTreeNodes.has(path)) return {}
      const next = new Set(state.expandedTreeNodes)
      next.add(path)
      return { expandedTreeNodes: next }
    }),
  collapseAllTreeNodes: () => set({ expandedTreeNodes: new Set<string>() }),
  secondarySidebarVisible: useSettingsStore.getState().settings.appearance.showSecondarySidebar,
  secondaryActivePanel: SECONDARY_PANEL.INSPECTOR,
  setSecondaryActivePanel: (panel) =>
    set((state) => ({
      secondaryActivePanel: panel,
      secondarySidebarVisible:
        state.secondaryActivePanel === panel ? !state.secondarySidebarVisible : true,
    })),
  toggleSecondarySidebar: () =>
    set((state) => ({ secondarySidebarVisible: !state.secondarySidebarVisible })),
  setSecondarySidebarWidth: (width) => {
    const clamped = Math.min(640, Math.max(220, width))
    useSettingsStore.getState().set('appearance.secondarySidebarWidth', clamped)
  },
  bottomDockVisible: useSettingsStore.getState().settings.appearance.showBottomDock,
  bottomDockActivePanel: BOTTOM_PANEL.RESULTS,
  setBottomDockActivePanel: (panel) =>
    set((state) => ({
      bottomDockActivePanel: panel,
      bottomDockVisible:
        state.bottomDockActivePanel === panel ? !state.bottomDockVisible : true,
    })),
  toggleBottomDock: () =>
    set((state) => ({ bottomDockVisible: !state.bottomDockVisible })),
  setBottomDockHeight: (height) => {
    const clamped = Math.min(640, Math.max(120, height))
    useSettingsStore.getState().set('appearance.bottomDockHeight', clamped)
  },
  setActivityDetailHeight: (height) => {
    const clamped = Math.min(640, Math.max(120, height))
    useSettingsStore.getState().set('appearance.activityDetailHeight', clamped)
  },
  setActivityGrouping: (on) => {
    useSettingsStore.getState().set('appearance.activityGrouping', on)
  },
  commandPaletteOpen: false,
  setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),
  toggleCommandPalette: () => set((s) => ({ commandPaletteOpen: !s.commandPaletteOpen })),
  aboutModalOpen: false,
  setAboutModalOpen: (open) => set({ aboutModalOpen: open }),
}))

// Keep the live layout-visibility flags in sync with their persisted appearance
// settings. These flags are *seeded* once from settings at store creation (which
// runs before settings hydrate from disk) and are also toggled transiently by
// buttons/keybindings — so without this bridge, changing the setting (or the
// persisted value loading at startup) would never reach the live UI.
useSettingsStore.subscribe((state, prev) => {
  const a = state.settings.appearance
  const p = prev.settings.appearance
  if (a.showSecondarySidebar !== p.showSecondarySidebar) {
    useUiStore.setState({ secondarySidebarVisible: a.showSecondarySidebar })
  }
  if (a.showBottomDock !== p.showBottomDock) {
    useUiStore.setState({ bottomDockVisible: a.showBottomDock })
  }
})
