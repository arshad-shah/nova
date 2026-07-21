// initAppActionBridge wires the main process's agentic perform_app_action
// tool call to the renderer's App-Action registry. It has no test coverage
// anywhere (app-actions.test.ts / app-actions-open-settings.test.ts only
// exercise the registry and builtins directly, never this IPC entry point).
// The module (and the registry it talks to) has load-time singleton state,
// so each test resets modules and re-imports BOTH together — importing the
// registry only at the top of the file would register actions on an
// instance the freshly-imported bridge never sees.
import { describe, it, expect, vi } from 'vitest'
import { IPC_CHANNELS, IPC_EVENTS } from '@shared/ipc'
import type { AppAction } from '../../src/renderer/src/lib/app-actions/types'

async function freshBridge() {
  vi.resetModules()
  const invoke = vi.fn().mockResolvedValue(undefined)
  const onHandlers: Record<string, (payload: unknown) => unknown> = {}
  const on = vi.fn((event: string, handler: (payload: unknown) => unknown) => {
    onHandlers[event] = handler
    return () => { delete onHandlers[event] }
  })
  // @ts-expect-error test override
  globalThis.window.electronAPI = { invoke, on }
  // toast is imported by bridge.ts too — fetch the SAME (freshly reset)
  // instance rather than the one this test file imported statically, or
  // toast assertions would read from a store the bridge never writes to.
  const { appActions } = await import('../../src/renderer/src/lib/app-actions/registry')
  const { useToastStore } = await import('../../src/renderer/src/stores/toast')
  const bridge = await import('../../src/renderer/src/lib/app-actions/bridge')
  bridge.initAppActionBridge()
  const fire = async (payload: unknown) => {
    await onHandlers[IPC_EVENTS.APP_ACTION_PERFORM]?.(payload)
  }
  return { invoke, on, fire, appActions, bridge, useToastStore }
}

describe('initAppActionBridge', () => {
  it('does nothing when electronAPI is unavailable — no throw, nothing registered', async () => {
    vi.resetModules()
    // @ts-expect-error test override
    globalThis.window.electronAPI = undefined
    const mod = await import('../../src/renderer/src/lib/app-actions/bridge')
    expect(() => mod.initAppActionBridge()).not.toThrow()
  })

  it('registers exactly one APP_ACTION_PERFORM listener even if called twice', async () => {
    const { on, bridge } = await freshBridge()
    bridge.initAppActionBridge() // second call — should be a no-op (module-level `initialized` guard)
    const calls = on.mock.calls.filter((c) => c[0] === IPC_EVENTS.APP_ACTION_PERFORM)
    expect(calls).toHaveLength(1)
  })

  it('ignores a malformed payload missing requestId/actionId without reporting a result', async () => {
    const { invoke, fire } = await freshBridge()
    await fire({})
    await fire({ requestId: 'r1' }) // no actionId
    await fire(undefined)
    expect(invoke).not.toHaveBeenCalled()
  })

  it('reports failure for an unknown action id', async () => {
    const { invoke, fire } = await freshBridge()
    await fire({ requestId: 'r1', actionId: 'does-not-exist', params: {} })
    expect(invoke).toHaveBeenCalledWith(IPC_CHANNELS.APP_ACTION_RESULT, {
      requestId: 'r1', success: false, error: 'Unknown action: does-not-exist',
    })
  })

  it('refuses to auto-run a mutating action and reports why, without calling its handler', async () => {
    const { invoke, fire, appActions } = await freshBridge()
    const run = vi.fn()
    const mutating: AppAction = { id: 'delete-thing', title: 'Delete Thing', description: '', kind: 'mutating', run }
    appActions.register(mutating)
    await fire({ requestId: 'r2', actionId: 'delete-thing', params: {} })
    expect(run).not.toHaveBeenCalled()
    expect(invoke).toHaveBeenCalledWith(IPC_CHANNELS.APP_ACTION_RESULT, {
      requestId: 'r2', success: false, error: '"Delete Thing" changes data and needs the user to confirm it.',
    })
  })

  it('runs a navigation action with the given params and reports success, without a toast', async () => {
    const { invoke, fire, appActions, useToastStore } = await freshBridge()
    const run = vi.fn()
    const nav: AppAction = { id: 'go-somewhere', title: 'Go', description: '', kind: 'navigation', run }
    appActions.register(nav)
    await fire({ requestId: 'r3', actionId: 'go-somewhere', params: { x: 1 } })
    expect(run).toHaveBeenCalledWith({ x: 1 })
    expect(invoke).toHaveBeenCalledWith(IPC_CHANNELS.APP_ACTION_RESULT, { requestId: 'r3', success: true })
    expect(useToastStore.getState().toasts).toHaveLength(0)
  })

  it('defaults params to {} when the payload omits them', async () => {
    const { fire, appActions } = await freshBridge()
    const run = vi.fn()
    appActions.register({ id: 'no-params', title: 'No Params', description: '', kind: 'navigation', run })
    await fire({ requestId: 'r4', actionId: 'no-params' })
    expect(run).toHaveBeenCalledWith({})
  })

  it('reports a thrown error and raises a toast with the action title and error message', async () => {
    const { invoke, fire, appActions, useToastStore } = await freshBridge()
    const run = vi.fn(() => { throw new Error('no active connection') })
    appActions.register({ id: 'boom', title: 'Boom Action', description: '', kind: 'navigation', run })
    await fire({ requestId: 'r5', actionId: 'boom', params: {} })
    expect(invoke).toHaveBeenCalledWith(IPC_CHANNELS.APP_ACTION_RESULT, {
      requestId: 'r5', success: false, error: 'no active connection',
    })
    const toast = useToastStore.getState().toasts[0]
    expect(toast.type).toBe('error')
    expect(toast.title).toBe(`Couldn't boom action`)
    expect(toast.message).toBe('no active connection')
  })

  it('stringifies a non-Error thrown value for both the IPC result and the toast', async () => {
    const { invoke, fire, appActions } = await freshBridge()
    const run = vi.fn(() => { throw 'plain string failure' })
    appActions.register({ id: 'weird-throw', title: 'Weird', description: '', kind: 'navigation', run })
    await fire({ requestId: 'r6', actionId: 'weird-throw', params: {} })
    expect(invoke).toHaveBeenCalledWith(IPC_CHANNELS.APP_ACTION_RESULT, {
      requestId: 'r6', success: false, error: 'plain string failure',
    })
  })

  it('awaits an async action and only reports the result after it settles', async () => {
    const { invoke, fire, appActions } = await freshBridge()
    let resolveRun!: () => void
    const run = vi.fn(() => new Promise<void>((res) => { resolveRun = res }))
    appActions.register({ id: 'async-action', title: 'Async', description: '', kind: 'navigation', run })
    const pending = fire({ requestId: 'r7', actionId: 'async-action', params: {} })
    expect(invoke).not.toHaveBeenCalled()
    resolveRun()
    await pending
    expect(invoke).toHaveBeenCalledWith(IPC_CHANNELS.APP_ACTION_RESULT, { requestId: 'r7', success: true })
  })
})
