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
  /**
   * The tool-call payload the user is being asked to approve, as opaque text.
   * Engine-neutral: **never assume this is SQL.** For a SQL query tool it is the
   * statement; for any other tool (a Mongo/Redis command, a structured action)
   * it is the tool's parameters serialized for display. Approving a non-SQL tool
   * call must never present a JSON blob under a field that claims to be `sql` —
   * that mislabels what the human is granting. Pair with {@link language} so the
   * renderer highlights it in the right syntax rather than hardcoding SQL.
   */
  statement: string
  /**
   * Editor language id used to syntax-highlight {@link statement} (e.g. `'sql'`
   * for a SQL statement, `'json'` for serialized params). The renderer must read
   * this instead of assuming SQL; unknown values degrade to plain text.
   */
  language: string
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
