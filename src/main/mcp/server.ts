import { createServer, type Server as HttpServer, type IncomingMessage, type ServerResponse } from 'http'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js'
import { BrowserWindow } from 'electron'
import { generateToken, validateAuth, isAllowedMcpHost } from './auth'
import { findFreePort } from './find-port'
import { isWriteToolCall, jsonSchemaToZodShape } from '../plugins/sdk/tool-schema'
import type { Tool, ToolRegistry } from '../plugins/sdk/types'
import { TOOL_PERMISSION, TOOL_SURFACE } from '../plugins/sdk/types'
import type { AttentionHub } from '../attention/attention-hub'
import { IPC_EVENTS } from '@shared/ipc'
import { broadcast } from '../ipc/broadcast'
import { errorMessage } from '@shared/errors'
import { MCP_ACTIVITY_STATUS, type MCPServerStatus, type MCPStartResult, type MCPActivityEntry, type MCPApprovalRequest } from '@shared/mcp'
import { CONFIG_KEY } from '@shared/settings'

interface MCPGate { disabledTools: string[]; readOnly: boolean }

interface MCPServerDeps {
  toolRegistry: ToolRegistry
  getActiveConnectionId: () => string | null
  settingsStore: { get(key: string): unknown; set(key: string, value: unknown): void }
  /** Where the bearer token lives. Backed by the OS keyring in production so
   *  the credential isn't sitting in plaintext in config.json (where any local
   *  process could read it and defeat the loopback+token model). Injected so
   *  the server stays decoupled from the keyring and is easy to test. */
  tokenStore: { get(): string | null; set(token: string): void }
  /** Optional attention seam — when present, a pending approval is announced so
   *  the user can be alerted (e.g. an OS notification) while the window is in the
   *  background. The MCP client may be headless, so this is the only nudge. */
  attention?: AttentionHub
}

export interface MCPServerInstance {
  start: () => Promise<MCPStartResult>
  stop: () => Promise<void>
  getStatus: () => MCPServerStatus
  resolveApproval: (requestId: string, approved: boolean) => void
  getActivity: () => MCPActivityEntry[]
  /** Mint a fresh bearer token (in-memory + persisted) so getStatus reflects it
   *  even while stopped. A running server picks it up immediately — the auth
   *  check reads the live token, so existing clients are dropped on next call. */
  regenerateToken: () => void
  /** Rebuild the exposed tool set against current settings (readOnly,
   *  disabledTools) by restarting if running; no-op when stopped. */
  reload: () => Promise<void>
}

// ─── Pure decision helpers (unit-tested) ─────────────────────────────────────

export function selectExposedTools(tools: Tool[], gate: MCPGate): Tool[] {
  return tools.filter(t =>
    !gate.disabledTools.includes(t.id) &&
    !(gate.readOnly && t.permission === TOOL_PERMISSION.WRITE) &&
    (t.surfaces === undefined || t.surfaces.includes(TOOL_SURFACE.MCP))
  )
}

export function needsApprovalForCall(tool: Tool, params: Record<string, unknown>): boolean {
  return isWriteToolCall(tool.permission, params)
}

export function summarizeParams(params: Record<string, unknown>): string {
  const s = JSON.stringify(params)
  return s.length > 120 ? s.slice(0, 117) + '…' : s
}

// ─── Server ──────────────────────────────────────────────────────────────────

export function createMCPServer(deps: MCPServerDeps): MCPServerInstance {
  let httpServer: HttpServer | null = null
  let mcpServer: McpServer | null = null
  let token = ''
  let boundPort = 0
  let autoSelectedPort = false
  let transport: SSEServerTransport | null = null
  let clientCount = 0
  const activity: MCPActivityEntry[] = []
  const pendingApprovals = new Map<string, (approved: boolean) => void>()

  function gate(): MCPGate {
    return {
      disabledTools: (deps.settingsStore.get(CONFIG_KEY.MCP_DISABLED_TOOLS) as string[]) ?? [],
      readOnly: (deps.settingsStore.get(CONFIG_KEY.MCP_READ_ONLY) as boolean) ?? false,
    }
  }

  function record(entry: MCPActivityEntry): void {
    activity.push(entry)
    if (activity.length > 100) activity.shift()
    broadcast(IPC_EVENTS.MCP_ACTIVITY_EVENT, entry)
  }

  function requestApproval(tool: Tool, params: Record<string, unknown>): Promise<boolean> {
    return new Promise((resolve) => {
      const requestId = crypto.randomUUID()
      pendingApprovals.set(requestId, resolve)
      const win = BrowserWindow.getAllWindows()[0]
      if (!win) { pendingApprovals.delete(requestId); resolve(false); return }
      const req: MCPApprovalRequest = {
        requestId, toolId: tool.id, toolName: tool.name,
        sql: typeof params.sql === 'string' ? params.sql : JSON.stringify(params, null, 2),
        permission: tool.permission,
      }
      win.webContents.send(IPC_EVENTS.MCP_APPROVAL_REQUEST, req)
      deps.attention?.request({
        id: requestId,
        kind: 'approval',
        source: 'mcp',
        title: 'MCP query approval',
        body: `${tool.name}: ${req.sql.slice(0, 200)}`,
      })
      setTimeout(() => {
        if (pendingApprovals.delete(requestId)) {
          deps.attention?.resolve(requestId)
          resolve(false)
        }
      }, 5 * 60 * 1000)
    })
  }

  function resolveApproval(requestId: string, approved: boolean): void {
    const resolver = pendingApprovals.get(requestId)
    if (resolver) {
      deps.attention?.resolve(requestId)
      resolver(approved)
      pendingApprovals.delete(requestId)
    }
  }

  function buildMcpServer(): McpServer {
    const server = new McpServer({ name: 'verql', version: '0.1.0' }, { capabilities: { tools: {} } })
    const exposed = selectExposedTools(deps.toolRegistry.list(), gate())
    for (const tool of exposed) {
      server.tool(tool.id, tool.description, jsonSchemaToZodShape(tool.inputSchema), async (args: Record<string, unknown>) => {
        const startedAt = Date.now()
        const connectionId = deps.getActiveConnectionId()
        if (!connectionId) {
          record({ id: crypto.randomUUID(), timestamp: startedAt, toolId: tool.id, paramsSummary: summarizeParams(args), status: MCP_ACTIVITY_STATUS.ERROR, durationMs: 0 })
          return { content: [{ type: 'text', text: 'Error: No active database connection in Verql' }], isError: true }
        }
        if (needsApprovalForCall(tool, args)) {
          const approved = await requestApproval(tool, args)
          if (!approved) {
            record({ id: crypto.randomUUID(), timestamp: startedAt, toolId: tool.id, paramsSummary: summarizeParams(args), status: MCP_ACTIVITY_STATUS.REJECTED, durationMs: Date.now() - startedAt })
            return { content: [{ type: 'text', text: 'Query rejected by user in Verql' }], isError: true }
          }
        }
        try {
          // Route through the registry (not tool.execute) so the host's
          // activity recorder logs MCP tool calls in the unified activity log,
          // exactly like the AI loop does.
          const result = await deps.toolRegistry.execute(tool.id, args, { connectionId, abortSignal: new AbortController().signal })
          record({ id: crypto.randomUUID(), timestamp: startedAt, toolId: tool.id, paramsSummary: summarizeParams(args), status: result.success ? MCP_ACTIVITY_STATUS.OK : MCP_ACTIVITY_STATUS.ERROR, durationMs: Date.now() - startedAt })
          return { content: [{ type: 'text', text: JSON.stringify(result.data, null, 2) }], isError: !result.success }
        } catch (err) {
          record({ id: crypto.randomUUID(), timestamp: startedAt, toolId: tool.id, paramsSummary: summarizeParams(args), status: MCP_ACTIVITY_STATUS.ERROR, durationMs: Date.now() - startedAt })
          return { content: [{ type: 'text', text: `Error: ${errorMessage(err)}` }], isError: true }
        }
      })
    }
    return server
  }

  async function start(): Promise<MCPStartResult> {
    if (httpServer) await stop()

    const saved = deps.tokenStore.get()
    token = saved || generateToken()
    if (!saved) deps.tokenStore.set(token)

    const requestedPort = (deps.settingsStore.get('mcp.port') as number) || 3100
    const autoPort = (deps.settingsStore.get('mcp.autoPort') as boolean) ?? true
    let portToBind = requestedPort
    autoSelectedPort = false
    if (autoPort) {
      portToBind = await findFreePort(requestedPort, 20)
      autoSelectedPort = portToBind !== requestedPort
    }

    mcpServer = buildMcpServer()

    httpServer = createServer((req: IncomingMessage, res: ServerResponse) => {
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
      res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type')
      res.setHeader('Vary', 'Origin')
      if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return }
      // DNS-rebinding guard: reject requests whose Host header isn't loopback,
      // before auth, so a rebound hostname can't reach the local endpoint.
      if (!isAllowedMcpHost(req.headers.host, boundPort)) {
        res.writeHead(403, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Forbidden host' }))
        return
      }
      if (!validateAuth(req, token, res)) return
      const url = new URL(req.url ?? '/', `http://localhost:${boundPort}`)
      if (url.pathname === '/sse' && req.method === 'GET') {
        transport = new SSEServerTransport('/messages', res)
        clientCount++
        transport.onclose = () => { clientCount = Math.max(0, clientCount - 1); transport = null }
        mcpServer!.connect(transport).catch((err) => console.error('[mcp] SSE connection error:', err))
        return
      }
      if (url.pathname === '/messages' && req.method === 'POST') {
        if (!transport) { res.writeHead(503, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'No active SSE connection' })); return }
        let body = ''
        req.on('data', (chunk: Buffer) => { body += chunk.toString() })
        req.on('end', () => {
          try { transport!.handlePostMessage(req, res, JSON.parse(body)) }
          catch { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Invalid JSON' })) }
        })
        return
      }
      if (url.pathname === '/health') { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ status: 'ok', name: 'verql-mcp' })); return }
      res.writeHead(404); res.end('Not found')
    })

    return new Promise<MCPStartResult>((resolve, reject) => {
      httpServer!.once('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EADDRINUSE') reject(Object.assign(new Error(`Port ${portToBind} is already in use`), { code: 'EADDRINUSE', port: portToBind }))
        else reject(err)
      })
      httpServer!.listen(portToBind, '127.0.0.1', () => {
        boundPort = portToBind
        console.log(`[mcp] Server started on http://127.0.0.1:${boundPort}`)
        resolve({ port: boundPort, token, autoSelectedPort })
      })
    })
  }

  async function stop(): Promise<void> {
    if (transport) { try { await transport.close() } catch { /* */ } transport = null }
    if (mcpServer) { try { await mcpServer.close() } catch { /* */ } mcpServer = null }
    if (httpServer) { await new Promise<void>((r) => httpServer!.close(() => r())); httpServer = null }
    clientCount = 0
    console.log('[mcp] Server stopped')
  }

  function getStatus(): MCPServerStatus {
    return { running: httpServer !== null, port: boundPort, clients: clientCount, token, autoSelectedPort }
  }

  function regenerateToken(): void {
    token = generateToken()
    deps.tokenStore.set(token)
  }

  async function reload(): Promise<void> {
    if (httpServer) { await stop(); await start() }
  }

  return { start, stop, getStatus, resolveApproval, getActivity: () => [...activity], regenerateToken, reload }
}
