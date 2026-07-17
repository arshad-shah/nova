import { describe, it, expect, beforeEach, vi } from 'vitest'
import { IPC_CHANNELS, IPC_EVENTS } from '@shared/ipc'

// The module registers its lifecycle listener as a side effect at import
// time, guarded by a globalThis flag against double-registration (HMR /
// repeated test imports). electronAPI must exist before the module is
// evaluated — static imports run before the rest of this file's body, so a
// plain top-level assignment would be too late. vi.hoisted() hoists the
// factory above every import to guarantee ordering.
const { mockInvoke, mockOn } = vi.hoisted(() => {
  const mockInvoke = vi.fn()
  const mockOn = vi.fn()
  ;(window as unknown as { electronAPI: { invoke: typeof mockInvoke; on: typeof mockOn } }).electronAPI = {
    invoke: mockInvoke,
    on: mockOn
  }
  return { mockInvoke, mockOn }
})

import { usePluginLifecycleStore } from '../../../src/renderer/src/stores/plugin-lifecycle'

function getLifecycleHandler(): (payload?: unknown) => void {
  const call = mockOn.mock.calls.find(([channel]) => channel === IPC_EVENTS.PLUGINS_LIFECYCLE)
  if (!call) throw new Error('lifecycle listener was never registered')
  return call[1] as (payload?: unknown) => void
}

describe('usePluginLifecycleStore', () => {
  beforeEach(() => {
    mockInvoke.mockReset()
    usePluginLifecycleStore.setState({ pending: null })
  })

  it('setPending stores the change verbatim', () => {
    usePluginLifecycleStore.getState().setPending({ name: 'sql-formatter', event: 'installed' })
    expect(usePluginLifecycleStore.getState().pending).toEqual({ name: 'sql-formatter', event: 'installed' })
  })

  it('dismiss clears pending back to null', () => {
    usePluginLifecycleStore.setState({ pending: { name: 'sql-formatter', event: 'installed' } })
    usePluginLifecycleStore.getState().dismiss()
    expect(usePluginLifecycleStore.getState().pending).toBeNull()
  })

  it('restart invokes the app-restart IPC channel', async () => {
    mockInvoke.mockResolvedValueOnce(undefined)
    await usePluginLifecycleStore.getState().restart()
    expect(mockInvoke).toHaveBeenCalledWith(IPC_CHANNELS.APP_RESTART)
  })

  it('restart propagates a rejection instead of swallowing it', async () => {
    mockInvoke.mockRejectedValueOnce(new Error('restart denied'))
    await expect(usePluginLifecycleStore.getState().restart()).rejects.toThrow('restart denied')
  })

  it('ignores a broadcast payload missing name or event, leaving pending untouched', () => {
    const handler = getLifecycleHandler()
    handler(undefined)
    expect(usePluginLifecycleStore.getState().pending).toBeNull()
    handler({})
    expect(usePluginLifecycleStore.getState().pending).toBeNull()
    handler({ name: 'p1' }) // missing event
    expect(usePluginLifecycleStore.getState().pending).toBeNull()
    handler({ event: 'activated' }) // missing name
    expect(usePluginLifecycleStore.getState().pending).toBeNull()
  })

  it('a well-formed broadcast sets pending to the new change', () => {
    const handler = getLifecycleHandler()
    handler({ name: 'p1', event: 'activated' })
    expect(usePluginLifecycleStore.getState().pending).toEqual({ name: 'p1', event: 'activated' })
  })

  it('suppresses an exact duplicate broadcast without re-notifying subscribers', () => {
    const handler = getLifecycleHandler()
    const notified = vi.fn()
    const unsub = usePluginLifecycleStore.subscribe(notified)

    handler({ name: 'p1', event: 'activated' })
    expect(notified).toHaveBeenCalledTimes(1)

    handler({ name: 'p1', event: 'activated' }) // identical repeat
    expect(notified).toHaveBeenCalledTimes(1) // no redundant re-render trigger

    handler({ name: 'p1', event: 'deactivated' }) // different event for same plugin
    expect(notified).toHaveBeenCalledTimes(2)

    unsub()
  })

  it('registers the lifecycle listener only once across repeated module imports (HMR guard)', async () => {
    const callsBefore = mockOn.mock.calls.filter(([c]) => c === IPC_EVENTS.PLUGINS_LIFECYCLE).length
    expect(callsBefore).toBeGreaterThan(0)

    vi.resetModules()
    await import('../../../src/renderer/src/stores/plugin-lifecycle')

    const callsAfter = mockOn.mock.calls.filter(([c]) => c === IPC_EVENTS.PLUGINS_LIFECYCLE).length
    // globalThis.__pluginLifecycleListenerInstalled survives resetModules(),
    // so a second import must not double-register the broadcast listener.
    expect(callsAfter).toBe(callsBefore)
  })
})
