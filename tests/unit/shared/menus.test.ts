import { describe, it, expect } from 'vitest'
import { menusFor, itemAccelerator, resolveAccelerator, MENU_ACTION, type MenuNode } from '../../../shared/menus'
import { KEYBINDING_ACTION, defaultSettings } from '../../../shared/settings'

const keybindings = defaultSettings.keybindings

/** Every command a surface exposes. Separators and the pure-OS role entries
 *  (Services, Quit, Zoom…) carry no id and aren't app commands. */
function commandIds(surface: 'native' | 'appbar', isMac: boolean, isDev = false): string[] {
  return menusFor(surface, isMac, isDev)
    .flatMap((m) => m.items)
    .filter((i): i is Extract<MenuNode, { kind: 'item' }> => i.kind === 'item')
    .map((i) => i.id)
    .filter((id): id is string => !!id)
}

function menuIds(surface: 'native' | 'appbar', isMac: boolean, isDev = false): string[] {
  return menusFor(surface, isMac, isDev).map((m) => m.id)
}

describe('the shared menu tree', () => {
  // The regression this model exists to prevent: the macOS native menu was
  // declared separately from the Windows/Linux bar and silently lost commands.
  it('offers macOS every command the Windows/Linux bar has', () => {
    const mac = new Set(commandIds('native', true))
    const missing = commandIds('appbar', false).filter((id) => !mac.has(id))
    expect(missing).toEqual([])
  })

  it('gives macOS the Query menu', () => {
    expect(menuIds('native', true)).toContain('query')
    for (const id of [MENU_ACTION.RUN, MENU_ACTION.RUN_SELECTION, MENU_ACTION.SAVE, MENU_ACTION.FORMAT_DOCUMENT]) {
      expect(commandIds('native', true)).toContain(id)
    }
  })

  it('reaches Settings, Find and the panel toggles on macOS', () => {
    const mac = commandIds('native', true)
    for (const id of [
      MENU_ACTION.SETTINGS, MENU_ACTION.FIND, MENU_ACTION.CLOSE_TAB, MENU_ACTION.REOPEN_TAB,
      MENU_ACTION.TOGGLE_SIDEBAR, MENU_ACTION.TOGGLE_SECONDARY_SIDEBAR, MENU_ACTION.TOGGLE_BOTTOM_DOCK,
      MENU_ACTION.WELCOME, MENU_ACTION.WHATS_NEW,
    ]) {
      expect(mac).toContain(id)
    }
  })
})

describe('platform conventions', () => {
  it('puts Settings in the macOS app menu at Cmd+, and under File elsewhere', () => {
    const macApp = menusFor('native', true, false).find((m) => m.id === 'app')
    const settings = macApp?.items.find(
      (i): i is Extract<MenuNode, { kind: 'item' }> => i.kind === 'item' && i.id === MENU_ACTION.SETTINGS,
    )
    expect(settings?.accelerator).toBe('Cmd+,')

    const macFile = menusFor('native', true, false).find((m) => m.id === 'file')
    expect(macFile?.items.some((i) => i.kind === 'item' && i.id === MENU_ACTION.SETTINGS)).toBe(false)

    const winFile = menusFor('appbar', false, false).find((m) => m.id === 'file')
    expect(winFile?.items.some((i) => i.kind === 'item' && i.id === MENU_ACTION.SETTINGS)).toBe(true)
  })

  it('offers Settings exactly once per platform', () => {
    expect(commandIds('native', true).filter((id) => id === MENU_ACTION.SETTINGS)).toHaveLength(1)
    expect(commandIds('native', false).filter((id) => id === MENU_ACTION.SETTINGS)).toHaveLength(1)
  })

  it('keeps the app menu off non-mac and out of the app-drawn bar', () => {
    expect(menuIds('native', false)).not.toContain('app')
    expect(menuIds('appbar', true)).not.toContain('app')
  })

  it('leaves OS window management to the native menu', () => {
    expect(menuIds('native', true)).toContain('window')
    expect(menuIds('appbar', false)).not.toContain('window')
  })

  it('surfaces About in the app menu on macOS and the Help menu elsewhere', () => {
    const macApp = menusFor('native', true, false).find((m) => m.id === 'app')
    expect(macApp?.items.some((i) => i.kind === 'item' && i.id === MENU_ACTION.ABOUT)).toBe(true)

    const macHelp = menusFor('native', true, false).find((m) => m.id === 'help')
    expect(macHelp?.items.some((i) => i.kind === 'item' && i.id === MENU_ACTION.ABOUT)).toBe(false)

    const winHelp = menusFor('appbar', false, false).find((m) => m.id === 'help')
    expect(winHelp?.items.some((i) => i.kind === 'item' && i.id === MENU_ACTION.ABOUT)).toBe(true)
  })

  // Every About entry routes to the app's own modal — no `role: 'about'`
  // anywhere — so the brand surface is identical on every platform.
  it('never falls back to the native About panel', () => {
    for (const isMac of [true, false]) {
      const roles = menusFor('native', isMac, false)
        .flatMap((m) => m.items)
        .filter((i): i is Extract<MenuNode, { kind: 'item' }> => i.kind === 'item')
        .map((i) => i.nativeRole)
      expect(roles).not.toContain('about')
    }
  })
})

describe('gating', () => {
  it('hides dev-only entries outside dev', () => {
    expect(commandIds('native', true, false)).not.toContain(MENU_ACTION.TOGGLE_DEV_TOOLS)
    expect(commandIds('native', true, true)).toContain(MENU_ACTION.TOGGLE_DEV_TOOLS)
  })

  it('never leaves a dangling or doubled separator behind after gating', () => {
    for (const surface of ['native', 'appbar'] as const) {
      for (const isMac of [true, false]) {
        for (const isDev of [true, false]) {
          for (const menu of menusFor(surface, isMac, isDev)) {
            const kinds = menu.items.map((i) => i.kind)
            expect(kinds[0], `${surface}/${menu.id} starts with a separator`).not.toBe('separator')
            expect(kinds[kinds.length - 1], `${surface}/${menu.id} ends with a separator`).not.toBe('separator')
            expect(
              kinds.some((k, i) => k === 'separator' && kinds[i + 1] === 'separator'),
              `${surface}/${menu.id} has doubled separators`,
            ).toBe(false)
          }
        }
      }
    }
  })

  it('gives every app-bar item an id to dispatch', () => {
    for (const isMac of [true, false]) {
      for (const menu of menusFor('appbar', isMac, true)) {
        for (const item of menu.items) {
          if (item.kind !== 'item') continue
          expect(item.id, `${menu.id} has an item with no id`).toBeTruthy()
        }
      }
    }
  })
})

describe('accelerators', () => {
  it('picks the Cmd binding on mac and the Ctrl binding elsewhere', () => {
    expect(resolveAccelerator(keybindings, KEYBINDING_ACTION.EXECUTE_QUERY, true)).toBe('Cmd+Enter')
    expect(resolveAccelerator(keybindings, KEYBINDING_ACTION.EXECUTE_QUERY, false)).toBe('Ctrl+Enter')
  })

  it('is undefined for an action with no binding', () => {
    expect(resolveAccelerator([], KEYBINDING_ACTION.EXECUTE_QUERY, true)).toBeUndefined()
  })

  // A rebind has to move the native accelerator too, or the stale key keeps
  // firing the command and the renderer never sees the new one.
  it('follows a rebind rather than the shipped default', () => {
    const rebound = keybindings.map((k) =>
      k.id === KEYBINDING_ACTION.SAVE_QUERY ? { ...k, keys: ['Ctrl+Alt+S', 'Cmd+Alt+S'] } : k,
    )
    expect(resolveAccelerator(rebound, KEYBINDING_ACTION.SAVE_QUERY, true)).toBe('Cmd+Alt+S')
  })

  it('reads a rebindable item from the bindings and a fixed item from the spec', () => {
    const run: Extract<MenuNode, { kind: 'item' }> = {
      kind: 'item', id: MENU_ACTION.RUN, keybinding: KEYBINDING_ACTION.EXECUTE_QUERY,
    }
    expect(itemAccelerator(run, keybindings, true)).toBe('Cmd+Enter')

    const format: Extract<MenuNode, { kind: 'item' }> = {
      kind: 'item', id: MENU_ACTION.FORMAT_DOCUMENT, accelerator: 'Shift+Alt+F',
    }
    expect(itemAccelerator(format, keybindings, true)).toBe('Shift+Alt+F')
  })
})
