import { useEffect } from 'react'
import { IPC_EVENTS } from '@shared/ipc'
import { MENU_ACTION, type MenuActionId } from '@shared/menus'
import { runMenuAction } from '@/components/shell/menu-model'

/** The status bar's new-connection shortcut is a plain DOM `CustomEvent`
 *  rather than an IPC one (it never leaves the renderer), but it still
 *  crosses a component boundary — `StatusBar.tsx` dispatches it, this hook
 *  listens — so the name is centralised here rather than re-typed at both
 *  ends where a typo would silently stop the shortcut from doing anything. */
export const STATUSBAR_NEW_CONNECTION_EVENT = 'statusbar:new-connection'

/**
 * Runs commands invoked from the **native** application menu — the visible menu
 * bar on macOS, and the accelerator table on every platform.
 *
 * The native menu ships an action id rather than a per-command event, and every
 * id resolves through the same registry the app-drawn menu bar uses, so a
 * command behaves identically however it was invoked. Adding a menu item needs
 * no change here: declare it in `shared/menus.ts` and give it a handler in
 * `menu-model.tsx`.
 *
 * Also handles the status bar's new-connection shortcut, which is a plain DOM
 * event rather than an IPC one.
 */
export function useShellMenuEvents(): void {
  useEffect(() => {
    // `electronAPI.on` hands callbacks `unknown` args, and this one crosses a
    // process boundary, so check the shape rather than assert it. Ids that
    // aren't in the registry are ignored by runMenuAction.
    const offMenuAction = window.electronAPI.on(IPC_EVENTS.MENU_ACTION, (action) => {
      if (typeof action === 'string') runMenuAction(action as MenuActionId)
    })

    const handleStatusBarNewConn = (): void => runMenuAction(MENU_ACTION.NEW_CONNECTION)
    window.addEventListener(STATUSBAR_NEW_CONNECTION_EVENT, handleStatusBarNewConn)

    return () => {
      window.removeEventListener(STATUSBAR_NEW_CONNECTION_EVENT, handleStatusBarNewConn)
      offMenuAction()
    }
  }, [])
}
