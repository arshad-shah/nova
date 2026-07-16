import { ipcMain, BrowserWindow, Menu, shell, type IpcMainInvokeEvent } from 'electron'
import { execFile } from 'node:child_process'
import os from 'node:os'
import { IPC_CHANNELS } from '@shared/ipc'

/** Under WSL, shell.openExternal() shells out to xdg-open, which has no browser
 *  handler (and exits 0 regardless), so links silently no-op. Detect WSL so we
 *  can route through Windows interop instead. */
const IS_WSL = process.platform === 'linux' && /microsoft/i.test(os.release())

/** macOS traffic-light geometry. The OS draws the buttons at a fixed 12px
 *  regardless of our UI density — we only choose where the group sits. */
export const TRAFFIC_LIGHT_SIZE = 12
export const TRAFFIC_LIGHT_X = 15

/** Vertically centre the traffic lights in a title bar of `height` px. */
export function trafficLightY(height: number): number {
  return Math.max(0, Math.round((height - TRAFFIC_LIGHT_SIZE) / 2))
}

function openExternalUrl(url: string): void {
  if (IS_WSL) {
    // Hand the URL to the Windows shell so it opens in the user's default
    // browser. execFile (no shell) keeps the URL a single literal arg.
    execFile('cmd.exe', ['/c', 'start', '', url], { windowsHide: true }, (err) => {
      // If interop is unavailable, fall back to the normal path as a last resort.
      if (err) void shell.openExternal(url).catch(() => {})
    })
    return
  }
  void shell.openExternal(url).catch(() => {})
}

/** Resolve the window that issued the IPC call — multi-window safe, unlike
 *  `getFocusedWindow()` which can be wrong if focus moved mid-flight. */
function windowFor(event: IpcMainInvokeEvent): BrowserWindow | null {
  return BrowserWindow.fromWebContents(event.sender)
}

/**
 * Window-control handlers backing the custom title bar. These are registered
 * with `ipcMain.handle` directly (not the typed `handle` wrapper) because each
 * one needs the sender to act on the *requesting* window. The channels are
 * still the shared `IPC_CHANNELS` constants, so the coverage test and renderer
 * typings stay in force.
 */
export function registerWindowHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.WINDOW_MINIMIZE, (event) => {
    windowFor(event)?.minimize()
  })

  ipcMain.handle(IPC_CHANNELS.WINDOW_TOGGLE_MAXIMIZE, (event) => {
    const win = windowFor(event)
    if (!win) return false
    if (win.isMaximized()) win.unmaximize()
    else win.maximize()
    return win.isMaximized()
  })

  ipcMain.handle(IPC_CHANNELS.WINDOW_CLOSE, (event) => {
    windowFor(event)?.close()
  })

  ipcMain.handle(IPC_CHANNELS.WINDOW_IS_MAXIMIZED, (event) => {
    return windowFor(event)?.isMaximized() ?? false
  })

  // ── Application menu (Windows/Linux title-bar menu bar) ──────────────────
  // The custom title bar hides the native in-window menu bar, so the renderer
  // renders its own menu *buttons* that pop the real native submenus. The menu
  // template (built in index.ts) stays the single source of truth.

  ipcMain.handle(IPC_CHANNELS.WINDOW_MENU_LIST, () => {
    const menu = Menu.getApplicationMenu()
    if (!menu) return []
    return menu.items
      .map((item, id) => ({ item, id }))
      // Only top-level items that actually open a submenu and are visible.
      .filter(({ item }) => item.type === 'submenu' && item.visible !== false)
      .map(({ item, id }) => ({ id, label: item.label, enabled: item.enabled }))
  })

  ipcMain.handle(
    IPC_CHANNELS.WINDOW_MENU_POPUP,
    (event, { id, x, y }: { id: number; x: number; y: number }) => {
      const menu = Menu.getApplicationMenu()
      const item = menu?.items[id]
      const win = windowFor(event)
      if (!item?.submenu || !win) return
      // Coords arrive as viewport (renderer) pixels, which map 1:1 to the
      // window content area; round to satisfy Electron's integer requirement.
      item.submenu.popup({ window: win, x: Math.round(x), y: Math.round(y) })
    },
  )

  // ── App-designed menus (custom title bar) ────────────────────────────────
  // The in-app File/Edit/View/Query/Help bar drives these instead of the native
  // submenus, so we control the design. Edit roles act on the focused web
  // contents so Cut/Copy/Paste/Undo work in Monaco and any input.

  ipcMain.handle(
    IPC_CHANNELS.WINDOW_EDIT_ROLE,
    (event, role: 'undo' | 'redo' | 'cut' | 'copy' | 'paste' | 'selectAll') => {
      const wc = windowFor(event)?.webContents
      if (!wc) return
      // Each role maps to a built-in WebContents editing command.
      switch (role) {
        case 'undo': wc.undo(); break
        case 'redo': wc.redo(); break
        case 'cut': wc.cut(); break
        case 'copy': wc.copy(); break
        case 'paste': wc.paste(); break
        case 'selectAll': wc.selectAll(); break
      }
    },
  )

  ipcMain.handle(IPC_CHANNELS.WINDOW_TOGGLE_FULLSCREEN, (event) => {
    const win = windowFor(event)
    if (!win) return false
    const next = !win.isFullScreen()
    win.setFullScreen(next)
    return next
  })

  // Only macOS overlays OS-drawn window buttons on our title bar; elsewhere the
  // renderer draws its own controls and there is nothing to position.
  ipcMain.handle(IPC_CHANNELS.WINDOW_SET_TITLEBAR_HEIGHT, (event, height) => {
    if (process.platform !== 'darwin') return
    const win = windowFor(event)
    if (!win || !Number.isFinite(height) || height <= 0) return
    win.setWindowButtonPosition({ x: TRAFFIC_LIGHT_X, y: trafficLightY(height) })
  })

  ipcMain.handle(IPC_CHANNELS.WINDOW_RELOAD, (event) => {
    windowFor(event)?.webContents.reload()
  })

  ipcMain.handle(IPC_CHANNELS.WINDOW_TOGGLE_DEVTOOLS, (event) => {
    windowFor(event)?.webContents.toggleDevTools()
  })

  ipcMain.handle(IPC_CHANNELS.WINDOW_OPEN_EXTERNAL, (_event, url) => {
    // Only allow web links — never file:// or app: schemes from the renderer.
    if (typeof url === 'string' && /^https?:\/\//i.test(url)) {
      openExternalUrl(url)
    }
  })
}
