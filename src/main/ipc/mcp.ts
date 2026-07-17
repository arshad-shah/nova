import { createMCPServer, type MCPServerInstance } from '../mcp/server'
import { IPC_CHANNELS } from '@shared/ipc'
import type { ConnectionAccessImpl } from '../plugins/sdk/connection-access'
import type { ToolRegistry } from '../plugins/sdk/types'
import type { AttentionHub } from '../attention/attention-hub'
import type { MCPToolInfo } from '@shared/mcp'
import type { IpcContext, Handle } from './context'
import { CONFIG_KEY } from '@shared/settings'

export interface SettingsStoreFacade {
  get(key: string): unknown
  set(key: string, value: unknown): void
}

/** Reserved keyring namespace for the MCP bearer token. */
const MCP_TOKEN_NS = '__mcp__'
const MCP_TOKEN_KEY = 'token'

export function registerMcpHandlers(
  ctx: IpcContext,
  handle: Handle,
  connectionAccess: ConnectionAccessImpl,
  settingsStore: SettingsStoreFacade,
  toolRegistry: ToolRegistry,
  attention?: AttentionHub
): MCPServerInstance {
  // One-time migration: earlier builds stored the token in plaintext in
  // config.json. Move any such token into the keyring and scrub the on-disk
  // copy so the credential no longer sits readable on disk.
  const legacyToken = ctx.configStore.getSetting(CONFIG_KEY.MCP_TOKEN) as string | undefined
  if (legacyToken) {
    if (!ctx.keyring.has(MCP_TOKEN_NS, MCP_TOKEN_KEY)) {
      ctx.keyring.storeSync(MCP_TOKEN_NS, MCP_TOKEN_KEY, legacyToken)
    }
    ctx.configStore.setSetting(CONFIG_KEY.MCP_TOKEN, '')
  }

  const tokenStore = {
    get: (): string | null => ctx.keyring.retrieveSync(MCP_TOKEN_NS, MCP_TOKEN_KEY),
    set: (t: string): void => ctx.keyring.storeSync(MCP_TOKEN_NS, MCP_TOKEN_KEY, t),
  }

  const mcpServer = createMCPServer({
    toolRegistry,
    getActiveConnectionId: () => connectionAccess.getActiveConnectionId(),
    settingsStore,
    tokenStore,
    attention,
  })

  handle(IPC_CHANNELS.MCP_START, async () => {
    const result = await mcpServer.start()
    ctx.configStore.setSetting(CONFIG_KEY.MCP_ENABLED, true)
    return result
  })

  handle(IPC_CHANNELS.MCP_STOP, async () => {
    await mcpServer.stop()
    ctx.configStore.setSetting(CONFIG_KEY.MCP_ENABLED, false)
  })

  handle(IPC_CHANNELS.MCP_STATUS, async () => mcpServer.getStatus())

  handle(IPC_CHANNELS.MCP_TOOLS, async (): Promise<MCPToolInfo[]> => {
    const disabled = (ctx.configStore.getSetting(CONFIG_KEY.MCP_DISABLED_TOOLS) as string[]) ?? []
    return toolRegistry.list().map(t => ({
      id: t.id, name: t.name, description: t.description, permission: t.permission,
      enabled: !disabled.includes(t.id),
    }))
  })

  handle(IPC_CHANNELS.MCP_SET_TOOL_ENABLED, async (toolId, enabled) => {
    const disabled = new Set((ctx.configStore.getSetting(CONFIG_KEY.MCP_DISABLED_TOOLS) as string[]) ?? [])
    if (enabled) disabled.delete(toolId)
    else disabled.add(toolId)
    ctx.configStore.setSetting(CONFIG_KEY.MCP_DISABLED_TOOLS, [...disabled])
    // Rebuild the exposed tool set so the change takes effect on a live server.
    await mcpServer.reload()
  })

  handle(IPC_CHANNELS.MCP_ACTIVITY, async () => mcpServer.getActivity())

  handle(IPC_CHANNELS.MCP_REGENERATE_TOKEN, async () => {
    // Mints + persists a fresh token and updates the in-memory token, so the
    // returned status reflects it whether the server is running or stopped.
    mcpServer.regenerateToken()
    return mcpServer.getStatus()
  })

  // Rebuild the exposed tool set against current settings (e.g. after the
  // read-only toggle changes). No-op when the server is stopped.
  handle(IPC_CHANNELS.MCP_RELOAD, async () => {
    await mcpServer.reload()
    return mcpServer.getStatus()
  })

  handle(IPC_CHANNELS.MCP_APPROVAL_RESPONSE, async (requestId, approved) => {
    mcpServer.resolveApproval(requestId, approved)
  })

  return mcpServer
}
