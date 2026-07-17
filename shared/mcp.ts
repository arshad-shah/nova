export interface MCPServerStatus {
  running: boolean
  port: number
  clients: number
  token: string
  autoSelectedPort: boolean
}

/** A tool's declared (or MCP-approval-gated) permission — read-only vs. able to
 *  write/mutate. Centralised because it crosses the plugin SDK (`Tool.permission`),
 *  the MCP server, and the IPC boundary into the renderer's approval dialog +
 *  MCP settings list, none of which may drift from each other. */
export const TOOL_PERMISSION = {
  READ: 'read',
  WRITE: 'write',
} as const
export type ToolPermission = (typeof TOOL_PERMISSION)[keyof typeof TOOL_PERMISSION]

export interface MCPToolInfo {
  id: string
  name: string
  description: string
  permission: ToolPermission
  enabled: boolean
}

/** Outcome of a single MCP tool call, surfaced from `mcp/server.ts` to the
 *  renderer's MCP settings activity list over IPC. */
export const MCP_ACTIVITY_STATUS = {
  OK: 'ok',
  ERROR: 'error',
  REJECTED: 'rejected',
} as const
export type McpActivityStatus = (typeof MCP_ACTIVITY_STATUS)[keyof typeof MCP_ACTIVITY_STATUS]

export interface MCPActivityEntry {
  id: string
  timestamp: number
  toolId: string
  paramsSummary: string
  status: McpActivityStatus
  durationMs: number
}

export interface MCPApprovalRequest {
  requestId: string
  toolId: string
  toolName: string
  sql: string
  permission: ToolPermission
}

export interface MCPStartResult {
  port: number
  token: string
  autoSelectedPort: boolean
}

export function buildMcpClientConfig(opts: { port: number; token: string }): {
  mcpServers: { verql: { type: 'sse'; url: string; headers: { Authorization: string } } }
} {
  return {
    mcpServers: {
      verql: {
        type: 'sse',
        url: `http://localhost:${opts.port}/sse`,
        headers: { Authorization: `Bearer ${opts.token}` }
      }
    }
  }
}
