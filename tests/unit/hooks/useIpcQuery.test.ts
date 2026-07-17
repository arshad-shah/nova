import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useIpcQuery } from '@/hooks/useIpcQuery'
import { IPC_CHANNELS } from '@shared/ipc'

function mockInvoke(impl: (...args: unknown[]) => unknown) {
  const invoke = vi.fn(impl)
  // @ts-expect-error mocked global for the test
  globalThis.window.electronAPI = { invoke, on: vi.fn(() => () => {}) }
  return invoke
}

afterEach(() => vi.restoreAllMocks())

describe('useIpcQuery', () => {
  it('starts in a loading state with undefined data', () => {
    mockInvoke(() => new Promise(() => {})) // never resolves
    const { result } = renderHook(() => useIpcQuery(IPC_CHANNELS.PLUGINS_LIST, []))
    expect(result.current.loading).toBe(true)
    expect(result.current.data).toBeUndefined()
  })

  it('populates data and clears loading once the invoke resolves', async () => {
    const rows = [{ id: 'p1' }]
    mockInvoke(async () => rows)
    const { result } = renderHook(() => useIpcQuery(IPC_CHANNELS.PLUGINS_LIST, []))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.data).toEqual(rows)
  })

  it('swallows a rejected invoke: loading clears but data stays undefined', async () => {
    mockInvoke(async () => { throw new Error('ipc failed') })
    const { result } = renderHook(() => useIpcQuery(IPC_CHANNELS.PLUGINS_LIST, []))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.data).toBeUndefined()
  })

  it('re-invokes when deps change, forwarding the new args', async () => {
    const invoke = mockInvoke(async (_channel: unknown, name: unknown) => ({ name, trusted: true, declared: [], granted: [], info: {} }))
    const { result, rerender } = renderHook(
      ({ name }) => useIpcQuery(IPC_CHANNELS.PLUGINS_GET_PERMISSIONS, [name], [name]),
      { initialProps: { name: 'a' } },
    )
    await waitFor(() => expect(result.current.data?.name).toBe('a'))

    rerender({ name: 'b' })
    await waitFor(() => expect(result.current.data?.name).toBe('b'))
    expect(invoke).toHaveBeenCalledTimes(2)
    expect(invoke).toHaveBeenNthCalledWith(2, IPC_CHANNELS.PLUGINS_GET_PERMISSIONS, 'b')
  })

  it('does not re-invoke when rerendered with unchanged deps', async () => {
    const invoke = mockInvoke(async () => null)
    const { result, rerender } = renderHook(
      ({ name }) => useIpcQuery(IPC_CHANNELS.PLUGINS_GET_PERMISSIONS, [name], [name]),
      { initialProps: { name: 'a' } },
    )
    await waitFor(() => expect(result.current.loading).toBe(false))
    rerender({ name: 'a' })
    expect(invoke).toHaveBeenCalledTimes(1)
  })

  it('ignores a slow resolve that lands after unmount (no state update on an unmounted hook)', async () => {
    let resolve!: (v: unknown) => void
    mockInvoke(() => new Promise((r) => { resolve = r }))
    const { result, unmount } = renderHook(() => useIpcQuery(IPC_CHANNELS.PLUGINS_LIST, []))
    expect(result.current.loading).toBe(true)
    unmount()
    // Resolving after unmount must not throw or emit an act() warning from a
    // setState call on an unmounted component — the `active` guard exists for this.
    resolve([{ id: 'late' }])
    await new Promise((r) => setTimeout(r, 0))
  })

  it('a stale resolve from a superseded deps value does not clobber fresher data (the whole point of the `active` guard)', async () => {
    // Two in-flight requests: the first ('a') is slow, the second ('b') lands
    // sooner. If the effect cleanup didn't gate stale resolutions, the late
    // 'a' response would overwrite the fresher 'b' data when it finally lands.
    // Each resolve is wrapped in `act` with an explicit microtask flush so the
    // resulting state update is deterministically applied before we assert —
    // a bare `await Promise.resolve()`/`setTimeout` outside `act` leaves the
    // scheduler's flush timing unspecified and made this assertion flaky.
    const resolvers: ((v: unknown) => void)[] = []
    mockInvoke(() => new Promise((resolve) => { resolvers.push(resolve) }))
    const { result, rerender } = renderHook(
      ({ name }) => useIpcQuery(IPC_CHANNELS.PLUGINS_GET_PERMISSIONS, [name], [name]),
      { initialProps: { name: 'a' } },
    )
    rerender({ name: 'b' })
    await act(async () => {
      resolvers[1]({ name: 'b', trusted: true, declared: [], granted: [], info: {} })
      await Promise.resolve()
    })
    expect(result.current.data?.name).toBe('b')
    await act(async () => {
      resolvers[0]({ name: 'a', trusted: true, declared: [], granted: [], info: {} }) // stale, arrives late
      await Promise.resolve()
    })
    expect(result.current.data?.name).toBe('b')
  })

  it('sets loading back to true when deps change to trigger a new fetch', async () => {
    let callCount = 0
    mockInvoke(async () => {
      callCount += 1
      return callCount === 1 ? 'first' : 'second'
    })
    const { result, rerender } = renderHook(
      ({ name }) => useIpcQuery(IPC_CHANNELS.PLUGINS_GET_PERMISSIONS, [name], [name]),
      { initialProps: { name: 'a' } },
    )
    await waitFor(() => expect(result.current.data).toBe('first'))
    rerender({ name: 'b' })
    // Immediately after the dep change (before the second invoke resolves) loading is true again.
    expect(result.current.loading).toBe(true)
    await waitFor(() => expect(result.current.data).toBe('second'))
  })
})
