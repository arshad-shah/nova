// End-to-end tests for the MCP HTTP surface — the actual external attack
// surface: a tokenised loopback endpoint that hands out DB tool access.
// selectExposedTools/needsApprovalForCall/summarizeParams (pure helpers) and
// regenerateToken are already covered by tests/unit/mcp/server-gating.test.ts;
// this file drives the real http.Server + a real MCP SDK Client over SSE, so
// it exercises the actual request dispatch, auth wiring, approval gate, and
// activity log — the parts a pure-function test can't reach.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { createServer, request as httpRequest } from 'http'
import { connect as netConnect } from 'net'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js'
import { MAX_MCP_BODY_BYTES } from '../../../src/main/mcp/server'

// electron's BrowserWindow list drives both the approval-request notification
// and generic `broadcast()`; tests mutate this array to simulate a window
// being open or the app running fully headless (no window at all).
let windows: Array<{ isDestroyed: () => boolean; webContents: { send: ReturnType<typeof vi.fn> } }> = []
vi.mock('electron', () => ({
  BrowserWindow: { getAllWindows: () => windows },
}))

import { createMCPServer, type MCPServerInstance } from '../../../src/main/mcp/server'
import { ToolRegistryImpl } from '../../../src/main/plugins/sdk/tool-registry'
import { toJsonSchema } from '../../../src/main/plugins/sdk/tool-schema'
import type { Tool } from '../../../src/main/plugins/sdk/types'

function makeTool(id: string, permission: 'read' | 'write', execute?: Tool['execute']): Tool {
  return {
    id,
    name: id,
    description: id,
    permission,
    inputSchema: toJsonSchema(z.object({ sql: z.string().optional() })),
    execute: execute ?? (async () => ({ success: true, data: { echoed: id } })),
  }
}

function fakeWindow() {
  return { isDestroyed: () => false, webContents: { send: vi.fn() } }
}

/** Poll for a condition instead of a fixed sleep — avoids both flakiness
 *  (too short) and slow tests (too long) around the real network round trip
 *  a tool call makes before its side effects (e.g. the approval IPC send)
 *  land. */
async function waitFor(predicate: () => boolean, timeoutMs = 2000): Promise<void> {
  const start = Date.now()
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) throw new Error('waitFor: timed out')
    await new Promise((r) => setTimeout(r, 5))
  }
}

// Each server in this file gets its own never-reused port base. Reusing a
// port across two DIFFERENT server instances (start -> stop -> start on the
// same number) confuses undici's keep-alive connection pool, which happily
// hands a fresh request a socket that belonged to the now-closed previous
// server and blows up with ECONNRESET — a test-harness footgun, not a
// product bug. Spacing bases by 40 keeps every server's autoPort search
// (which probes up to 20 ports) from ever overlapping another's.
let portBase = 21000
function nextPortBase(): number {
  portBase += 40
  return portBase
}

interface RawServer {
  server: MCPServerInstance
  registry: ToolRegistryImpl
  settings: Map<string, unknown>
  port: number
  token: string
  close: () => Promise<void>
}

/** Starts a real createMCPServer with no MCP client attached — for tests
 *  that only need to poke the raw HTTP surface (CORS, host guard, auth). */
async function startServer(opts?: {
  connectionId?: string | null
  disabledTools?: string[]
  readOnly?: boolean
  tools?: Tool[]
  port?: number
  autoPort?: boolean
}): Promise<RawServer> {
  const registry = new ToolRegistryImpl()
  for (const t of opts?.tools ?? []) registry.register(t)
  const settings = new Map<string, unknown>()
  settings.set('mcp.disabledTools', opts?.disabledTools ?? [])
  settings.set('mcp.readOnly', opts?.readOnly ?? false)
  settings.set('mcp.port', opts?.port ?? nextPortBase())
  settings.set('mcp.autoPort', opts?.autoPort ?? true)
  let storedToken: string | null = null

  // `?? 'conn-1'` would be wrong here: an explicit `connectionId: null` (the
  // "no active connection" case tests deliberately pass) is nullish too, so
  // `??` would silently override it back to 'conn-1'. Distinguish "the
  // caller didn't pass the option" from "the caller passed null on purpose".
  const activeConnectionId = opts && 'connectionId' in opts ? opts.connectionId! : 'conn-1'
  const server = createMCPServer({
    toolRegistry: registry,
    getActiveConnectionId: () => activeConnectionId,
    settingsStore: { get: (k) => settings.get(k), set: (k, v) => { settings.set(k, v) } },
    tokenStore: { get: () => storedToken, set: (t) => { storedToken = t } },
  })
  const { port, token } = await server.start()
  return { server, registry, settings, port, token, close: () => server.stop() }
}

async function connectClient(port: number, token: string): Promise<Client> {
  const transport = new SSEClientTransport(new URL(`http://127.0.0.1:${port}/sse`), {
    eventSourceInit: {
      fetch: (u, init) => fetch(u, { ...init, headers: { ...(init?.headers ?? {}), Authorization: `Bearer ${token}` } }),
    },
    requestInit: { headers: { Authorization: `Bearer ${token}` } },
  })
  const client = new Client({ name: 'test-client', version: '1.0' })
  await client.connect(transport)
  return client
}

interface Harness extends RawServer {
  client: Client
}

/** Starts a server with `tools` already registered (exposure is computed
 *  once at start() time — registering afterwards would silently never be
 *  seen) and connects a real MCP client to it. */
async function harness(opts?: Parameters<typeof startServer>[0]): Promise<Harness> {
  const raw = await startServer(opts)
  const client = await connectClient(raw.port, raw.token)
  return {
    ...raw,
    client,
    close: async () => { await client.close().catch(() => {}); await raw.server.stop() },
  }
}

/** Node's fetch forbids setting the Host header (browsers strip it); the
 *  DNS-rebinding guard can only be exercised with a raw socket request. */
function rawGet(port: number, path: string, headers: Record<string, string>): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = httpRequest({ host: '127.0.0.1', port, path, method: 'GET', headers, insecureHTTPParser: true }, (res) => {
      let body = ''
      res.on('data', (c) => { body += c })
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body }))
    })
    req.on('error', reject)
    req.end()
  })
}

/** Raw-socket POST. undici (Node's fetch) insists on flushing the entire
 *  request body before it will surface the response, which fights an endpoint
 *  that answers 413 *before* reading the whole payload — the very behaviour
 *  under test. A hand-written socket lets us read whatever the server sends
 *  back even if it tears the connection down mid-upload. */
function rawPost(port: number, path: string, headers: Record<string, string>, body: string): Promise<{ status: number; raw: string }> {
  return new Promise((resolve) => {
    const socket = netConnect(port, '127.0.0.1', () => {
      const head = [
        `POST ${path} HTTP/1.1`,
        `Host: 127.0.0.1:${port}`,
        ...Object.entries(headers).map(([k, v]) => `${k}: ${v}`),
        `Content-Length: ${Buffer.byteLength(body)}`,
        'Connection: close',
        '', '',
      ].join('\r\n')
      socket.write(head)
      socket.write(body, () => {})
    })
    let raw = ''
    const done = () => resolve({ status: Number((raw.match(/^HTTP\/1\.1 (\d+)/) ?? [])[1] ?? 0), raw })
    socket.on('data', (d) => { raw += d.toString() })
    socket.on('close', done)
    // A mid-upload teardown surfaces as EPIPE/ECONNRESET on our write; by then
    // the 413 response line is already in `raw`, so resolve with what we have.
    socket.on('error', done)
  })
}

describe('MCP HTTP dispatch (raw fetch, no MCP client)', () => {
  it('rejects a rebound Host header with 403 before auth is even checked', async () => {
    const s = await startServer()
    try {
      // A valid token is present — if auth ran first this would be 200/401.
      // 403 proves the Host check gates the request ahead of auth.
      const res = await rawGet(s.port, '/health', { Host: 'evil.example.com', Authorization: `Bearer ${s.token}` })
      expect(res.status).toBe(403)
      expect(JSON.parse(res.body)).toEqual({ error: 'Forbidden host' })
    } finally { await s.close() }
  })

  it('accepts the real loopback Host header regardless of case', async () => {
    const s = await startServer()
    try {
      const res = await rawGet(s.port, '/health', { Host: `LOCALHOST:${s.port}`, Authorization: `Bearer ${s.token}` })
      expect(res.status).toBe(200)
    } finally { await s.close() }
  })

  it('answers OPTIONS preflight with CORS headers and no auth requirement', async () => {
    const s = await startServer()
    try {
      const res = await fetch(`http://127.0.0.1:${s.port}/health`, { method: 'OPTIONS' })
      expect(res.status).toBe(204)
      expect(res.headers.get('access-control-allow-methods')).toContain('POST')
    } finally { await s.close() }
  })

  it('gates /health behind auth too — an unauthenticated probe learns nothing', async () => {
    const s = await startServer()
    try {
      const res = await fetch(`http://127.0.0.1:${s.port}/health`)
      expect(res.status).toBe(401)
    } finally { await s.close() }
  })

  it('returns ok on /health with a valid token', async () => {
    const s = await startServer()
    try {
      const res = await fetch(`http://127.0.0.1:${s.port}/health`, { headers: { Authorization: `Bearer ${s.token}` } })
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ status: 'ok', name: 'verql-mcp' })
    } finally { await s.close() }
  })

  it('returns 404 for an unknown path', async () => {
    const s = await startServer()
    try {
      const res = await fetch(`http://127.0.0.1:${s.port}/nope`, { headers: { Authorization: `Bearer ${s.token}` } })
      expect(res.status).toBe(404)
    } finally { await s.close() }
  })

  it('returns 503 for POST /messages when no SSE stream has been established', async () => {
    const s = await startServer()
    try {
      const res = await fetch(`http://127.0.0.1:${s.port}/messages`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${s.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      expect(res.status).toBe(503)
    } finally { await s.close() }
  })

  it('returns 400 for malformed JSON posted to /messages, without crashing the server', async () => {
    const s = await startServer()
    const client = await connectClient(s.port, s.token) // establishes the SSE stream /messages needs
    try {
      const res = await fetch(`http://127.0.0.1:${s.port}/messages`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${s.token}`, 'Content-Type': 'application/json' },
        body: '{not json',
      })
      expect(res.status).toBe(400)
      // The server must still be alive and answering other requests.
      const health = await fetch(`http://127.0.0.1:${s.port}/health`, { headers: { Authorization: `Bearer ${s.token}` } })
      expect(health.status).toBe(200)
    } finally { await client.close().catch(() => {}); await s.close() }
  })

  it('rejects an over-limit POST /messages body with 413 and stays alive (no unbounded buffering)', async () => {
    const s = await startServer()
    const client = await connectClient(s.port, s.token) // establishes the SSE stream /messages needs
    try {
      const oversized = 'x'.repeat(MAX_MCP_BODY_BYTES + 1024)
      const res = await rawPost(s.port, '/messages', {
        Authorization: `Bearer ${s.token}`,
        'Content-Type': 'application/json',
      }, oversized)
      expect(res.status).toBe(413)
      // The oversized request must not have taken the server down.
      const health = await fetch(`http://127.0.0.1:${s.port}/health`, { headers: { Authorization: `Bearer ${s.token}` } })
      expect(health.status).toBe(200)
    } finally { await client.close().catch(() => {}); await s.close() }
  })
})

describe('MCP server lifecycle', () => {
  it('reports a stopped/idle status before start()', () => {
    const server = createMCPServer({
      toolRegistry: new ToolRegistryImpl(),
      getActiveConnectionId: () => null,
      settingsStore: { get: () => undefined, set: () => {} },
      tokenStore: { get: () => null, set: () => {} },
    })
    expect(server.getStatus()).toEqual({ running: false, port: 0, clients: 0, token: '', autoSelectedPort: false })
  })

  it('stop() on a never-started server is a safe no-op', async () => {
    const server = createMCPServer({
      toolRegistry: new ToolRegistryImpl(),
      getActiveConnectionId: () => null,
      settingsStore: { get: () => undefined, set: () => {} },
      tokenStore: { get: () => null, set: () => {} },
    })
    await expect(server.stop()).resolves.toBeUndefined()
  })

  it('reload() is a no-op while stopped — it must not implicitly start the server', async () => {
    const server = createMCPServer({
      toolRegistry: new ToolRegistryImpl(),
      getActiveConnectionId: () => null,
      settingsStore: { get: () => undefined, set: () => {} },
      tokenStore: { get: () => null, set: () => {} },
    })
    await server.reload()
    expect(server.getStatus().running).toBe(false)
  })

  it('reuses a pre-existing stored token instead of minting a new one', async () => {
    const settings = new Map<string, unknown>([['mcp.disabledTools', []], ['mcp.readOnly', false], ['mcp.port', nextPortBase()]])
    const server = createMCPServer({
      toolRegistry: new ToolRegistryImpl(),
      getActiveConnectionId: () => null,
      settingsStore: { get: (k) => settings.get(k), set: (k, v) => settings.set(k, v) },
      tokenStore: { get: () => 'preexisting-token', set: () => { throw new Error('should not persist — token already existed') } },
    })
    const { token } = await server.start()
    try {
      expect(token).toBe('preexisting-token')
    } finally { await server.stop() }
  })

  it('rejects with EADDRINUSE when the requested port is already bound and autoPort is off', async () => {
    const occupied = createServer()
    const port = nextPortBase()
    await new Promise<void>((r) => occupied.listen(port, '127.0.0.1', r))
    const settings = new Map<string, unknown>([
      ['mcp.disabledTools', []], ['mcp.readOnly', false], ['mcp.port', port], ['mcp.autoPort', false],
    ])
    const server = createMCPServer({
      toolRegistry: new ToolRegistryImpl(),
      getActiveConnectionId: () => null,
      settingsStore: { get: (k) => settings.get(k), set: (k, v) => settings.set(k, v) },
      tokenStore: { get: () => null, set: () => {} },
    })
    try {
      await expect(server.start()).rejects.toMatchObject({ code: 'EADDRINUSE', port })
    } finally {
      await new Promise<void>((r) => occupied.close(() => r()))
    }
  })

  it('auto-selects the next free port when the requested one is occupied and autoPort is on', async () => {
    const occupied = createServer()
    const port = nextPortBase()
    await new Promise<void>((r) => occupied.listen(port, '127.0.0.1', r))
    const settings = new Map<string, unknown>([
      ['mcp.disabledTools', []], ['mcp.readOnly', false], ['mcp.port', port], ['mcp.autoPort', true],
    ])
    const server = createMCPServer({
      toolRegistry: new ToolRegistryImpl(),
      getActiveConnectionId: () => null,
      settingsStore: { get: (k) => settings.get(k), set: (k, v) => settings.set(k, v) },
      tokenStore: { get: () => null, set: () => {} },
    })
    try {
      const result = await server.start()
      expect(result.port).not.toBe(port)
      expect(result.autoSelectedPort).toBe(true)
      expect(server.getStatus().port).toBe(result.port)
    } finally {
      await server.stop()
      await new Promise<void>((r) => occupied.close(() => r()))
    }
  })

  it('calling start() while already running does not throw and leaves the server functional', async () => {
    const s = await startServer()
    try {
      // start() must stop the previous listener itself; a naive
      // implementation would throw EADDRINUSE trying to rebind.
      const second = await s.server.start()
      const res = await fetch(`http://127.0.0.1:${second.port}/health`, { headers: { Authorization: `Bearer ${second.token}` } })
      expect(res.status).toBe(200)
      expect(s.server.getStatus().running).toBe(true)
    } finally { await s.close() }
  })
})

describe('MCP tool dispatch — connection + write gating', () => {
  afterEach(() => { windows = [] })

  it('refuses every tool call when there is no active Verql connection, without invoking the tool', async () => {
    const execute = vi.fn(async () => ({ success: true, data: {} }))
    const h = await harness({ connectionId: null, tools: [makeTool('list_tables', 'read', execute)] })
    try {
      const result = await h.client.callTool({ name: 'list_tables', arguments: {} })
      expect(result.isError).toBe(true)
      expect((result.content as Array<{ text: string }>)[0].text).toMatch(/no active database connection/i)
      expect(execute).not.toHaveBeenCalled()
    } finally { await h.close() }
  })

  it('does not prompt for approval when there is no connection, even for a write tool', async () => {
    windows = [fakeWindow()]
    const h = await harness({ connectionId: null, tools: [makeTool('delete_rows', 'write')] })
    try {
      await h.client.callTool({ name: 'delete_rows', arguments: {} })
      // The connection check short-circuits before the approval gate. The
      // window DOES receive the generic activity-log broadcast (that runs
      // regardless), but it must never receive an approval-request event —
      // that would be the (already denied) query erroneously handed to the
      // user for a decision.
      const eventNames = windows[0].webContents.send.mock.calls.map((c) => c[0])
      expect(eventNames).not.toContain('mcp:approval-request')
    } finally { await h.close() }
  })

  it('executes a plain read tool immediately and surfaces its result', async () => {
    const h = await harness({ tools: [makeTool('list_tables', 'read', async () => ({ success: true, data: { tables: ['a', 'b'] } }))] })
    try {
      const result = await h.client.callTool({ name: 'list_tables', arguments: {} })
      expect(result.isError).toBeFalsy()
      const text = (result.content as Array<{ text: string }>)[0].text
      expect(JSON.parse(text)).toEqual({ tables: ['a', 'b'] })
    } finally { await h.close() }
  })

  it('turns a thrown execute() into an isError result instead of a hung/unhandled request', async () => {
    const h = await harness({ tools: [makeTool('boom', 'read', async () => { throw new Error('adapter exploded') })] })
    try {
      const result = await h.client.callTool({ name: 'boom', arguments: {} })
      expect(result.isError).toBe(true)
      expect((result.content as Array<{ text: string }>)[0].text).toMatch(/adapter exploded/)
    } finally { await h.close() }
  })

  it('a write-permission tool blocks on approval, and approving it lets execution proceed', async () => {
    windows = [fakeWindow()]
    const h = await harness({ tools: [makeTool('run_migration', 'write', async () => ({ success: true, data: { applied: true } }))] })
    try {
      const pending = h.client.callTool({ name: 'run_migration', arguments: {} })
      await waitFor(() => windows[0].webContents.send.mock.calls.length > 0)
      const [, req] = windows[0].webContents.send.mock.calls[0]
      expect(req.toolId).toBe('run_migration')
      h.server.resolveApproval(req.requestId, true)
      const result = await pending
      expect(result.isError).toBeFalsy()
      expect(JSON.parse((result.content as Array<{ text: string }>)[0].text)).toEqual({ applied: true })
    } finally { await h.close() }
  })

  it('rejecting the approval blocks execution and reports the rejection, not a raw error', async () => {
    windows = [fakeWindow()]
    const execute = vi.fn(async () => ({ success: true, data: {} }))
    const h = await harness({ tools: [makeTool('run_migration', 'write', execute)] })
    try {
      const pending = h.client.callTool({ name: 'run_migration', arguments: {} })
      await waitFor(() => windows[0].webContents.send.mock.calls.length > 0)
      const [, req] = windows[0].webContents.send.mock.calls[0]
      h.server.resolveApproval(req.requestId, false)
      const result = await pending
      expect(result.isError).toBe(true)
      expect((result.content as Array<{ text: string }>)[0].text).toMatch(/rejected by user/i)
      expect(execute).not.toHaveBeenCalled()
    } finally { await h.close() }
  })

  it('with no window open at all, a write tool is auto-rejected rather than hanging forever', async () => {
    windows = [] // headless: nothing to show the approval prompt on
    const execute = vi.fn(async () => ({ success: true, data: {} }))
    const h = await harness({ tools: [makeTool('run_migration', 'write', execute)] })
    try {
      const result = await h.client.callTool({ name: 'run_migration', arguments: {} })
      expect(result.isError).toBe(true)
      expect(execute).not.toHaveBeenCalled()
    } finally { await h.close() }
  })

  it('a nominally read-only tool still requires approval when its SQL argument hides a write', async () => {
    // Exercises the SAME code path as the tests above (needsApprovalForCall
    // -> isWriteToolCall), through a read-permission tool with write SQL —
    // pinned end-to-end here rather than duplicating the pure-function cases
    // already covered by tests/unit/audit/mcp-explain-write-guard.test.ts.
    windows = [fakeWindow()]
    const h = await harness({ tools: [makeTool('explain_query', 'read', async () => ({ success: true, data: { plan: [] } }))] })
    try {
      const pending = h.client.callTool({ name: 'explain_query', arguments: { sql: 'SELECT 1; DROP TABLE users' } })
      await waitFor(() => windows[0].webContents.send.mock.calls.length > 0)
      const [, req] = windows[0].webContents.send.mock.calls[0]
      expect(req.permission).toBe('read') // the tool itself is "read" — only the SQL payload is a write
      h.server.resolveApproval(req.requestId, true)
      const result = await pending
      expect(result.isError).toBeFalsy()
    } finally { await h.close() }
  })

  it('resolving an unknown or already-resolved approval id is a safe no-op', async () => {
    const h = await harness()
    try {
      expect(() => h.server.resolveApproval('does-not-exist', true)).not.toThrow()
    } finally { await h.close() }
  })
})

describe('MCP tool exposure gating (disabledTools / readOnly)', () => {
  it('a disabled tool is not callable through the server at all', async () => {
    const h = await harness({
      disabledTools: ['secret_tool'],
      tools: [makeTool('secret_tool', 'read'), makeTool('normal_tool', 'read')],
    })
    try {
      const { tools } = await h.client.listTools()
      expect(tools.map((t) => t.name)).toEqual(['normal_tool'])
      // Not merely absent from the listing — actually calling it by name
      // must fail too, proving the gate isn't just cosmetic in listTools().
      const result = await h.client.callTool({ name: 'secret_tool', arguments: {} })
      expect(result.isError).toBe(true)
      expect((result.content as Array<{ text: string }>)[0].text).toMatch(/not found/i)
    } finally { await h.close() }
  })

  it('read-only mode hides write tools from the exposed set', async () => {
    const h = await harness({ readOnly: true, tools: [makeTool('query', 'write'), makeTool('list_tables', 'read')] })
    try {
      const { tools } = await h.client.listTools()
      expect(tools.map((t) => t.name)).toEqual(['list_tables'])
    } finally { await h.close() }
  })

  it('reload() re-reads settings and updates the exposed tool set for a running server', async () => {
    // Keep a second, never-disabled tool registered alongside 'query': if
    // the exposed set were ever empty, the SDK never registers its
    // tools/list handler at all and even listTools() itself starts failing
    // with "Method not found" — a distinct behaviour from "list is empty"
    // that would make this test about the wrong thing.
    const h = await harness({ tools: [makeTool('query', 'write'), makeTool('list_tables', 'read')] })
    try {
      expect((await h.client.listTools()).tools.map((t) => t.name)).toContain('query')
      h.settings.set('mcp.disabledTools', ['query'])
      // Force the restart onto a fresh port: reload() would otherwise land
      // right back on the same (now-free) port, and reusing a port across
      // two distinct server instances confuses undici's keep-alive
      // connection pool into ECONNRESET on the next request — a fetch-pool
      // footgun, not something under test here.
      h.settings.set('mcp.port', nextPortBase())
      // Close BEFORE reload (not after): reload() restarts the HTTP server,
      // which drops the SSE stream out from under the old client. Closing
      // first avoids racing the client's own auto-reconnect against the
      // restart, which otherwise surfaces as a flaky unhandled ECONNRESET.
      await h.client.close().catch(() => {})
      await h.server.reload()
      const client2 = await connectClient(h.server.getStatus().port, h.token)
      expect((await client2.listTools()).tools.map((t) => t.name)).not.toContain('query')
      await client2.close()
    } finally { await h.close() }
  })
})

describe('MCP activity log', () => {
  it('caps the in-memory activity buffer at 100 entries (drops oldest first)', async () => {
    const h = await harness({ tools: [makeTool('ping', 'read')] })
    try {
      for (let i = 0; i < 105; i++) {
        await h.client.callTool({ name: 'ping', arguments: {} })
      }
      expect(h.server.getActivity().length).toBe(100)
    } finally { await h.close() }
  }, 20000)

  it('getActivity() returns a snapshot copy — mutating it must not corrupt server state', async () => {
    const h = await harness({ tools: [makeTool('ping', 'read')] })
    try {
      await h.client.callTool({ name: 'ping', arguments: {} })
      const snapshot = h.server.getActivity()
      snapshot.pop()
      expect(h.server.getActivity().length).toBe(1)
    } finally { await h.close() }
  })
})
