import { BrowserWindow } from 'electron'
import type { WebContents } from 'electron'
import type { IpcEventMap } from '@shared/ipc'

/**
 * Send a typed broadcast event to every open (non-destroyed) renderer window —
 * the single home for the main → renderer push that IPC handlers and subsystems
 * used to hand-roll as a `BrowserWindow.getAllWindows().forEach(...send)` loop.
 *
 * Typed by `IpcEventMap`, so the payload must match the event's contract: a
 * wrong shape is now a compile error instead of an untyped `webContents.send`.
 */
export function broadcast<E extends keyof IpcEventMap>(event: E, ...payload: IpcEventMap[E]): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) sendTo(win.webContents, event, ...payload)
  }
}

/**
 * Send a typed event to one specific window's `WebContents` — the same
 * `IpcEventMap` contract as {@link broadcast}, for the cases that target a
 * single window (a menu click's own window, the window state of one frame, an
 * approval prompt on the focused window) rather than every renderer.
 *
 * Prefer this over a raw `webContents.send`: it is the one typed emit boundary,
 * so a wrong payload shape is a compile error here too. A thin pass-through —
 * callers guard window liveness where they already have the `BrowserWindow`
 * (as `broadcast` does), matching the pre-existing per-window `send` behaviour.
 */
export function sendTo<E extends keyof IpcEventMap>(
  target: WebContents,
  event: E,
  ...payload: IpcEventMap[E]
): void {
  target.send(event, ...payload)
}
