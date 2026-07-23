import {
  FilePlus, Database, X, RotateCcw, Settings as SettingsIcon,
  Undo2, Redo2, Scissors, Copy, ClipboardPaste, TextSelect, Search,
  Command, Compass, Boxes, PanelLeft, PanelRight, PanelBottom, Maximize,
  RefreshCw, Wrench, Play, ListChecks, Save, Code2,
  BookOpen, Puzzle, Bug, Info, Sparkles, PartyPopper, type LucideIcon,
} from 'lucide-react'
import { getLatestReleaseNote } from '@/lib/release-notes'
import { IPC_CHANNELS } from '@shared/ipc'
import { MENU_ACTION, menusFor, itemAccelerator, type MenuActionId } from '@shared/menus'
import { KEYBINDING_ACTION } from '@shared/settings'
import { useTranslation } from '@/i18n/I18nProvider'
import { isMac } from '@/lib/platform'
import { initialAutoCommit } from '@/lib/initial-autocommit'
import { useTabsStore } from '@/stores/tabs'
import { useConnectionsStore, getActiveProfile } from '@/stores/connections'
import { useUiStore, ACTIVITY_PANEL } from '@/stores/ui'
import { useSettingsStore } from '@/stores/settings'
import { editorRegistry } from '@/stores/editor'
import { tabActions, requestCloseTab } from '@/stores/tab-actions'
import { ipc } from '@/platform/client'

const GUIDE_URL = 'https://verql.arshadshah.com/guide/'
const SDK_URL = 'https://verql.arshadshah.com/plugins/sdk/'
const ISSUES_URL = 'https://github.com/arshad-shah/verql/issues'

export type MenuItemDef =
  | {
      kind: 'item'
      label: string
      icon?: LucideIcon
      /** Shortcut hint shown as Kbd chips (literal accelerator, e.g. "Ctrl+S"). */
      accelerator?: string
      run: () => void
      /** Evaluated when the menu opens; falsy hides the item's interactivity. */
      enabled?: () => boolean
      danger?: boolean
    }
  | { kind: 'separator' }

export interface MenuDef {
  label: string
  items: MenuItemDef[]
}

/* ── action helpers (read live store state at call time) ───────────────────── */

function newQuery(): void {
  const { activeConnectionId } = useConnectionsStore.getState()
  const profile = getActiveProfile()
  useTabsStore.getState().addQueryTab(activeConnectionId, null, { autoCommit: initialAutoCommit(profile) })
}

function editRole(role: 'undo' | 'redo' | 'cut' | 'copy' | 'paste' | 'selectAll'): void {
  void ipc.optional(IPC_CHANNELS.WINDOW_EDIT_ROLE, role)
}

function openExternal(url: string): void {
  void ipc.optional(IPC_CHANNELS.WINDOW_OPEN_EXTERNAL, url)
}

const hasEditor = (): boolean => editorRegistry.get() !== null
const hasActiveTab = (): boolean => useTabsStore.getState().activeTabId !== null

function closeActiveTab(): void {
  const id = useTabsStore.getState().activeTabId
  if (id) requestCloseTab(id, useTabsStore.getState().closeTab)
}

function saveActiveTab(): void {
  const id = useTabsStore.getState().activeTabId
  if (id) void tabActions.save(id)
}

function runSelection(): void {
  const reg = editorRegistry.get()
  const sql = editorRegistry.getSelectedSql()
  if (reg && sql) tabActions.runStatement(reg.tabId, sql)
}

function openLatestRelease(): void {
  const latest = getLatestReleaseNote()
  if (latest) useTabsStore.getState().openReleaseNotes(latest.version)
}

/* ── the action registry ───────────────────────────────────────────────────── */

interface MenuAction {
  icon?: LucideIcon
  run: () => void
  enabled?: () => boolean
}

/**
 * The one implementation of every menu command, keyed by the shared
 * {@link MenuActionId}. Both surfaces run these: the app-drawn bar calls them
 * directly, and the native menu (the visible bar on macOS, the accelerator
 * table everywhere) dispatches ids over `menu:action` into this same table —
 * see `useShellMenuEvents`. Structure and labels live in `shared/menus.ts`.
 *
 * Pure-OS entries (Services, Quit, Zoom…) never reach here: the native menu
 * handles those with Electron roles.
 */
export const menuActions: Record<MenuActionId, MenuAction> = {
  [MENU_ACTION.NEW_QUERY_TAB]: { icon: FilePlus, run: newQuery },
  [MENU_ACTION.NEW_CONNECTION]: { icon: Database, run: () => useTabsStore.getState().openConnectionForm() },
  [MENU_ACTION.CLOSE_TAB]: { icon: X, run: closeActiveTab, enabled: hasActiveTab },
  [MENU_ACTION.REOPEN_TAB]: { icon: RotateCcw, run: () => useTabsStore.getState().reopenTab() },
  [MENU_ACTION.SETTINGS]: { icon: SettingsIcon, run: () => useTabsStore.getState().openSettings() },

  [MENU_ACTION.UNDO]: { icon: Undo2, run: () => editRole('undo') },
  [MENU_ACTION.REDO]: { icon: Redo2, run: () => editRole('redo') },
  [MENU_ACTION.CUT]: { icon: Scissors, run: () => editRole('cut') },
  [MENU_ACTION.COPY]: { icon: Copy, run: () => editRole('copy') },
  [MENU_ACTION.PASTE]: { icon: ClipboardPaste, run: () => editRole('paste') },
  [MENU_ACTION.SELECT_ALL]: { icon: TextSelect, run: () => editRole('selectAll') },
  [MENU_ACTION.FIND]: { icon: Search, run: () => editorRegistry.runAction('actions.find'), enabled: hasEditor },

  [MENU_ACTION.COMMAND_PALETTE]: { icon: Command, run: () => useUiStore.getState().toggleCommandPalette() },
  [MENU_ACTION.SHOW_EXPLORER]: { icon: Compass, run: () => useUiStore.getState().setActivePanel(ACTIVITY_PANEL.EXPLORER) },
  [MENU_ACTION.SHOW_PLUGINS]: { icon: Boxes, run: () => useUiStore.getState().setActivePanel(ACTIVITY_PANEL.PLUGINS) },
  [MENU_ACTION.TOGGLE_SIDEBAR]: { icon: PanelLeft, run: () => useUiStore.getState().toggleSidebar() },
  [MENU_ACTION.TOGGLE_SECONDARY_SIDEBAR]: { icon: PanelRight, run: () => useUiStore.getState().toggleSecondarySidebar() },
  [MENU_ACTION.TOGGLE_BOTTOM_DOCK]: { icon: PanelBottom, run: () => useUiStore.getState().toggleBottomDock() },
  [MENU_ACTION.TOGGLE_FULL_SCREEN]: { icon: Maximize, run: () => void ipc.optional(IPC_CHANNELS.WINDOW_TOGGLE_FULLSCREEN) },
  [MENU_ACTION.RELOAD]: { icon: RefreshCw, run: () => void ipc.optional(IPC_CHANNELS.WINDOW_RELOAD) },
  [MENU_ACTION.TOGGLE_DEV_TOOLS]: { icon: Wrench, run: () => void ipc.optional(IPC_CHANNELS.WINDOW_TOGGLE_DEVTOOLS) },

  [MENU_ACTION.RUN]: { icon: Play, run: () => editorRegistry.runAction(KEYBINDING_ACTION.EXECUTE_QUERY), enabled: hasEditor },
  [MENU_ACTION.RUN_SELECTION]: { icon: ListChecks, run: runSelection, enabled: () => editorRegistry.getSelectedSql() !== '' },
  [MENU_ACTION.SAVE]: { icon: Save, run: saveActiveTab, enabled: hasActiveTab },
  [MENU_ACTION.FORMAT_DOCUMENT]: { icon: Code2, run: () => editorRegistry.runAction('editor.action.formatDocument'), enabled: hasEditor },

  [MENU_ACTION.WELCOME]: { icon: Sparkles, run: () => useTabsStore.getState().openWelcome() },
  [MENU_ACTION.WHATS_NEW]: { icon: PartyPopper, run: openLatestRelease, enabled: () => !!getLatestReleaseNote() },
  [MENU_ACTION.USER_GUIDE]: { icon: BookOpen, run: () => openExternal(GUIDE_URL) },
  [MENU_ACTION.BUILD_PLUGIN]: { icon: Puzzle, run: () => openExternal(SDK_URL) },
  [MENU_ACTION.REPORT_ISSUE]: { icon: Bug, run: () => openExternal(ISSUES_URL) },
  [MENU_ACTION.ABOUT]: { icon: Info, run: () => useUiStore.getState().setAboutModalOpen(true) },
}

/** Runs a command by id — the entry point for native-menu dispatch. */
export function runMenuAction(id: MenuActionId): void {
  const action = menuActions[id]
  if (!action) return
  if (action.enabled && !action.enabled()) return
  action.run()
}

/* ── the app-drawn bar ─────────────────────────────────────────────────────── */

/**
 * The File / Edit / View / Query / Help tree for the app-designed menu bar
 * (Windows/Linux, where the OS frame is hidden). Structure comes from the
 * shared spec and behaviour from {@link menuActions}, so this bar and the
 * native macOS menu always offer the same commands.
 */
export function useMenus(): MenuDef[] {
  const { t } = useTranslation()
  // Subscribe so a rebind in Settings re-renders the bar's shortcut hints.
  const keybindings = useSettingsStore((s) => s.settings.keybindings)
  const isDev = import.meta.env.DEV

  return menusFor('appbar', isMac, isDev).map((spec) => ({
    label: spec.labelKey ? t(spec.labelKey) : '',
    items: spec.items.flatMap((node): MenuItemDef[] => {
      if (node.kind === 'separator') return [{ kind: 'separator' }]
      // Pure-OS entries carry no id and are native-only; the bar skips them.
      const id = node.id
      if (!id) return []
      const action = menuActions[id]
      return [{
        kind: 'item',
        label: node.labelKey ? t(node.labelKey) : '',
        icon: action?.icon,
        accelerator: itemAccelerator(node, keybindings, isMac),
        enabled: action?.enabled,
        run: () => runMenuAction(id),
      }]
    }),
  }))
}
