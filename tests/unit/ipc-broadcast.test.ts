// src/main/ipc/broadcast.ts is the one main->renderer push chokepoint. A bug
// here (sending to a destroyed window, or dropping windows) silently breaks
// live updates (settings changes, activity stream, theme reload) across the
// whole app, so it is worth pinning directly rather than trusting every call
// site to get BrowserWindow.getAllWindows() right.
import { describe, it, expect, vi } from 'vitest'

const { getAllWindowsMock } = vi.hoisted(() => ({ getAllWindowsMock: vi.fn() }))

vi.mock('electron', () => ({
  BrowserWindow: { getAllWindows: getAllWindowsMock },
}))

import { broadcast } from '../../src/main/ipc/broadcast'
import { IPC_EVENTS } from '../../shared/ipc'

function fakeWindow(destroyed: boolean) {
  return {
    isDestroyed: () => destroyed,
    webContents: { send: vi.fn() },
  }
}

describe('broadcast', () => {
  it('sends the event + payload to every live window', () => {
    const a = fakeWindow(false)
    const b = fakeWindow(false)
    getAllWindowsMock.mockReturnValue([a, b])

    broadcast(IPC_EVENTS.THEMES_CHANGED)

    expect(a.webContents.send).toHaveBeenCalledWith(IPC_EVENTS.THEMES_CHANGED)
    expect(b.webContents.send).toHaveBeenCalledWith(IPC_EVENTS.THEMES_CHANGED)
  })

  it('skips a destroyed window instead of sending into a torn-down webContents', () => {
    const alive = fakeWindow(false)
    const dead = fakeWindow(true)
    getAllWindowsMock.mockReturnValue([dead, alive])

    broadcast(IPC_EVENTS.THEMES_CHANGED)

    expect(dead.webContents.send).not.toHaveBeenCalled()
    expect(alive.webContents.send).toHaveBeenCalled()
  })

  it('forwards multi-argument event payloads positionally, in order', () => {
    const win = fakeWindow(false)
    getAllWindowsMock.mockReturnValue([win])

    broadcast(IPC_EVENTS.SETTINGS_CHANGED, 'appearance.theme', 'light')

    expect(win.webContents.send).toHaveBeenCalledWith(
      IPC_EVENTS.SETTINGS_CHANGED,
      'appearance.theme',
      'light',
    )
  })

  it('does not throw when there are no open windows at all', () => {
    getAllWindowsMock.mockReturnValue([])
    expect(() => broadcast(IPC_EVENTS.THEMES_CHANGED)).not.toThrow()
  })
})
