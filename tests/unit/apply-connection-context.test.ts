import { describe, it, expect, beforeEach, vi } from 'vitest'
import { IPC_CHANNELS } from '../../shared/ipc'

// The shared helper reaches the backend through the platform client, which is
// backed by window.electronAPI. Stub it before importing the helper.
const mockInvoke = vi.fn()
vi.stubGlobal('window', {
  electronAPI: {
    invoke: mockInvoke,
    on: vi.fn(() => vi.fn()),
  },
})

import { applyConnectionContext } from '../../src/renderer/src/lib/apply-connection-context'
import type { DriverCapabilities } from '../../src/renderer/src/stores/driver-capabilities'

const CAPABLE: DriverCapabilities = {
  hasSampleQuery: true,
  hasGetTableData: true,
  databaseSwitch: { supported: true },
}
const INCAPABLE: DriverCapabilities = { hasSampleQuery: true, hasGetTableData: true }

describe('applyConnectionContext', () => {
  beforeEach(() => {
    mockInvoke.mockReset()
    mockInvoke.mockResolvedValue(undefined)
  })

  it('switches the database when the driver declares the capability', async () => {
    await applyConnectionContext('conn-1', { database: 'analytics' }, CAPABLE)
    expect(mockInvoke).toHaveBeenCalledWith(IPC_CHANNELS.DB_SWITCH_DATABASE, 'conn-1', 'analytics')
  })

  it('skips the switch entirely when the driver does not declare it', async () => {
    await applyConnectionContext('conn-1', { database: 'analytics' }, INCAPABLE)
    expect(mockInvoke).not.toHaveBeenCalledWith(IPC_CHANNELS.DB_SWITCH_DATABASE, expect.anything(), expect.anything())
  })

  it('propagates a switch failure on a capable driver (no swallowing)', async () => {
    mockInvoke.mockImplementation((channel: string) =>
      channel === IPC_CHANNELS.DB_SWITCH_DATABASE
        ? Promise.reject(new Error('permission denied'))
        : Promise.resolve(undefined)
    )
    await expect(applyConnectionContext('conn-1', { database: 'prod' }, CAPABLE)).rejects.toThrow(/permission denied/)
  })

  it('applies the schema best-effort and does not throw when setSchema fails', async () => {
    mockInvoke.mockImplementation((channel: string) =>
      channel === IPC_CHANNELS.DB_SET_SCHEMA
        ? Promise.reject(new Error('no setSchema'))
        : Promise.resolve(undefined)
    )
    // A failing setSchema is swallowed — no capability models it yet.
    await expect(applyConnectionContext('conn-1', { database: 'app', schema: 'reporting' }, CAPABLE)).resolves.toBeUndefined()
    expect(mockInvoke).toHaveBeenCalledWith(IPC_CHANNELS.DB_SWITCH_DATABASE, 'conn-1', 'app')
    expect(mockInvoke).toHaveBeenCalledWith(IPC_CHANNELS.DB_SET_SCHEMA, 'conn-1', 'reporting')
  })

  it('does nothing when neither database nor schema is provided', async () => {
    await applyConnectionContext('conn-1', {}, CAPABLE)
    expect(mockInvoke).not.toHaveBeenCalled()
  })
})
