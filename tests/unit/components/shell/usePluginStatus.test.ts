import { renderHook, act, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { usePluginStatus } from '@/components/shell/status-bar/usePluginStatus'
import { useNotificationsStore } from '@/stores/notifications'
import { IPC_CHANNELS } from '@shared/ipc'

function mockPluginList(list: Array<{ status: { state: string } }>) {
  const invoke = vi.fn((channel: string) => {
    if (channel === IPC_CHANNELS.PLUGINS_LIST) return Promise.resolve(list)
    return Promise.resolve(undefined)
  })
  // @ts-expect-error mocked global for the test
  globalThis.window.electronAPI = { invoke, on: vi.fn() }
  return invoke
}

beforeEach(() => {
  useNotificationsStore.setState({ notifications: [] })
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('usePluginStatus', () => {
  it('classifies active/degraded as healthy and counts errors separately', async () => {
    mockPluginList([
      { status: { state: 'active' } },
      { status: { state: 'degraded' } },
      { status: { state: 'error' } },
    ])
    const { result } = renderHook(() => usePluginStatus())

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current).toEqual({ total: 3, active: 2, failed: 1, loading: false })
  })

  it('reports loading while any plugin is still in a transitional state', async () => {
    mockPluginList([
      { status: { state: 'active' } },
      { status: { state: 'activating' } },
    ])
    const { result } = renderHook(() => usePluginStatus())

    await waitFor(() => expect(result.current.total).toBe(2))
    // BUG-sensitive: `loading` must reflect the transitional plugin, not just
    // whether the initial fetch resolved.
    expect(result.current.loading).toBe(true)
  })

  it('falls back to a zeroed, non-loading status when the IPC call rejects', async () => {
    // @ts-expect-error mocked global for the test
    globalThis.window.electronAPI = { invoke: vi.fn().mockRejectedValue(new Error('boom')), on: vi.fn() }
    const { result } = renderHook(() => usePluginStatus())

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current).toEqual({ total: 0, active: 0, failed: 0, loading: false })
  })

  it('raises exactly one warning notification even if failures persist across polls', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    mockPluginList([{ status: { state: 'error' } }])
    renderHook(() => usePluginStatus())

    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    await act(async () => { await vi.advanceTimersByTimeAsync(2000) })
    await act(async () => { await vi.advanceTimersByTimeAsync(2000) })

    const warnings = useNotificationsStore.getState().notifications.filter((n) => n.type === 'warning')
    expect(warnings).toHaveLength(1)
  })

  it('does not notify when no plugin has failed', async () => {
    mockPluginList([{ status: { state: 'active' } }])
    const { result } = renderHook(() => usePluginStatus())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(useNotificationsStore.getState().notifications).toHaveLength(0)
  })

  it('stops polling after the 15s cutoff (interval cleared by the timeout)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const invoke = mockPluginList([{ status: { state: 'active' } }])
    renderHook(() => usePluginStatus())

    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    const callsAt0 = invoke.mock.calls.length

    // Well past the 15s cutoff; polling must have stopped, so the call count
    // should not keep growing at the 2s cadence forever.
    await act(async () => { await vi.advanceTimersByTimeAsync(30000) })
    const callsAfterCutoff = invoke.mock.calls.length

    await act(async () => { await vi.advanceTimersByTimeAsync(10000) })
    const callsMuchLater = invoke.mock.calls.length

    expect(callsAfterCutoff).toBeGreaterThan(callsAt0)
    expect(callsMuchLater).toBe(callsAfterCutoff)
  })
})
