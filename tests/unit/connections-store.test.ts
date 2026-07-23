import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { ConnectionProfile } from '../../shared/types'
import { IPC_CHANNELS } from '../../shared/ipc'

const mockInvoke = vi.fn()
vi.stubGlobal('window', {
  electronAPI: {
    invoke: mockInvoke,
    on: vi.fn(() => vi.fn())
  }
})

import {
  useConnectionsStore,
  getActiveProfile,
  getProfile
} from '../../src/renderer/src/stores/connections'
import { useSchemaStore } from '../../src/renderer/src/stores/schema'
import { useTabsStore } from '../../src/renderer/src/stores/tabs'
import { useDriverCapabilitiesStore } from '../../src/renderer/src/stores/driver-capabilities'
import { useToastStore } from '../../src/renderer/src/stores/toast'
import { useNotificationsStore } from '../../src/renderer/src/stores/notifications'

const PROFILE_1: ConnectionProfile = { id: 'p1', name: 'Prod', type: 'postgresql', database: 'db' }
const PROFILE_2: ConnectionProfile = { id: 'p2', name: 'Dev', type: 'mysql', database: 'db2' }

function resetStores(): void {
  useConnectionsStore.setState({
    connections: [PROFILE_1, PROFILE_2],
    activeConnectionId: null,
    connectedIds: new Set(),
    loading: false,
  })
  useSchemaStore.setState({
    tables: new Map(),
    columns: new Map(),
    indexes: new Map(),
    schemas: new Map(),
    databases: new Map(),
    objects: new Map(),
    expandedTables: new Set(),
    filterText: '',
    rowCounts: new Map(),
    loading: false,
    cacheVersion: 0,
  })
  useDriverCapabilitiesStore.setState({ byType: {}, byConnection: {}, inflight: {} })
  useToastStore.setState({ toasts: [] })
  useNotificationsStore.setState({ notifications: [] })
}

describe('useConnectionsStore', () => {
  beforeEach(() => {
    mockInvoke.mockReset()
    mockInvoke.mockResolvedValue(undefined)
    resetStores()
  })

  it('setConnections replaces the connections list', () => {
    useConnectionsStore.getState().setConnections([PROFILE_1])
    expect(useConnectionsStore.getState().connections).toEqual([PROFILE_1])
  })

  it('setActiveConnection updates state and mirrors the id to the main process', () => {
    useConnectionsStore.getState().setActiveConnection('p1')
    expect(useConnectionsStore.getState().activeConnectionId).toBe('p1')
    expect(mockInvoke).toHaveBeenCalledWith(IPC_CHANNELS.DB_SET_ACTIVE_CONNECTION, 'p1')
  })

  it('setActiveConnection(null) clears the active connection', () => {
    useConnectionsStore.setState({ activeConnectionId: 'p1' })
    useConnectionsStore.getState().setActiveConnection(null)
    expect(useConnectionsStore.getState().activeConnectionId).toBeNull()
  })

  it('addConnected adds an id to the connected set without duplicating', () => {
    useConnectionsStore.getState().addConnected('p1')
    useConnectionsStore.getState().addConnected('p1')
    expect([...useConnectionsStore.getState().connectedIds]).toEqual(['p1'])
  })

  it('removeConnected removes an id from the connected set', () => {
    useConnectionsStore.setState({ connectedIds: new Set(['p1', 'p2']) })
    useConnectionsStore.getState().removeConnected('p1')
    expect([...useConnectionsStore.getState().connectedIds]).toEqual(['p2'])
  })

  it('setLoading toggles the loading flag', () => {
    useConnectionsStore.getState().setLoading(true)
    expect(useConnectionsStore.getState().loading).toBe(true)
  })

  it('loadConnections fetches the list over IPC and clears loading', async () => {
    mockInvoke.mockResolvedValueOnce([PROFILE_1])
    const promise = useConnectionsStore.getState().loadConnections()
    expect(useConnectionsStore.getState().loading).toBe(true)
    await promise
    expect(mockInvoke).toHaveBeenCalledWith(IPC_CHANNELS.CONNECTIONS_LIST)
    expect(useConnectionsStore.getState().connections).toEqual([PROFILE_1])
    expect(useConnectionsStore.getState().loading).toBe(false)
  })

  it('saveConnection persists the profile then reloads the connections list', async () => {
    mockInvoke.mockResolvedValueOnce(undefined) // CONNECTIONS_SAVE
    mockInvoke.mockResolvedValueOnce([PROFILE_1, PROFILE_2]) // CONNECTIONS_LIST via loadConnections
    await useConnectionsStore.getState().saveConnection(PROFILE_1)
    expect(mockInvoke).toHaveBeenNthCalledWith(1, IPC_CHANNELS.CONNECTIONS_SAVE, PROFILE_1)
    expect(mockInvoke).toHaveBeenNthCalledWith(2, IPC_CHANNELS.CONNECTIONS_LIST)
    expect(useConnectionsStore.getState().connections).toEqual([PROFILE_1, PROFILE_2])
  })

  it('deleteConnection clears activeConnectionId only when the deleted id was active', async () => {
    useConnectionsStore.setState({ activeConnectionId: 'p1' })
    mockInvoke.mockResolvedValueOnce(undefined) // CONNECTIONS_DELETE
    mockInvoke.mockResolvedValueOnce([PROFILE_2]) // CONNECTIONS_LIST
    await useConnectionsStore.getState().deleteConnection('p1')
    expect(mockInvoke).toHaveBeenCalledWith(IPC_CHANNELS.CONNECTIONS_DELETE, 'p1')
    expect(useConnectionsStore.getState().activeConnectionId).toBeNull()
  })

  it('deleteConnection leaves activeConnectionId untouched when a different id is deleted', async () => {
    useConnectionsStore.setState({ activeConnectionId: 'p2' })
    mockInvoke.mockResolvedValueOnce(undefined)
    mockInvoke.mockResolvedValueOnce([PROFILE_2])
    await useConnectionsStore.getState().deleteConnection('p1')
    expect(useConnectionsStore.getState().activeConnectionId).toBe('p2')
  })

  it('deleteConnection clears the schema cache for that connection', async () => {
    useSchemaStore.setState({ schemas: new Map([['p1', ['public']], ['p2', ['public']]]) } as Partial<
      ReturnType<typeof useSchemaStore.getState>
    >)
    mockInvoke.mockResolvedValueOnce(undefined)
    mockInvoke.mockResolvedValueOnce([PROFILE_2])
    await useConnectionsStore.getState().deleteConnection('p1')
    const s = useSchemaStore.getState()
    expect(s.schemas.has('p1')).toBe(false)
    expect(s.schemas.has('p2')).toBe(true)
  })

  it('deleteConnection detaches tabs pointing at the deleted connection', async () => {
    const detachSpy = vi.spyOn(useTabsStore.getState(), 'detachConnection')
    mockInvoke.mockResolvedValueOnce(undefined)
    mockInvoke.mockResolvedValueOnce([PROFILE_2])
    await useConnectionsStore.getState().deleteConnection('p1')
    expect(detachSpy).toHaveBeenCalledWith('p1')
    detachSpy.mockRestore()
  })

  it('deleteConnection clears cached driver capability overlays for that connection', async () => {
    useDriverCapabilitiesStore.setState({
      byConnection: { p1: { supportsTransactions: true } as unknown as never },
    })
    mockInvoke.mockResolvedValueOnce(undefined)
    mockInvoke.mockResolvedValueOnce([PROFILE_2])
    await useConnectionsStore.getState().deleteConnection('p1')
    expect(useDriverCapabilitiesStore.getState().byConnection.p1).toBeUndefined()
  })

  it('connect() on success marks the connection connected, sets it active, and adds a success notification', async () => {
    mockInvoke.mockResolvedValueOnce({ success: true }) // DB_CONNECT
    const result = await useConnectionsStore.getState().connect('p1')
    expect(result).toEqual({ success: true })
    expect(mockInvoke).toHaveBeenCalledWith(IPC_CHANNELS.DB_CONNECT, 'p1')
    const s = useConnectionsStore.getState()
    expect(s.connectedIds.has('p1')).toBe(true)
    expect(s.activeConnectionId).toBe('p1')
    const notifications = useNotificationsStore.getState().notifications
    expect(notifications[0].type).toBe('success')
  })

  it('connect() on success shows a persistent "connecting" toast that resolves to success', async () => {
    mockInvoke.mockResolvedValueOnce({ success: true })
    await useConnectionsStore.getState().connect('p1')
    const toasts = useToastStore.getState().toasts
    const toast = toasts.find((t) => t.id === 'connect-p1')
    expect(toast?.type).toBe('success')
    expect(toast?.persistent).toBe(false)
  })

  it('connect() on failure does not mark the connection connected and records an error notification', async () => {
    mockInvoke.mockResolvedValueOnce({ success: false, error: 'auth failed' })
    const result = await useConnectionsStore.getState().connect('p1')
    expect(result).toEqual({ success: false, error: 'auth failed' })
    const s = useConnectionsStore.getState()
    expect(s.connectedIds.has('p1')).toBe(false)
    expect(s.activeConnectionId).toBeNull()
    const notifications = useNotificationsStore.getState().notifications
    expect(notifications[0].type).toBe('error')
    expect(notifications[0].message).toBe('auth failed')
  })

  it('connect() on failure updates the toast to an error state with the returned message', async () => {
    mockInvoke.mockResolvedValueOnce({ success: false, error: 'auth failed' })
    await useConnectionsStore.getState().connect('p1')
    const toast = useToastStore.getState().toasts.find((t) => t.id === 'connect-p1')
    expect(toast?.type).toBe('error')
    expect(toast?.message).toBe('auth failed')
  })

  it('disconnect() removes the connection from connectedIds and clears activeConnectionId when it was active', async () => {
    useConnectionsStore.setState({ connectedIds: new Set(['p1']), activeConnectionId: 'p1' })
    mockInvoke.mockResolvedValueOnce(undefined) // DB_DISCONNECT
    await useConnectionsStore.getState().disconnect('p1')
    expect(mockInvoke).toHaveBeenCalledWith(IPC_CHANNELS.DB_DISCONNECT, 'p1')
    const s = useConnectionsStore.getState()
    expect(s.connectedIds.has('p1')).toBe(false)
    expect(s.activeConnectionId).toBeNull()
  })

  it('disconnect() leaves a different activeConnectionId untouched', async () => {
    useConnectionsStore.setState({ connectedIds: new Set(['p1']), activeConnectionId: 'p2' })
    mockInvoke.mockResolvedValueOnce(undefined)
    await useConnectionsStore.getState().disconnect('p1')
    expect(useConnectionsStore.getState().activeConnectionId).toBe('p2')
  })

  it('disconnect() clears the schema cache for that connection', async () => {
    useSchemaStore.setState({ schemas: new Map([['p1', ['public']]]) } as Partial<
      ReturnType<typeof useSchemaStore.getState>
    >)
    mockInvoke.mockResolvedValueOnce(undefined)
    await useConnectionsStore.getState().disconnect('p1')
    expect(useSchemaStore.getState().schemas.has('p1')).toBe(false)
  })

  it('disconnect() adds an info notification announcing the disconnect', async () => {
    mockInvoke.mockResolvedValueOnce(undefined)
    await useConnectionsStore.getState().disconnect('p1')
    const n = useNotificationsStore.getState().notifications[0]
    expect(n.type).toBe('info')
    expect(n.source).toEqual({ type: 'connection', id: 'p1', label: 'Prod' })
  })
})

describe('connections store profile selectors', () => {
  beforeEach(() => {
    mockInvoke.mockReset()
    mockInvoke.mockResolvedValue(undefined)
    resetStores()
  })

  it('getActiveProfile returns null when nothing is active', () => {
    expect(getActiveProfile()).toBeNull()
  })

  it('getActiveProfile returns the matching profile once one is active', () => {
    useConnectionsStore.setState({ activeConnectionId: 'p2' })
    expect(getActiveProfile()).toEqual(PROFILE_2)
  })

  it('getProfile resolves a profile by id, and null for an unknown/undefined id', () => {
    expect(getProfile('p1')).toEqual(PROFILE_1)
    expect(getProfile('missing')).toBeNull()
    expect(getProfile(undefined)).toBeNull()
    expect(getProfile(null)).toBeNull()
  })
})
