import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useDataNouns } from '@/hooks/useDataNouns'
import { useConnectionsStore } from '@/stores/connections'
import { useDriverCapabilitiesStore } from '@/stores/driver-capabilities'
import { IPC_CHANNELS } from '@shared/ipc'

const PROFILE = { id: 'conn-1', type: 'mongodb', name: 'test' } as never

function mockInvoke(impl: (...args: unknown[]) => unknown) {
  const invoke = vi.fn(impl)
  // @ts-expect-error mocked global for the test
  globalThis.window.electronAPI = { invoke, on: vi.fn(() => () => {}) }
  return invoke
}

beforeEach(() => {
  useConnectionsStore.setState({ connections: [], activeConnectionId: null, connectedIds: new Set(), loading: false })
  useDriverCapabilitiesStore.setState({ byType: {}, byConnection: {}, inflight: {} })
})
afterEach(() => vi.restoreAllMocks())

describe('useDataNouns', () => {
  it('falls back to generic i18n nouns when connectionId is null', () => {
    mockInvoke(async () => null)
    const { result } = renderHook(() => useDataNouns(null))
    expect(result.current.object.one).toBe('object')
    expect(result.current.field.one).toBe('field')
    expect(result.current.record.one).toBe('record')
  })

  it('falls back to generic nouns when the connection id has no matching profile', () => {
    mockInvoke(async () => null)
    const { result } = renderHook(() => useDataNouns('does-not-exist'))
    expect(result.current.object.one).toBe('object')
  })

  it("resolves the driver's declared nouns once capabilities load", async () => {
    useConnectionsStore.setState({ connections: [PROFILE] })
    mockInvoke(async (channel: unknown) => {
      if (channel === IPC_CHANNELS.DB_DRIVER_CAPABILITIES) {
        return { nouns: { object: { one: 'collection', many: 'collections' } } }
      }
      return null
    })
    const { result } = renderHook(() => useDataNouns('conn-1'))
    await waitFor(() => expect(result.current.object.one).toBe('collection'))
    // `field`/`record` weren't declared by this driver's overlay, so they still
    // fall back to the generic words rather than becoming undefined.
    expect(result.current.field.one).toBe('field')
    expect(result.current.record.one).toBe('record')
  })

  it('fetches capabilities by type at most once, caching across re-renders', async () => {
    useConnectionsStore.setState({ connections: [PROFILE] })
    const invoke = mockInvoke(async () => ({ nouns: undefined }))
    const { rerender } = renderHook(({ id }) => useDataNouns(id), { initialProps: { id: 'conn-1' as string | null } })
    await waitFor(() => expect(invoke).toHaveBeenCalled())
    const callsAfterFirst = invoke.mock.calls.length
    rerender({ id: 'conn-1' })
    rerender({ id: 'conn-1' })
    expect(invoke.mock.calls.length).toBe(callsAfterFirst)
  })

  it('swallows a rejected capabilities fetch without throwing out of the hook', async () => {
    useConnectionsStore.setState({ connections: [PROFILE] })
    mockInvoke(async () => { throw new Error('ipc down') })
    const { result } = renderHook(() => useDataNouns('conn-1'))
    // Falls back to generic nouns rather than leaving the hook in a broken state.
    await waitFor(() => expect(result.current.object.one).toBe('object'))
  })
})
