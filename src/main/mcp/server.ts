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
import { broadcast, sendTo } from '../ipc/broadcast'
import { errorMessage } from '@shared/errors'
import { MCP_ACTIVITY_STATUS, type MCPServerStatus, type MCPStartResult, type MCPActivityEntry, type MCPApprovalRequest } from '@shared/mcp'
import { CONFIG_KEY } from '@shared/settings'

interface MCPGate { disabledTools: string[]; readOnly: boolean }

/**
 * Max bytes accepted for a POST /messages request body. MCP JSON-RPC messages
 * are small — a tool call plus its arguments — so 1 MiB sits far above any
 * legitimate request while still bounding how much a single request can force
 * the *main* process to allocate. The body accumulates in the main process
 * (not a worker), so an unbounded read would take the whole app down, and the
 * realistic trigger is a buggy or runaway MCP client — precisely the
 * population this endpoint serves.
 */
export const MAX_MCP_BODY_BYTES = 1024 * 1024

/** Rejection raised by {@link readRequestBody} when the body exceeds its cap. */
export interface BodyTooLargeError extends Error { code: 'BODY_TOO_LARGE' }

/**
 * Assemble a request body from its data chunks, correctly and with a size cap.
 *
 * Two things this does that the naive `body += chunk.toString()` did not:
 *  - **Decode once.** Chunks are collected as Buffers and decoded a single time
 *    with `Buffer.concat(...).toString('utf8')`. Decoding each TCP chunk
 *    independently corrupts any multi-byte character that straddles a chunk
 *    boundary (it becomes U+FFFD), silently altering the body once a payload is
 *    large enough to fragment and its content is non-ASCII.
 *  - **Cap by byte length.** `size` tracks `chunk.length` (bytes), never string
 *    length, which would undercount multi-byte input. On exceed we stop
 *    accumulating, pause the stream, and reject with a `BODY_TOO_LARGE` code so
 *    the caller can answer 413 and tear the connection down.
 */
export function readRequestBody(req: IncomingMessage, maxBytes = MAX_MCP_BODY_BYTES): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    let settled = false
    req.on('data', (chunk: Buffer) => {
      if (settled) return
      size += chunk.length // byte length — string .length would undercount multi-byte input
      if (size > maxBytes) {
        settled = true
        chunks.length = 0 // release what we buffered; do not keep accumulating
        req.pause() // stop 'data' events so a runaway client can't grow memory further
        const err = Object.assign(new Error('Request body exceeds maximum size'), { code: 'BODY_TOO_LARGE' as const })
        reject(err)
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      if (settled) return
      settled = true
      resolve(Buffer.concat(chunks).toString('utf8'))
    })
    req.on('error', (err) => {
      if (settled) return
      settled = true
      reject(err)
    })
  })
}

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
      sendTo(win.webContents, IPC_EVENTS.MCP_APPROVAL_REQUEST, req)
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
        readRequestBody(req).then((body) => {
          try { transport!.handlePostMessage(req, res, JSON.parse(body)) }
          catch { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Invalid JSON' })) }
        }).catch((err: unknown) => {
          if ((err as { code?: string })?.code === 'BODY_TOO_LARGE') {
            if (!res.headersSent) {
              res.writeHead(413, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ error: 'Request body too large' }))
            }
            // Tear the connection down once the 413 is flushed so a runaway
            // client stops uploading; destroying before flush could truncate it.
            res.on('finish', () => req.destroy())
          } else if (!res.headersSent) {
            res.writeHead(400, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: 'Invalid request' }))
          }
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
