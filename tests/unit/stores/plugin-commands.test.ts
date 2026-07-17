import { describe, it, expect, beforeEach, vi } from 'vitest'
import { IPC_CHANNELS, IPC_EVENTS } from '@shared/ipc'

// The store registers its lifecycle listener as a side effect at module load
// time (before any test code runs), so electronAPI has to exist before the
// store module is even evaluated. vi.hoisted() runs its factory above every
// import in this file — a plain top-level assignment is NOT early enough,
// since static imports are evaluated before the rest of the module body.
const { mockInvoke, mockOn } = vi.hoisted(() => {
  const mockInvoke = vi.fn()
  const mockOn = vi.fn()
  ;(window as unknown as { electronAPI: { invoke: typeof mockInvoke; on: typeof mockOn } }).electronAPI = {
    invoke: mockInvoke,
    on: mockOn
  }
  return { mockInvoke, mockOn }
})

import { usePluginCommands, type PluginCommand } from '../../../src/renderer/src/stores/plugin-commands'

const sampleCommand: PluginCommand = {
  pluginId: 'p1',
  pluginDisplayName: 'Plugin One',
  commandId: 'do-thing',
  title: 'Do Thing'
}

function getLifecycleHandler(): (payload?: unknown) => void {
  const call = mockOn.mock.calls.find(([channel]) => channel === IPC_EVENTS.PLUGINS_LIFECYCLE)
  if (!call) throw new Error('lifecycle listener was never registered')
  return call[1] as (payload?: unknown) => void
}

describe('usePluginCommands', () => {
  beforeEach(() => {
    mockInvoke.mockReset()
    usePluginCommands.setState({ commands: [], loaded: false })
  })

  it('fetch populates commands from the IPC result and marks loaded', async () => {
    mockInvoke.mockResolvedValueOnce([sampleCommand])
    await usePluginCommands.getState().fetch()
    expect(mockInvoke).toHaveBeenCalledWith(IPC_CHANNELS.PLUGINS_GET_COMMANDS)
    expect(usePluginCommands.getState().commands).toEqual([sampleCommand])
    expect(usePluginCommands.getState().loaded).toBe(true)
  })

  it('fetch is a no-op returning an empty list when electronAPI is unavailable', async () => {
    const original = (window as unknown as { electronAPI: unknown }).electronAPI
    ;(window as unknown as { electronAPI: unknown }).electronAPI = undefined
    await usePluginCommands.getState().fetch()
    expect(usePluginCommands.getState().loaded).toBe(true)
    expect(usePluginCommands.getState().commands).toEqual([])
    expect(mockInvoke).not.toHaveBeenCalled()
    ;(window as unknown as { electronAPI: unknown }).electronAPI = original
  })

  // BUG (documented, not fixed): a failed refetch marks loaded=true but never
  // clears the previous command list. If a plugin was just uninstalled and the
  // refetch that should drop its commands happens to fail, the palette keeps
  // offering commands that belong to a plugin no longer running.
  it('fetch leaves stale commands in place when the IPC call rejects', async () => {
    usePluginCommands.setState({ commands: [sampleCommand], loaded: true })
    mockInvoke.mockRejectedValueOnce(new Error('main process unavailable'))
    await usePluginCommands.getState().fetch()
    expect(usePluginCommands.getState().commands).toEqual([sampleCommand])
    expect(usePluginCommands.getState().loaded).toBe(true)
  })

  it('execute forwards pluginId/commandId with an empty payload object', async () => {
    mockInvoke.mockResolvedValueOnce(undefined)
    await usePluginCommands.getState().execute('p1', 'do-thing')
    expect(mockInvoke).toHaveBeenCalledWith(IPC_CHANNELS.PLUGINS_UI_ACTION, 'p1', 'do-thing', {})
  })

  it('execute propagates an IPC rejection instead of swallowing it', async () => {
    mockInvoke.mockRejectedValueOnce(new Error('command failed'))
    await expect(usePluginCommands.getState().execute('p1', 'do-thing')).rejects.toThrow('command failed')
  })

  it('a plugin lifecycle broadcast (activate/deactivate/install/uninstall) triggers a refetch', async () => {
    const handler = getLifecycleHandler()
    mockInvoke.mockResolvedValueOnce([sampleCommand])

    handler({ name: 'p1', event: 'activated' })
    // fetch() runs async inside the listener; flush the microtask queue.
    await Promise.resolve()
    await Promise.resolve()

    expect(mockInvoke).toHaveBeenCalledWith(IPC_CHANNELS.PLUGINS_GET_COMMANDS)
    expect(usePluginCommands.getState().commands).toEqual([sampleCommand])
    expect(usePluginCommands.getState().loaded).toBe(true)
  })
})
