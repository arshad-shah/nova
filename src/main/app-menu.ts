import { app, BrowserWindow, Menu, type MenuItemConstructorOptions } from 'electron'
import { sendTo } from './ipc/broadcast'
import { IPC_EVENTS } from '@shared/ipc'
import { t } from '@shared/i18n'
import { menusFor, itemAccelerator, type MenuNode, type MenuSpec } from '@shared/menus'
import type { KeyBinding } from '@shared/settings'

const APP_NAME = 'Verql'
const isMac = process.platform === 'darwin'

/**
 * Builds the native application menu from the shared tree in `shared/menus.ts`.
 *
 * This is the visible menu bar on macOS. On Windows/Linux the renderer draws
 * the bar (the OS frame is hidden), but the native menu still registers the
 * accelerator table — so both platforms need it built.
 *
 * Items with a `nativeRole` become real Electron roles, which keeps OS
 * behaviour and localized labels. Everything else emits {@link IPC_EVENTS.MENU_ACTION}
 * with its id and lets the renderer run the same handler a menu-bar click would,
 * so a command has exactly one implementation.
 */

/** Shortcuts follow the user's live keybindings, so a rebind in Settings moves
 *  the native accelerator too rather than leaving a stale one that steals the
 *  key from the renderer. */
function toTemplate(node: MenuNode, keybindings: readonly KeyBinding[]): MenuItemConstructorOptions | null {
  if (node.kind === 'separator') return { type: 'separator' }

  const accelerator = itemAccelerator(node, keybindings, isMac)
  const label = node.labelKey ? t(node.labelKey) : undefined

  if (node.nativeRole) {
    return {
      role: node.nativeRole as MenuItemConstructorOptions['role'],
      ...(label ? { label } : {}),
      ...(accelerator ? { accelerator } : {}),
    }
  }

  // Non-role items are renderer commands; ship the id and let it dispatch.
  if (!node.id) return null
  const action = node.id
  return {
    label,
    ...(accelerator ? { accelerator } : {}),
    click: (_item, win) => {
      const wc = (win as BrowserWindow | undefined)?.webContents
      if (wc) sendTo(wc, IPC_EVENTS.MENU_ACTION, action)
    },
  }
}

function toMenuTemplate(spec: MenuSpec, keybindings: readonly KeyBinding[]): MenuItemConstructorOptions {
  const submenu = spec.items
    .map((i) => toTemplate(i, keybindings))
    .filter((i): i is MenuItemConstructorOptions => i !== null)
  return {
    label: spec.appNameLabel
      ? (!app.isPackaged ? `${APP_NAME} (Dev)` : APP_NAME)
      : spec.labelKey
        ? t(spec.labelKey)
        : APP_NAME,
    ...(spec.role ? { role: spec.role as MenuItemConstructorOptions['role'] } : {}),
    submenu,
  }
}

export function buildAppMenu(keybindings: readonly KeyBinding[]): void {
  // No `setAboutPanelOptions` / `role: 'about'`: About is the app's own modal
  // (fed by `app:about-info`) on every platform, so the native panel is unused.
  const template = menusFor('native', isMac, !app.isPackaged).map((m) => toMenuTemplate(m, keybindings))
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
