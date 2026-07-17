import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { IPC_CHANNELS, IPC_EVENTS } from '@shared/ipc'

// The contributions-changed listener is registered at module import time, so
// electronAPI must exist before the module is evaluated. Static imports run
// before the rest of this file's body, so a plain top-level assignment would
// be too late; vi.hoisted() hoists the factory above every import.
const { mockInvoke, mockOn } = vi.hoisted(() => {
  const mockInvoke = vi.fn()
  const mockOn = vi.fn()
  ;(window as unknown as { electronAPI: { invoke: typeof mockInvoke; on: typeof mockOn } }).electronAPI = {
    invoke: mockInvoke,
    on: mockOn
  }
  return { mockInvoke, mockOn }
})

import { usePluginUIStore, selectContributions } from '../../../src/renderer/src/stores/plugin-ui'

describe('usePluginUIStore', () => {
  beforeEach(() => {
    mockInvoke.mockReset()
    usePluginUIStore.setState({ contributions: {}, resolverCache: {} })
  })

  it('fetchContributions stores the result keyed by surface without clobbering other surfaces', async () => {
    mockInvoke.mockResolvedValueOnce([{ id: 'w1' }])
    await usePluginUIStore.getState().fetchContributions('statusBar')
    mockInvoke.mockResolvedValueOnce([{ id: 'w2' }])
    await usePluginUIStore.getState().fetchContributions('panels')

    expect(usePluginUIStore.getState().contributions.statusBar).toEqual([{ id: 'w1' }])
    expect(usePluginUIStore.getState().contributions.panels).toEqual([{ id: 'w2' }])
    expect(mockInvoke).toHaveBeenNthCalledWith(1, IPC_CHANNELS.PLUGINS_UI_GET_CONTRIBUTIONS, 'statusBar')
    expect(mockInvoke).toHaveBeenNthCalledWith(2, IPC_CHANNELS.PLUGINS_UI_GET_CONTRIBUTIONS, 'panels')
  })

  it('selectContributions returns a stable EMPTY reference for a surface with no data', () => {
    const selector = selectContributions('activityBar')
    const first = selector(usePluginUIStore.getState())
    const second = selector(usePluginUIStore.getState())
    // Same array identity matters here: a fresh [] every call would defeat
    // memoized selectors and cause needless re-renders.
    expect(first).toBe(second)
    expect(first).toEqual([])
  })

  it('resolveOptions caches by resolverId+connectionId, skipping a second IPC round-trip', async () => {
    mockInvoke.mockResolvedValueOnce([{ value: 'a', label: 'A' }])
    const first = await usePluginUIStore.getState().resolveOptions('p1', 'schemas', 'conn-1')
    const second = await usePluginUIStore.getState().resolveOptions('p1', 'schemas', 'conn-1')

    expect(mockInvoke).toHaveBeenCalledTimes(1)
    expect(second).toBe(first)
  })

  it('resolveOptions issues a fresh request for a different connectionId', async () => {
    mockInvoke.mockResolvedValueOnce([{ value: 'a', label: 'A' }])
    await usePluginUIStore.getState().resolveOptions('p1', 'schemas', 'conn-1')
    mockInvoke.mockResolvedValueOnce([{ value: 'b', label: 'B' }])
    const result = await usePluginUIStore.getState().resolveOptions('p1', 'schemas', 'conn-2')

    expect(mockInvoke).toHaveBeenCalledTimes(2)
    expect(result).toEqual([{ value: 'b', label: 'B' }])
  })

  // BUG (documented, not fixed): the cache key is `${resolverId}:${connectionId}`
  // and never includes pluginId, even though pluginId is a parameter. Two
  // different plugins that happen to register a resolver with the same id
  // for the same connection will silently share (and overwrite) each other's
  // cached options with no second IPC call and no error.
  it('BUG: resolveOptions cache ignores pluginId, so a second plugin sharing a resolverId gets the first plugin\'s cached data', async () => {
    mockInvoke.mockResolvedValueOnce([{ value: 'from-plugin-a', label: 'A' }])
    const fromA = await usePluginUIStore.getState().resolveOptions('plugin-a', 'shared-resolver', 'conn-1')
    const fromB = await usePluginUIStore.getState().resolveOptions('plugin-b', 'shared-resolver', 'conn-1')

    expect(mockInvoke).toHaveBeenCalledTimes(1)
    expect(fromB).toBe(fromA)
  })

  it('executeAction forwards the payload untouched, including falsy values', async () => {
    mockInvoke.mockResolvedValueOnce(undefined)
    await usePluginUIStore.getState().executeAction('p1', 'do-thing', { count: 0, note: '' })
    expect(mockInvoke).toHaveBeenCalledWith(IPC_CHANNELS.PLUGINS_UI_ACTION, 'p1', 'do-thing', { count: 0, note: '' })
  })

  it('invalidateResolver removes only the targeted cache entry', async () => {
    mockInvoke.mockResolvedValueOnce([{ value: 'a', label: 'A' }])
    await usePluginUIStore.getState().resolveOptions('p1', 'schemas', 'conn-1')
    mockInvoke.mockResolvedValueOnce([{ value: 'b', label: 'B' }])
    await usePluginUIStore.getState().resolveOptions('p1', 'tables', 'conn-1')

    usePluginUIStore.getState().invalidateResolver('schemas', 'conn-1')

    expect(usePluginUIStore.getState().resolverCache['schemas:conn-1']).toBeUndefined()
    expect(usePluginUIStore.getState().resolverCache['tables:conn-1']).toEqual([{ value: 'b', label: 'B' }])

    // The invalidated key must actually trigger a real IPC call next time.
    mockInvoke.mockResolvedValueOnce([{ value: 'a2', label: 'A2' }])
    const refetched = await usePluginUIStore.getState().resolveOptions('p1', 'schemas', 'conn-1')
    expect(refetched).toEqual([{ value: 'a2', label: 'A2' }])
    expect(mockInvoke).toHaveBeenCalledTimes(3)
  })

  it('invalidateResolver on an unknown key is a harmless no-op', () => {
    usePluginUIStore.setState({ resolverCache: { 'schemas:conn-1': [{ value: 'a', label: 'A' }] } })
    usePluginUIStore.getState().invalidateResolver('does-not-exist', 'conn-9')
    expect(usePluginUIStore.getState().resolverCache['schemas:conn-1']).toEqual([{ value: 'a', label: 'A' }])
  })

  it('invalidateAll clears both contributions and the resolver cache', async () => {
    mockInvoke.mockResolvedValueOnce([{ value: 'a', label: 'A' }])
    await usePluginUIStore.getState().resolveOptions('p1', 'schemas', 'conn-1')
    mockInvoke.mockResolvedValueOnce([{ id: 'w1' }])
    await usePluginUIStore.getState().fetchContributions('statusBar')

    usePluginUIStore.getState().invalidateAll()

    expect(usePluginUIStore.getState().resolverCache).toEqual({})
    expect(usePluginUIStore.getState().contributions).toEqual({})
  })
})

describe('usePluginUIStore contributions-changed listener', () => {
  beforeEach(() => {
    mockInvoke.mockReset()
    mockInvoke.mockResolvedValue([])
    usePluginUIStore.setState({ contributions: {}, resolverCache: {} })
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('debounces rapid contributions-changed broadcasts into a single refetch pass', async () => {
    const call = mockOn.mock.calls.find(([c]) => c === IPC_EVENTS.PLUGINS_UI_CONTRIBUTIONS_CHANGED)
    expect(call).toBeTruthy()
    const handler = call![1] as () => void

    usePluginUIStore.setState({ resolverCache: { 'x:y': [{ value: '1', label: '1' }] } })

    handler()
    await vi.advanceTimersByTimeAsync(100)
    handler() // fires again inside the debounce window; should reset the timer
    await vi.advanceTimersByTimeAsync(100)
    expect(mockInvoke).not.toHaveBeenCalled() // only 200ms since the LAST call

    await vi.advanceTimersByTimeAsync(300)

    // invalidateAll() runs first, then exactly one round of 5 surface fetches.
    expect(usePluginUIStore.getState().resolverCache).toEqual({})
    expect(mockInvoke).toHaveBeenCalledTimes(5)
    const surfaces = mockInvoke.mock.calls.map((c) => c[1])
    expect(surfaces.sort()).toEqual(['activityBar', 'contextMenu', 'panels', 'slot', 'statusBar'])
  })

  // The previous test only proves a refetch eventually happens somewhere in a
  // 500ms window, which passes even if the second call() is silently dropped
  // instead of restarting the 300ms window (a broken debounce that just fires
  // on the FIRST call's original schedule would also land inside that window).
  // Pin the exact firing time so a dropped reset is distinguishable from a
  // real reset: with a true reset, the clock restarts at the second handler()
  // call, so nothing must have fired yet at 300ms after that second call minus
  // one tick, and it must fire by the 300ms mark.
  it('a second broadcast inside the debounce window truly restarts the 300ms clock', async () => {
    const call = mockOn.mock.calls.find(([c]) => c === IPC_EVENTS.PLUGINS_UI_CONTRIBUTIONS_CHANGED)
    const handler = call![1] as () => void

    handler() // t=0; a broken (non-resetting) debounce would fire this at t=300
    await vi.advanceTimersByTimeAsync(100)
    handler() // t=100; a correct debounce now fires at t=400, not t=300

    // At t=299 (199ms after the second call) a correct reset has not fired yet,
    // but a dropped reset already did at t=300 one tick earlier — either way
    // this bound alone wouldn't distinguish them, so go past the broken
    // implementation's t=300 firing point while still short of the real one.
    await vi.advanceTimersByTimeAsync(249) // now at t=349: past 300, short of 400
    expect(mockInvoke).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(51) // now at t=400: the real reset fires
    expect(mockInvoke).toHaveBeenCalledTimes(5)
  })
})
