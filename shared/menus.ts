/**
 * The application menu, declared once for every platform.
 *
 * Two surfaces render this tree:
 *   • the **native** menu (`Menu.setApplicationMenu`, built in
 *     `src/main/app-menu.ts`) — the visible menu bar on macOS, and the
 *     accelerator table on every platform;
 *   • the **app-drawn** menu bar (`components/shell/MenuBar.tsx`), which is the
 *     visible bar on Windows/Linux where the OS frame is hidden.
 *
 * Before this existed the two surfaces were declared separately and drifted:
 * macOS silently lost the whole Query menu, Settings, Find, the panel toggles,
 * Close/Reopen Tab, Welcome and What's New. Adding an item here now adds it
 * everywhere it should appear.
 *
 * This module is intentionally free of Electron and renderer imports so both
 * processes can read it. It describes *what* the menu contains; each surface
 * supplies the *how*:
 *   • the native side maps `nativeRole` to an Electron role, and every other
 *     item to a `MENU_ACTION` event the renderer executes;
 *   • the renderer maps {@link MenuActionId} to an icon + handler (see
 *     `menu-model.tsx`), so a click and a native accelerator run the same code.
 */
import type { MessageKey } from './i18n'
import { KEYBINDING_ACTION, type KeybindingActionId, type KeyBinding } from './settings'

/**
 * Every menu command. The renderer keys its handler registry by these, and the
 * native menu ships the id across IPC, so a command has exactly one
 * implementation regardless of which surface invoked it.
 */
export const MENU_ACTION = {
  NEW_QUERY_TAB: 'new-query-tab',
  NEW_CONNECTION: 'new-connection',
  CLOSE_TAB: 'close-tab',
  REOPEN_TAB: 'reopen-tab',
  SETTINGS: 'settings',
  UNDO: 'undo',
  REDO: 'redo',
  CUT: 'cut',
  COPY: 'copy',
  PASTE: 'paste',
  SELECT_ALL: 'select-all',
  FIND: 'find',
  COMMAND_PALETTE: 'command-palette',
  SHOW_EXPLORER: 'show-explorer',
  SHOW_PLUGINS: 'show-plugins',
  TOGGLE_SIDEBAR: 'toggle-sidebar',
  TOGGLE_SECONDARY_SIDEBAR: 'toggle-secondary-sidebar',
  TOGGLE_BOTTOM_DOCK: 'toggle-bottom-dock',
  TOGGLE_FULL_SCREEN: 'toggle-full-screen',
  RELOAD: 'reload',
  TOGGLE_DEV_TOOLS: 'toggle-dev-tools',
  RUN: 'run',
  RUN_SELECTION: 'run-selection',
  SAVE: 'save',
  FORMAT_DOCUMENT: 'format-document',
  WELCOME: 'welcome',
  WHATS_NEW: 'whats-new',
  USER_GUIDE: 'user-guide',
  BUILD_PLUGIN: 'build-plugin',
  REPORT_ISSUE: 'report-issue',
  ABOUT: 'about',
} as const

export type MenuActionId = (typeof MENU_ACTION)[keyof typeof MENU_ACTION]

/**
 * Which surface an entry belongs to.
 *   • `both`   — the default; appears in the native menu and the app-drawn bar.
 *   • `native` — OS-level entries the app bar has no business drawing
 *     (Services, Hide, Quit, Zoom, Front…).
 *   • `appbar` — entries that only make sense in our own bar.
 */
export type MenuSurface = 'both' | 'native' | 'appbar'

/** Platform gate. `mac` and `other` mirror the app's only real split. */
export type MenuPlatform = 'mac' | 'other'

/**
 * An Electron menu role, named loosely so this module stays Electron-free.
 * The native builder passes it straight through; the app bar ignores it and
 * uses the action registry instead.
 */
export type MenuRole =
  | 'about' | 'services' | 'hide' | 'hideOthers' | 'unhide' | 'quit' | 'close'
  | 'undo' | 'redo' | 'cut' | 'copy' | 'paste' | 'selectAll'
  | 'togglefullscreen' | 'reload' | 'forceReload' | 'toggleDevTools'
  | 'minimize' | 'zoom' | 'front'

export type MenuNode =
  | { kind: 'separator'; surface?: MenuSurface; platform?: MenuPlatform; devOnly?: boolean }
  | {
      kind: 'item'
      /**
       * Renderer handler key + the id sent over IPC by the native menu.
       * Omitted only by pure-OS entries (Services, Quit, Zoom, …) that the
       * native `nativeRole` handles end-to-end and the app bar never draws.
       */
      id?: MenuActionId
      /** Omitted only when `nativeRole` supplies an OS-provided label. */
      labelKey?: MessageKey
      /**
       * When set, the native menu uses this role (correct OS behaviour and
       * label) instead of round-tripping through the renderer. The app bar
       * still routes through the action registry.
       */
      nativeRole?: MenuRole
      /**
       * The rebindable action whose *current* binding is this item's shortcut.
       * Resolved live via {@link resolveAccelerator}, so a rebind in Settings
       * moves the native accelerator and the app bar's hint together.
       */
      keybinding?: KeybindingActionId
      /** Fixed shortcut for commands that aren't user-rebindable. */
      accelerator?: string
      surface?: MenuSurface
      platform?: MenuPlatform
      devOnly?: boolean
    }

export interface MenuSpec {
  id: string
  labelKey?: MessageKey
  /** macOS app menu: labelled with the app name rather than a catalogue key. */
  appNameLabel?: boolean
  role?: 'help' | 'window'
  items: MenuNode[]
  surface?: MenuSurface
  platform?: MenuPlatform
}

/**
 * The user's current shortcut for a rebindable action, in Electron accelerator
 * syntax — which `Cmd+…` / `Ctrl+…` already are, so no conversion is needed.
 *
 * Bindings store both a Cmd and a Ctrl variant; pick the one for this platform.
 * Shared by the native builder (for real accelerators) and the app bar (for
 * hint chips) so the two can never disagree about what a shortcut is.
 */
export function resolveAccelerator(
  keybindings: readonly KeyBinding[],
  actionId: KeybindingActionId,
  isMac: boolean,
): string | undefined {
  const kb = keybindings.find((k) => k.id === actionId)
  if (!kb) return undefined
  return kb.keys.find((k) => (isMac ? k.startsWith('Cmd') : k.startsWith('Ctrl'))) ?? kb.keys[0]
}

/** The shortcut to show/bind for an item, whether rebindable or fixed. */
export function itemAccelerator(
  item: Extract<MenuNode, { kind: 'item' }>,
  keybindings: readonly KeyBinding[],
  isMac: boolean,
): string | undefined {
  if (item.keybinding) return resolveAccelerator(keybindings, item.keybinding, isMac)
  return item.accelerator
}

function keep<T extends { surface?: MenuSurface; platform?: MenuPlatform; devOnly?: boolean }>(
  node: T,
  surface: 'native' | 'appbar',
  isMac: boolean,
  isDev: boolean,
): boolean {
  if (node.devOnly && !isDev) return false
  if (node.platform && node.platform !== (isMac ? 'mac' : 'other')) return false
  const s = node.surface ?? 'both'
  return s === 'both' || s === surface
}

/**
 * The whole menu tree. Same *capabilities* on every platform; placement follows
 * each platform's convention rather than mirroring one OS onto another:
 * Settings sits in the macOS app menu at Cmd+, (where Mac users reach for it)
 * and under File elsewhere; Quit/Close and the Window menu likewise.
 */
export const APP_MENUS: MenuSpec[] = [
  // macOS app menu. Native-only — the app-drawn bar never renders on macOS.
  {
    id: 'app',
    appNameLabel: true,
    platform: 'mac',
    surface: 'native',
    items: [
      // Routed to the app's own About modal rather than `role: 'about'`, so the
      // brand surface is the same one every other platform shows.
      { kind: 'item', id: MENU_ACTION.ABOUT, labelKey: 'menu.aboutShort' },
      { kind: 'separator' },
      // Cmd+, is the macOS convention for Settings; it has no Windows analogue.
      { kind: 'item', id: MENU_ACTION.SETTINGS, labelKey: 'menu.settings', accelerator: 'Cmd+,' },
      { kind: 'separator' },
      { kind: 'item', nativeRole: 'services' },
      { kind: 'separator' },
      { kind: 'item', nativeRole: 'hide' },
      { kind: 'item', nativeRole: 'hideOthers' },
      { kind: 'item', nativeRole: 'unhide' },
      { kind: 'separator' },
      { kind: 'item', nativeRole: 'quit' },
    ],
  },
  {
    id: 'file',
    labelKey: 'menu.file',
    items: [
      { kind: 'item', id: MENU_ACTION.NEW_QUERY_TAB, labelKey: 'menu.newQueryTab', keybinding: KEYBINDING_ACTION.NEW_TAB },
      { kind: 'item', id: MENU_ACTION.NEW_CONNECTION, labelKey: 'menu.newConnection', accelerator: 'CmdOrCtrl+Shift+N' },
      { kind: 'separator' },
      { kind: 'item', id: MENU_ACTION.CLOSE_TAB, labelKey: 'menu.closeTab', keybinding: KEYBINDING_ACTION.CLOSE_TAB },
      { kind: 'item', id: MENU_ACTION.REOPEN_TAB, labelKey: 'menu.reopenTab', accelerator: 'CmdOrCtrl+Shift+T' },
      { kind: 'separator' },
      // Non-mac only: on macOS this lives in the app menu, per convention.
      { kind: 'item', id: MENU_ACTION.SETTINGS, labelKey: 'menu.settings', platform: 'other' },
      { kind: 'separator', platform: 'other' },
      // Closing the window is a native concern, and differs by platform.
      { kind: 'item', nativeRole: 'close', platform: 'mac', surface: 'native' },
      { kind: 'item', nativeRole: 'quit', platform: 'other', surface: 'native' },
    ],
  },
  {
    id: 'edit',
    labelKey: 'menu.edit',
    items: [
      { kind: 'item', id: MENU_ACTION.UNDO, labelKey: 'menu.undo', nativeRole: 'undo' },
      { kind: 'item', id: MENU_ACTION.REDO, labelKey: 'menu.redo', nativeRole: 'redo' },
      { kind: 'separator' },
      { kind: 'item', id: MENU_ACTION.CUT, labelKey: 'menu.cut', nativeRole: 'cut' },
      { kind: 'item', id: MENU_ACTION.COPY, labelKey: 'menu.copy', nativeRole: 'copy' },
      { kind: 'item', id: MENU_ACTION.PASTE, labelKey: 'menu.paste', nativeRole: 'paste' },
      { kind: 'item', id: MENU_ACTION.SELECT_ALL, labelKey: 'menu.selectAll', nativeRole: 'selectAll' },
      { kind: 'separator' },
      { kind: 'item', id: MENU_ACTION.FIND, labelKey: 'menu.find', accelerator: 'CmdOrCtrl+F' },
    ],
  },
  {
    id: 'view',
    labelKey: 'menu.view',
    items: [
      { kind: 'item', id: MENU_ACTION.COMMAND_PALETTE, labelKey: 'menu.commandPalette', keybinding: KEYBINDING_ACTION.COMMAND_PALETTE },
      { kind: 'separator' },
      { kind: 'item', id: MENU_ACTION.SHOW_EXPLORER, labelKey: 'menu.showExplorer' },
      { kind: 'item', id: MENU_ACTION.SHOW_PLUGINS, labelKey: 'menu.showPlugins' },
      { kind: 'separator' },
      { kind: 'item', id: MENU_ACTION.TOGGLE_SIDEBAR, labelKey: 'menu.toggleSidebar', keybinding: KEYBINDING_ACTION.TOGGLE_SIDEBAR },
      { kind: 'item', id: MENU_ACTION.TOGGLE_SECONDARY_SIDEBAR, labelKey: 'menu.toggleSecondarySidebar', keybinding: KEYBINDING_ACTION.TOGGLE_SECONDARY_SIDEBAR },
      { kind: 'item', id: MENU_ACTION.TOGGLE_BOTTOM_DOCK, labelKey: 'menu.toggleBottomDock', keybinding: KEYBINDING_ACTION.TOGGLE_BOTTOM_DOCK },
      { kind: 'separator' },
      { kind: 'item', id: MENU_ACTION.TOGGLE_FULL_SCREEN, labelKey: 'menu.toggleFullScreen', nativeRole: 'togglefullscreen' },
      { kind: 'separator', devOnly: true },
      { kind: 'item', id: MENU_ACTION.RELOAD, labelKey: 'menu.reload', nativeRole: 'reload', devOnly: true },
      { kind: 'item', id: MENU_ACTION.TOGGLE_DEV_TOOLS, labelKey: 'menu.toggleDevTools', nativeRole: 'toggleDevTools', devOnly: true },
    ],
  },
  {
    id: 'query',
    labelKey: 'menu.query',
    items: [
      { kind: 'item', id: MENU_ACTION.RUN, labelKey: 'menu.run', keybinding: KEYBINDING_ACTION.EXECUTE_QUERY },
      { kind: 'item', id: MENU_ACTION.RUN_SELECTION, labelKey: 'menu.runSelection' },
      { kind: 'separator' },
      { kind: 'item', id: MENU_ACTION.SAVE, labelKey: 'menu.save', keybinding: KEYBINDING_ACTION.SAVE_QUERY },
      { kind: 'item', id: MENU_ACTION.FORMAT_DOCUMENT, labelKey: 'menu.formatDocument', accelerator: 'Shift+Alt+F' },
    ],
  },
  // Native-only: the app-drawn bar deliberately omits OS window management,
  // which its own window controls already cover.
  {
    id: 'window',
    labelKey: 'menu.window',
    surface: 'native',
    items: [
      { kind: 'item', nativeRole: 'minimize' },
      { kind: 'item', nativeRole: 'zoom' },
      { kind: 'separator', platform: 'mac' },
      { kind: 'item', nativeRole: 'front', platform: 'mac' },
      { kind: 'item', nativeRole: 'close', platform: 'other' },
    ],
  },
  {
    id: 'help',
    labelKey: 'menu.help',
    role: 'help',
    items: [
      { kind: 'item', id: MENU_ACTION.WELCOME, labelKey: 'menu.welcome' },
      { kind: 'item', id: MENU_ACTION.WHATS_NEW, labelKey: 'menu.whatsNew' },
      { kind: 'separator' },
      { kind: 'item', id: MENU_ACTION.USER_GUIDE, labelKey: 'menu.userGuideShort' },
      { kind: 'item', id: MENU_ACTION.BUILD_PLUGIN, labelKey: 'menu.buildPlugin' },
      { kind: 'item', id: MENU_ACTION.REPORT_ISSUE, labelKey: 'menu.reportIssue' },
      { kind: 'separator' },
      // macOS surfaces About in the app menu above, per convention.
      { kind: 'item', id: MENU_ACTION.ABOUT, labelKey: 'menu.aboutShort', platform: 'other' },
    ],
  },
]

/** The tree as one surface should render it, with gated entries removed. */
export function menusFor(surface: 'native' | 'appbar', isMac: boolean, isDev: boolean): MenuSpec[] {
  return APP_MENUS.filter((m) => keep(m, surface, isMac, isDev))
    .map((m) => ({ ...m, items: m.items.filter((i) => keep(i, surface, isMac, isDev)) }))
    .map((m) => ({ ...m, items: trimSeparators(m.items) }))
    .filter((m) => m.items.length > 0)
}

/** Drops leading/trailing/doubled separators left behind by platform gating. */
function trimSeparators(items: MenuNode[]): MenuNode[] {
  const out: MenuNode[] = []
  for (const item of items) {
    if (item.kind === 'separator') {
      if (out.length === 0) continue
      if (out[out.length - 1]?.kind === 'separator') continue
    }
    out.push(item)
  }
  while (out.length && out[out.length - 1]?.kind === 'separator') out.pop()
  return out
}
