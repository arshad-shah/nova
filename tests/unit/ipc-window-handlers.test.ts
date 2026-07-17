// src/main/ipc/window.ts backs the custom title bar and the renderer-driven
// "open link" action. WINDOW_OPEN_EXTERNAL in particular is a trust-boundary
// handler: the renderer (including any web content rendered inside a query
// result, AI response, or plugin panel) can ask the main process to open an
// arbitrary string as a URL. If that check ever loosens, a renderer bug or a
// malicious plugin could get the main process to shell out to `file://`,
// `javascript:`, or an OS-specific handler URI.
import { describe, it, expect, beforeEach, vi } from 'vitest'

const { openExternalMock, execFileMock } = vi.hoisted(() => ({
  openExternalMock: vi.fn(async () => {}),
  execFileMock: vi.fn(),
}))

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
  BrowserWindow: { fromWebContents: vi.fn() },
  Menu: { getApplicationMenu: vi.fn(() => null) },
  shell: { openExternal: openExternalMock },
}))

vi.mock('node:child_process', () => ({ execFile: execFileMock, default: { execFile: execFileMock } }))
// Not WSL on the CI/dev host this suite runs on — keep os.release() boring so
// the WSL branch stays off and we test the primary path.
vi.mock('node:os', () => ({ default: { release: () => 'Darwin Kernel Version' } }))

import { ipcMain } from 'electron'
import { registerWindowHandlers, trafficLightY, TRAFFIC_LIGHT_SIZE } from '../../src/main/ipc/window'
import { IPC_CHANNELS } from '../../shared/ipc'

type Handler = (event: unknown, ...args: unknown[]) => unknown

function getHandlers(): Map<string, Handler> {
  const handlers = new Map<string, Handler>()
  ;(ipcMain.handle as ReturnType<typeof vi.fn>).mockImplementation((channel: string, fn: Handler) => {
    handlers.set(channel, fn)
  })
  registerWindowHandlers()
  return handlers
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('window:open-external — URL scheme gate', () => {
  it('opens a plain http URL', () => {
    const handlers = getHandlers()
    handlers.get(IPC_CHANNELS.WINDOW_OPEN_EXTERNAL)!({}, 'http://example.com')
    expect(openExternalMock).toHaveBeenCalledWith('http://example.com')
  })

  it('opens a plain https URL', () => {
    const handlers = getHandlers()
    handlers.get(IPC_CHANNELS.WINDOW_OPEN_EXTERNAL)!({}, 'https://example.com/path?x=1')
    expect(openExternalMock).toHaveBeenCalledWith('https://example.com/path?x=1')
  })

  it('refuses a javascript: URI (XSS-via-open-external vector)', () => {
    const handlers = getHandlers()
    handlers.get(IPC_CHANNELS.WINDOW_OPEN_EXTERNAL)!({}, 'javascript:alert(1)')
    expect(openExternalMock).not.toHaveBeenCalled()
  })

  it('refuses a file:// URI (local filesystem disclosure vector)', () => {
    const handlers = getHandlers()
    handlers.get(IPC_CHANNELS.WINDOW_OPEN_EXTERNAL)!({}, 'file:///etc/passwd')
    expect(openExternalMock).not.toHaveBeenCalled()
  })

  it('refuses a scheme that merely starts with "http" but is not http(s) (e.g. httpx://)', () => {
    const handlers = getHandlers()
    handlers.get(IPC_CHANNELS.WINDOW_OPEN_EXTERNAL)!({}, 'httpx://evil.example')
    expect(openExternalMock).not.toHaveBeenCalled()
  })

  it('refuses a non-string payload instead of coercing it to a URL', () => {
    const handlers = getHandlers()
    // A compromised or buggy renderer could send an object/number/null;
    // the handler must not attempt shell.openExternal(String(payload)).
    handlers.get(IPC_CHANNELS.WINDOW_OPEN_EXTERNAL)!({}, { toString: () => 'http://example.com' })
    expect(openExternalMock).not.toHaveBeenCalled()
  })

  it('accepts an uppercase scheme (HTTPS://) — the check is case-insensitive', () => {
    const handlers = getHandlers()
    handlers.get(IPC_CHANNELS.WINDOW_OPEN_EXTERNAL)!({}, 'HTTPS://example.com')
    expect(openExternalMock).toHaveBeenCalledWith('HTTPS://example.com')
  })
})

// These run on darwin in this environment (process.platform), which is the
// only platform where WINDOW_SET_TITLEBAR_HEIGHT does anything.
describe.runIf(process.platform === 'darwin')('window:set-titlebar-height — input validation', () => {
  it('ignores non-finite height (NaN) without touching the window', async () => {
    const win = { setWindowButtonPosition: vi.fn() }
    ;(await import('electron')).BrowserWindow.fromWebContents = vi.fn(() => win) as never
    const handlers = getHandlers()
    handlers.get(IPC_CHANNELS.WINDOW_SET_TITLEBAR_HEIGHT)!({}, NaN)
    expect(win.setWindowButtonPosition).not.toHaveBeenCalled()
  })

  it('ignores a zero or negative height', async () => {
    const win = { setWindowButtonPosition: vi.fn() }
    ;(await import('electron')).BrowserWindow.fromWebContents = vi.fn(() => win) as never
    const handlers = getHandlers()
    handlers.get(IPC_CHANNELS.WINDOW_SET_TITLEBAR_HEIGHT)!({}, 0)
    handlers.get(IPC_CHANNELS.WINDOW_SET_TITLEBAR_HEIGHT)!({}, -10)
    expect(win.setWindowButtonPosition).not.toHaveBeenCalled()
  })

  it('positions the traffic lights for a valid positive height', async () => {
    const win = { setWindowButtonPosition: vi.fn() }
    ;(await import('electron')).BrowserWindow.fromWebContents = vi.fn(() => win) as never
    const handlers = getHandlers()
    handlers.get(IPC_CHANNELS.WINDOW_SET_TITLEBAR_HEIGHT)!({}, 40)
    expect(win.setWindowButtonPosition).toHaveBeenCalledWith({ x: 15, y: trafficLightY(40) })
  })
})

describe('trafficLightY', () => {
  it('centres the fixed-size traffic lights within the given bar height', () => {
    expect(trafficLightY(40)).toBe(Math.round((40 - TRAFFIC_LIGHT_SIZE) / 2))
  })

  it('never returns a negative offset for a bar shorter than the traffic lights', () => {
    expect(trafficLightY(2)).toBe(0)
  })
})

/** A BrowserWindow stub whose isMaximized() actually reflects maximize()/
 *  unmaximize() calls, so the handler's "read state, act, read state again to
 *  report the result" logic is exercised for real instead of against a
 *  static mock. */
function makeStatefulWindow(startMaximized: boolean) {
  let maximized = startMaximized
  return {
    isMaximized: vi.fn(() => maximized),
    maximize: vi.fn(() => { maximized = true }),
    unmaximize: vi.fn(() => { maximized = false }),
  }
}

describe('window:toggle-maximize', () => {
  it('maximizes when not currently maximized, and reports the new (true) state', async () => {
    const win = makeStatefulWindow(false)
    ;(await import('electron')).BrowserWindow.fromWebContents = vi.fn(() => win) as never
    const handlers = getHandlers()
    const result = handlers.get(IPC_CHANNELS.WINDOW_TOGGLE_MAXIMIZE)!({})
    expect(win.maximize).toHaveBeenCalled()
    expect(win.unmaximize).not.toHaveBeenCalled()
    expect(result).toBe(true)
  })

  it('unmaximizes when currently maximized, and reports the new (false) state', async () => {
    const win = makeStatefulWindow(true)
    ;(await import('electron')).BrowserWindow.fromWebContents = vi.fn(() => win) as never
    const handlers = getHandlers()
    const result = handlers.get(IPC_CHANNELS.WINDOW_TOGGLE_MAXIMIZE)!({})
    expect(win.unmaximize).toHaveBeenCalled()
    expect(win.maximize).not.toHaveBeenCalled()
    expect(result).toBe(false)
  })

  it('returns false (not true) when there is no resolvable window for the event', async () => {
    ;(await import('electron')).BrowserWindow.fromWebContents = vi.fn(() => null) as never
    const handlers = getHandlers()
    const result = handlers.get(IPC_CHANNELS.WINDOW_TOGGLE_MAXIMIZE)!({})
    expect(result).toBe(false)
  })
})

describe('window:menu:popup', () => {
  it('is a no-op (does not throw) when the submenu id is out of range', async () => {
    const menu = { items: [{ label: 'File', submenu: { popup: vi.fn() } }] }
    ;(await import('electron')).Menu.getApplicationMenu = vi.fn(() => menu) as never
    const win = { }
    ;(await import('electron')).BrowserWindow.fromWebContents = vi.fn(() => win) as never
    const handlers = getHandlers()
    expect(() =>
      handlers.get(IPC_CHANNELS.WINDOW_MENU_POPUP)!({}, { id: 99, x: 1.4, y: 2.6 }),
    ).not.toThrow()
    expect(menu.items[0].submenu.popup).not.toHaveBeenCalled()
  })

  it('rounds fractional coordinates before calling submenu.popup', async () => {
    const popup = vi.fn()
    const menu = { items: [{ label: 'File', submenu: { popup } }] }
    ;(await import('electron')).Menu.getApplicationMenu = vi.fn(() => menu) as never
    const win = {}
    ;(await import('electron')).BrowserWindow.fromWebContents = vi.fn(() => win) as never
    const handlers = getHandlers()
    handlers.get(IPC_CHANNELS.WINDOW_MENU_POPUP)!({}, { id: 0, x: 1.4, y: 2.6 })
    expect(popup).toHaveBeenCalledWith({ window: win, x: 1, y: 3 })
  })
})
