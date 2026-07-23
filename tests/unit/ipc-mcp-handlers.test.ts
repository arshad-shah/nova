// src/main/ipc/mcp.ts wires the renderer's MCP settings panel to the actual
// MCP server (src/main/mcp/server.ts). We fake createMCPServer (a
// collaborator, not the unit under test) so we can assert: the legacy
// plaintext-token migration into the keyring, the enabled/disabled-tools
// persistence round-trip, and that each handler calls through to the right
// server method and returns its result.
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { createMCPServerMock } = vi.hoisted(() => ({
  createMCPServerMock: vi.fn(),
}))

vi.mock('../../src/main/mcp/server', () => ({
  createMCPServer: createMCPServerMock,
}))

import { registerMcpHandlers } from '../../src/main/ipc/mcp'
import { IPC_CHANNELS } from '../../shared/ipc'
import { CONFIG_KEY } from '../../shared/settings'
import type { IpcContext, Handle } from '../../src/main/ipc/context'
import type { IpcChannelMap } from '../../shared/ipc'
import type { ConnectionAccessImpl } from '../../src/main/plugins/sdk/connection-access'
import type { ToolRegistry } from '../../src/main/plugins/sdk/types'

function makeFakeServer() {
  return {
    start: vi.fn(async () => ({ ok: true })),
    stop: vi.fn(async () => {}),
    getStatus: vi.fn(() => ({ running: true, port: 4111, token: 'tok' })),
    getActivity: vi.fn(() => [{ id: '1' }]),
    resolveApproval: vi.fn(),
    regenerateToken: vi.fn(),
    reload: vi.fn(async () => {}),
  }
}

function harness(opts: {
  legacyToken?: string
  hasKeyringToken?: boolean
  disabledTools?: string[]
} = {}) {
  const fakeServer = makeFakeServer()
  createMCPServerMock.mockReturnValue(fakeServer)

  const handlers = new Map<string, (...a: unknown[]) => unknown>()
  const handle = ((ch: string, fn: (...a: unknown[]) => unknown) => handlers.set(ch, fn)) as unknown as Handle

  const settings = new Map<string, unknown>()
  settings.set(CONFIG_KEY.MCP_TOKEN, opts.legacyToken ?? '')
  settings.set(CONFIG_KEY.MCP_DISABLED_TOOLS, opts.disabledTools ?? [])

  const keyringStore = new Map<string, string>()
  if (opts.hasKeyringToken) keyringStore.set('__mcp__:token', 'already-there')

  const keyring = {
    has: vi.fn((ns: string, key: string) => keyringStore.has(`${ns}:${key}`)),
    storeSync: vi.fn((ns: string, key: string, value: string) => keyringStore.set(`${ns}:${key}`, value)),
    retrieveSync: vi.fn((ns: string, key: string) => keyringStore.get(`${ns}:${key}`) ?? null),
  }

  const ctx = {
    configStore: {
      getSetting: vi.fn((key: string) => settings.get(key)),
      setSetting: vi.fn((key: string, value: unknown) => settings.set(key, value)),
    },
    keyring,
  } as unknown as IpcContext

  const connectionAccess = { getActiveConnectionId: () => 'conn-1' } as unknown as ConnectionAccessImpl
  const settingsStore = { get: vi.fn(), set: vi.fn() }
  const toolRegistry = {
    list: vi.fn(() => [
      { id: 'tool-a', name: 'Tool A', description: 'does a', permission: 'read' },
      { id: 'tool-b', name: 'Tool B', description: 'does b', permission: 'write' },
    ]),
  } as unknown as ToolRegistry

  registerMcpHandlers(ctx, handle, connectionAccess, settingsStore, toolRegistry)

  const invoke = (<K extends keyof IpcChannelMap>(channel: K, ...args: IpcChannelMap[K]['args']) => {
    const fn = handlers.get(channel)
    if (!fn) throw new Error(`No handler for ${channel}`)
    return Promise.resolve(fn(...args))
  }) as <K extends keyof IpcChannelMap>(channel: K, ...args: IpcChannelMap[K]['args']) => Promise<IpcChannelMap[K]['return']>

  return { invoke, ctx, fakeServer, keyring, keyringStore, settings }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('registerMcpHandlers — legacy plaintext token migration', () => {
  it('moves a legacy plaintext token into the keyring and scrubs it from config, when the keyring has none yet', () => {
    const { keyringStore, settings } = harness({ legacyToken: 'plain-old-token', hasKeyringToken: false })
    expect(keyringStore.get('__mcp__:token')).toBe('plain-old-token')
    expect(settings.get(CONFIG_KEY.MCP_TOKEN)).toBe('')
  })

  it('does not overwrite an existing keyring token with the legacy config value', () => {
    const { keyringStore, settings } = harness({ legacyToken: 'stale-plain-token', hasKeyringToken: true })
    expect(keyringStore.get('__mcp__:token')).toBe('already-there')
    // The on-disk copy is still scrubbed even when nothing was migrated.
    expect(settings.get(CONFIG_KEY.MCP_TOKEN)).toBe('')
  })

  it('does nothing when there is no legacy token at all', () => {
    const { keyring } = harness({ legacyToken: '' })
    expect(keyring.storeSync).not.toHaveBeenCalled()
  })
})

describe('mcp:start / mcp:stop', () => {
  it('starts the server and persists mcp.enabled=true', async () => {
    const { invoke, fakeServer, settings } = harness()
    const result = await invoke('mcp:start')
    expect(fakeServer.start).toHaveBeenCalled()
    expect(result).toEqual({ ok: true })
    expect(settings.get(CONFIG_KEY.MCP_ENABLED)).toBe(true)
  })

  it('stops the server and persists mcp.enabled=false', async () => {
    const { invoke, fakeServer, settings } = harness()
    await invoke('mcp:stop')
    expect(fakeServer.stop).toHaveBeenCalled()
    expect(settings.get(CONFIG_KEY.MCP_ENABLED)).toBe(false)
  })
})

describe('mcp:status / mcp:activity', () => {
  it('returns the server status', async () => {
    const { invoke, fakeServer } = harness()
    const result = await invoke('mcp:status')
    expect(result).toEqual(fakeServer.getStatus())
  })

  it('returns the server activity log', async () => {
    const { invoke, fakeServer } = harness()
    const result = await invoke('mcp:activity')
    expect(result).toEqual(fakeServer.getActivity())
  })
})

describe('mcp:tools — enabled flag derives from the disabled-tools setting', () => {
  it('marks every tool enabled when nothing is disabled', async () => {
    const { invoke } = harness({ disabledTools: [] })
    const result = await invoke('mcp:tools')
    expect(result).toEqual([
      { id: 'tool-a', name: 'Tool A', description: 'does a', permission: 'read', enabled: true },
      { id: 'tool-b', name: 'Tool B', description: 'does b', permission: 'write', enabled: true },
    ])
  })

  it('marks a disabled tool as enabled:false without affecting others', async () => {
    const { invoke } = harness({ disabledTools: ['tool-b'] })
    const result = await invoke('mcp:tools')
    expect(result).toEqual([
      { id: 'tool-a', name: 'Tool A', description: 'does a', permission: 'read', enabled: true },
      { id: 'tool-b', name: 'Tool B', description: 'does b', permission: 'write', enabled: false },
    ])
  })
})

describe('mcp:set-tool-enabled', () => {
  it('adds a tool to the disabled set when disabling it, and reloads the server', async () => {
    const { invoke, fakeServer, settings } = harness({ disabledTools: [] })
    await invoke('mcp:set-tool-enabled', 'tool-a', false)
    expect(settings.get(CONFIG_KEY.MCP_DISABLED_TOOLS)).toEqual(['tool-a'])
    expect(fakeServer.reload).toHaveBeenCalled()
  })

  it('removes a tool from the disabled set when re-enabling it', async () => {
    const { invoke, settings } = harness({ disabledTools: ['tool-a', 'tool-b'] })
    await invoke('mcp:set-tool-enabled', 'tool-a', true)
    expect(settings.get(CONFIG_KEY.MCP_DISABLED_TOOLS)).toEqual(['tool-b'])
  })

  it('is idempotent — disabling an already-disabled tool does not duplicate it', async () => {
    const { invoke, settings } = harness({ disabledTools: ['tool-a'] })
    await invoke('mcp:set-tool-enabled', 'tool-a', false)
    expect(settings.get(CONFIG_KEY.MCP_DISABLED_TOOLS)).toEqual(['tool-a'])
  })
})

describe('mcp:regenerate-token', () => {
  it('regenerates the token and returns fresh status', async () => {
    const { invoke, fakeServer } = harness()
    const result = await invoke('mcp:regenerate-token')
    expect(fakeServer.regenerateToken).toHaveBeenCalled()
    expect(result).toEqual(fakeServer.getStatus())
  })
})

describe('mcp:reload', () => {
  it('reloads the server and returns fresh status', async () => {
    const { invoke, fakeServer } = harness()
    const result = await invoke('mcp:reload')
    expect(fakeServer.reload).toHaveBeenCalled()
    expect(result).toEqual(fakeServer.getStatus())
  })
})

describe('mcp:approval-response', () => {
  it('forwards requestId + approved straight through to the server', async () => {
    const { invoke, fakeServer } = harness()
    await invoke('mcp:approval-response', 'req-42', true)
    expect(fakeServer.resolveApproval).toHaveBeenCalledWith('req-42', true)
  })
})
