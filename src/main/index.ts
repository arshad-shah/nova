import { app, BrowserWindow, nativeImage } from 'electron'
import path from 'path'
import fs from 'fs'
import { registerIpcHandlers } from './ipc-handlers'
import { buildAppMenu } from './app-menu'
import { TRAFFIC_LIGHT_X, trafficLightY } from './ipc/window'
import { IPC_EVENTS } from '@shared/ipc'
import { CONFIG_KEY } from '@shared/settings'

/** The title bar at the default (comfortable) density — `h-10` on a 4.5px
 *  spacing unit. Only a first-paint value; the renderer reports the real one. */
const DEFAULT_TITLEBAR_HEIGHT = 45

const isDev = !app.isPackaged
const isMac = process.platform === 'darwin'
const isWindows = process.platform === 'win32'
const APP_NAME = 'Verql'

// The renderer owns the title bar on every platform (see TitleBar.tsx). How we
// strip the OS frame differs by platform:
//   • macOS  — hidden inset bar with the native traffic lights overlaid (Mac
//     users expect them; they sit in the reserved left inset).
//   • Windows — hidden caption; the renderer draws its own min/max/close
//     controls. The native Window Controls Overlay was avoided because its
//     button height couldn't be matched to our bar under display scaling
//     (buttons overflowed the bar); app-drawn controls are pixel-exact and
//     match VS Code's Windows behaviour.
//   • Linux  — no overlay API exists, so the window is frameless and the
//     renderer draws its own controls too.
// Windows/Linux controls are driven via the window:* IPC channels.
/**
 * Identity used for on-disk storage (`app.getPath('userData')`) and the macOS
 * keychain service that backs `safeStorage`. From v0.1.0 onwards this MUST
 * stay constant — changing it points the app at a new userData dir and a new
 * keychain entry, which makes previously-encrypted ciphertexts (API keys,
 * connection passwords stored as ciphertext in config.json) undecryptable
 * for every existing installation. If a future rebrand is unavoidable, ship
 * a one-shot migration that copies the old `userData/<old-name>` directory
 * to the new path before any read.
 */
const STORAGE_NAME = 'verql'

app.setName(STORAGE_NAME)

/**
 * Resolves the app icon at runtime.
 *
 * In production the icon is baked in by electron-builder from the package.json `build` config,
 * but in `pnpm dev` we hit Electron's default icon because nothing tells the
 * window where to find ours. We point at `build/icon.png` (the rasterized
 * Verql mark) explicitly so the Dock / taskbar / window match in dev too.
 *
 * Falls back gracefully when the file is missing so a fresh checkout that
 * hasn't run `pnpm build:icons` still launches.
 */
function resolveAppIcon(): Electron.NativeImage | undefined {
  const candidates = [
    path.join(app.getAppPath(), 'build', 'icon.png'),
    path.join(__dirname, '../../build/icon.png'),
    path.join(process.cwd(), 'build', 'icon.png'),
  ]
  for (const p of candidates) {
    if (fs.existsSync(p)) return nativeImage.createFromPath(p)
  }
  return undefined
}

function createWindow(): BrowserWindow {
  const title = isDev ? `${APP_NAME} — Dev` : APP_NAME
  const icon = resolveAppIcon()

  const win = new BrowserWindow({
    title,
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    ...(isMac
      ? {
          titleBarStyle: 'hiddenInset' as const,
          // A first-paint guess for the default (comfortable) bar. The renderer
          // measures the bar and reports its real height over
          // `window:set-titlebar-height`, which re-centres these — the height
          // moves with the UI density setting, so it can't be a constant.
          trafficLightPosition: { x: TRAFFIC_LIGHT_X, y: trafficLightY(DEFAULT_TITLEBAR_HEIGHT) },
        }
      : isWindows
        ? { titleBarStyle: 'hidden' as const }
        : { frame: false }),
    backgroundColor: '#0d0d1a',
    icon,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      // Renderer security baseline:
      //   contextIsolation defaults to true since Electron 12
      //   nodeIntegration defaults to false
      //   sandbox: true puts the renderer inside Chromium's OS-level sandbox.
      // The preload script only imports from 'electron' and uses
      // contextBridge.exposeInMainWorld, which is sandbox-compatible.
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true
    }
  })

  // Defense-in-depth against rogue navigation. Even with contextIsolation
  // and sandbox: true, any link or script that calls window.open() will
  // ask Electron to spawn a new BrowserWindow. We deny those outright —
  // anything that needs to leave the app should open in the user's
  // default browser via shell.openExternal, which the renderer doesn't
  // have access to without an explicit IPC call. Same for in-window
  // navigations to external URLs: we keep the renderer pinned to the
  // bundled assets / dev server.
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  win.webContents.on('will-navigate', (event, url) => {
    const allowed = isDev && process.env['ELECTRON_RENDERER_URL']
      ? url.startsWith(process.env['ELECTRON_RENDERER_URL']!)
      : url.startsWith('file://')
    if (!allowed) event.preventDefault()
  })

  // Keep the renderer's maximise/restore icon in sync with the real window
  // state (covers OS-level changes too: double-clicking the drag region,
  // snap/aero, the window menu — not just our own toggle button).
  const emitMaximizeState = (): void =>
    win.webContents.send(IPC_EVENTS.WINDOW_MAXIMIZE_CHANGED, win.isMaximized())
  win.on('maximize', emitMaximizeState)
  win.on('unmaximize', emitMaximizeState)

  if (isDev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  return win
}

app.whenReady().then(() => {
  // Set the Dock icon BEFORE creating any window. macOS shows the icon baked
  // into the .app bundle until something overrides it; in dev that's Electron's
  // default icon. Doing this first minimizes the visible swap on launch.
  if (process.platform === 'darwin' && app.dock) {
    const icon = resolveAppIcon()
    if (icon) app.dock.setIcon(icon)
  }

  const ctx = registerIpcHandlers()
  // Accelerators come from the user's saved keybindings; `settings:set`
  // rebuilds the menu when they change.
  buildAppMenu(ctx.configStore.getSettingsCategory(CONFIG_KEY.KEYBINDINGS))
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
