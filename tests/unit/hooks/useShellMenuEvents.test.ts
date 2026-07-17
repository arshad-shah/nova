import { renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useShellMenuEvents } from '@/hooks/useShellMenuEvents'
import { IPC_EVENTS } from '@shared/ipc'
import { MENU_ACTION } from '@shared/menus'
import { runMenuAction } from '@/components/shell/menu-model'

// runMenuAction is the shared registry the hook is wiring events *to* — it is
// its own well-tested unit, so mock it here and assert the hook dispatches to
// it correctly rather than re-testing every menu action's effect.
vi.mock('@/components/shell/menu-model', () => ({ runMenuAction: vi.fn() }))

function mockOn() {
  const listeners = new Map<string, (payload: unknown) => void>()
  const on = vi.fn((channel: string, cb: (payload: unknown) => void) => {
    listeners.set(channel, cb)
    // Real unsubscribe removes the ipcRenderer listener; mirror that so a
    // post-unmount emit in the test proves cleanup actually happened instead
    // of just proving the mock's `vi.fn()` was invoked.
    return vi.fn(() => listeners.delete(channel))
  })
  // @ts-expect-error mocked global for the test
  globalThis.window.electronAPI = { invoke: vi.fn(), on }
  return { on, emit: (channel: string, payload: unknown) => listeners.get(channel)?.(payload) }
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.mocked(runMenuAction).mockClear()
})

describe('useShellMenuEvents', () => {
  it('runs the action when the main process sends a string menu:action id', () => {
    const { emit } = mockOn()
    renderHook(() => useShellMenuEvents())
    emit(IPC_EVENTS.MENU_ACTION, MENU_ACTION.SAVE)
    expect(runMenuAction).toHaveBeenCalledExactlyOnceWith(MENU_ACTION.SAVE)
  })

  it('ignores a non-string payload instead of forwarding it blindly', () => {
    const { emit } = mockOn()
    renderHook(() => useShellMenuEvents())
    emit(IPC_EVENTS.MENU_ACTION, { not: 'a string' })
    emit(IPC_EVENTS.MENU_ACTION, null)
    emit(IPC_EVENTS.MENU_ACTION, 42)
    expect(runMenuAction).not.toHaveBeenCalled()
  })

  it('translates the status bar new-connection DOM event into the NEW_CONNECTION menu action', () => {
    mockOn()
    renderHook(() => useShellMenuEvents())
    window.dispatchEvent(new Event('statusbar:new-connection'))
    expect(runMenuAction).toHaveBeenCalledExactlyOnceWith(MENU_ACTION.NEW_CONNECTION)
  })

  it('unsubscribes the IPC listener and removes the DOM listener on unmount', () => {
    const { on, emit } = mockOn()
    const unsubscribe = on.mock.results // will inspect via the returned fn
    const removeSpy = vi.spyOn(window, 'removeEventListener')
    const { unmount } = renderHook(() => useShellMenuEvents())
    unmount()

    // The unsubscribe fn returned by `on` was called on cleanup.
    expect(unsubscribe[0].value).toHaveBeenCalledTimes(1)
    expect(removeSpy.mock.calls.map((c) => c[0])).toContain('statusbar:new-connection')

    // And after unmount, neither surface still dispatches.
    emit(IPC_EVENTS.MENU_ACTION, MENU_ACTION.SAVE)
    window.dispatchEvent(new Event('statusbar:new-connection'))
    expect(runMenuAction).not.toHaveBeenCalled()
  })
})
