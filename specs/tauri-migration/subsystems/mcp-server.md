# MCP server

Ports `src/main/mcp/` (server, auth, port probe), the `mcp:*` IPC surface,
and the ToolRegistry/db-tools contract both agent surfaces share. Crates:
`verql-mcp` (transport/auth/approvals) + `verql-tools` (ToolRegistry +
db-tools). Governing decision: [ADR-0006](../decisions/ADR-0006-mcp-rust.md)
(as amended 2026-07-16) — rmcp 2.x on **Streamable HTTP**; v1's legacy SSE
endpoints are **not ported** (a sanctioned wire-contract deviation). Related:
[`ai-assistant.md`](./ai-assistant.md)
(same tools, same `isWriteToolCall`),
[`activity-attention-notifications.md`](./activity-attention-notifications.md)
(attention hub).

## v1 behavior contract

### Transport & endpoints (`src/main/mcp/server.ts`)

Node `http` server bound to **`127.0.0.1`** only:

| Route | Behavior |
|---|---|
| `GET /sse` | Opens an `SSEServerTransport('/messages', res)` from `@modelcontextprotocol/sdk` and connects the McpServer. **Single active transport**: a new `GET /sse` replaces `transport`; `clientCount` increments and decrements on `transport.onclose`. |
| `POST /messages` | Body-buffered, `JSON.parse`d, handed to `transport.handlePostMessage`. `503 {"error":"No active SSE connection"}` when no transport; `400 {"error":"Invalid JSON"}` on parse failure. |
| `GET /health` | `200 {"status":"ok","name":"verql-mcp"}` — shape is parity-pinned (user docs reference it). |
| anything else | `404` "Not found". |

Request pre-processing, in order: CORS headers
(`Access-Control-Allow-Methods: GET, POST, OPTIONS`,
`Access-Control-Allow-Headers: Authorization, Content-Type`, `Vary: Origin`;
`OPTIONS` → `204` before any check; note **no**
`Access-Control-Allow-Origin` is ever set) → **Host-header DNS-rebinding
guard** (`isAllowedMcpHost` in `auth.ts`: strips the port — including
bracketed IPv6, rejecting a mismatched port — and requires
`127.0.0.1 | localhost | ::1`; failure → `403 {"error":"Forbidden host"}`,
deliberately **before** auth) → bearer auth.

**Ports**: requested = `mcp.port` setting (default **3100**); when
`mcp.autoPort` (default true), `findFreePort(requestedPort, 20)`
(`find-port.ts`) probes `start … start+19` on 127.0.0.1 and
`autoSelectedPort` records whether it moved. `EADDRINUSE` rejects start with
a coded error. `MCPStartResult = {port, token, autoSelectedPort}`;
`MCPServerStatus = {running, port, clients, token, autoSelectedPort}`
(`shared/mcp.ts`, which also exports `buildMcpClientConfig` producing the
`{type:'sse', url: http://localhost:<port>/sse, headers.Authorization}`
snippet users paste into clients).

### Token lifecycle (`auth.ts`, `src/main/ipc/mcp.ts`)

- `generateToken() = randomBytes(32).toString('hex')` — 32-byte hex bearer.
- Stored in the keyring under namespace **`MCP_TOKEN_NS = '__mcp__'`**, key
  `'token'`; a one-time migration moves a legacy plaintext `mcp.token`
  setting into the keyring and blanks the config copy.
- `start()` reuses the stored token or mints+persists one.
- `isValidBearer` compares with **`timingSafeEqual`** after an explicit
  length guard; failure → `401 {"error":"Unauthorized"}` (`validateAuth`).
- `mcp:regenerate-token` calls `regenerateToken()` (mint + persist + update
  in-memory) and returns `getStatus()` — works while stopped; a running
  server drops existing clients on their next call since auth reads the live
  token.

### Tool exposure & approval

`selectExposedTools(tools, gate)` (pure, exported): a tool is exposed iff it
is not in `mcp.disabledTools`, not (`mcp.readOnly` && `permission ===
'write'`), and its `surfaces` is undefined **or** includes `'mcp'` (so the
AI-only `perform_app_action` never appears). The gate is re-read at
`buildMcpServer` time; `reload()` = stop+start when running, no-op when
stopped (`mcp:set-tool-enabled` and the read-only toggle call it).

Per call (the handler registered for each exposed tool): no active
connection → error result; `needsApprovalForCall(tool, params) =
isWriteToolCall(tool.permission, params)` (declared-write OR write/DDL `sql`
in a read tool) → **approval flow**: `crypto.randomUUID()` request id,
`mcp:approval-request` event to the first `BrowserWindow`
(`MCPApprovalRequest {requestId, toolId, toolName, sql, permission}` — `sql`
falls back to pretty-printed params), attention-hub `request({kind:
'approval', source:'mcp', title:'MCP query approval', body: name + first 200
chars of sql})`, and a **5-minute timeout** (`5 * 60 * 1000`) that resolves
`false` and clears the attention entry. No window at all → immediate deny.
`mcp:approval-response` resolves via `resolveApproval`. Approved calls run
through **`toolRegistry.execute`** (not `tool.execute`) so the unified
activity recorder logs them exactly like AI calls; results serialize as
`{content:[{type:'text', text: JSON.stringify(result.data, null, 2)}],
isError}`.

### Activity ring & events

`record(entry)` appends to an in-memory array **capped at 100**
(`activity.shift()` past the cap) and broadcasts each entry as
`mcp:activity-event`. `MCPActivityEntry = {id, timestamp, toolId,
paramsSummary, status: 'ok'|'error'|'rejected', durationMs}`;
`summarizeParams` truncates JSON at 120 chars (117 + `…`). `mcp:activity`
returns a copy of the ring (consumed live by `MCPSettings.tsx`).

### Auto-start

`ipc-handlers.ts`: after **plugin boot completes** (so db-tools has
registered its tools — starting earlier would expose an empty tool set), the
server auto-starts iff the `mcp.enabled` setting is true. `mcp:start` sets
`mcp.enabled = true`; `mcp:stop` sets it false — enabled-state is simply
"was it running last time".

### The 9 `mcp:*` channels

`mcp:start` (start + persist enabled) · `mcp:stop` · `mcp:status` ·
`mcp:tools` (all registry tools with `enabled: !disabled.includes(id)` —
note: **unfiltered by surfaces/readOnly**, it's the settings-UI list, not the
exposure list) · `mcp:set-tool-enabled` (updates `mcp.disabledTools`,
reloads) · `mcp:activity` · `mcp:regenerate-token` · `mcp:reload` ·
`mcp:approval-response`. Events: `mcp:approval-request`,
`mcp:activity-event`.

### ToolRegistry contract & the db-tools tools

`Tool` (sdk/types): `id, name, description, inputSchema` (**JSON Schema**,
produced by `toJsonSchema(zod)`), `permission: 'read'|'write'`, `surfaces?:
('ai'|'mcp')[]`, `execute(params, ctx: {connectionId, abortSignal})`.
`toolRegistry.execute` wraps every call with the activity recorder set in
`ipc-handlers.ts`. From `src/main/plugins/bundled/db-tools/tools.ts`
(+ `index.ts`: `maxRows` read live from `mcp.maxRows`, default 500;
`get_app_activity` registered only when the `activity-log` service exists):

| Tool | Permission | Input schema | Notes |
|---|---|---|---|
| `query` | **write** | `{sql: string}` | rows sliced to `maxRows`; returns rows/rowCount/fields(name,dataType)/duration/affectedRows; cancellable via `withCancellation` → `connections.cancelQuery` |
| `explain_query` | read | `{sql: string}` | runs `` `EXPLAIN ${sql}` `` — the read-tool-with-write-SQL case the `isWriteToolCall` content check exists for |
| `list_tables` | read | `{schema?: string}` | name/type/rowCount |
| `describe_table` | read | `{table: string, schema?: string}` | columns + indexes in parallel |
| `get_schemas` | read | `{}` | schemas + databases, each `.catch(() => [])` |
| `connection_info` | read | `{}` | profile type/host/port/database/name |
| `get_app_activity` | read | `{kinds?: enum[], limit?: number}` | limit clamp: default 50, max 500; kinds ∈ query/tool-call/connection/notification/network |

## v2 design (per ADR-0006, amended 2026-07-16)

- **`verql-tools`**: `trait Tool` mirroring the v1 shape (`input_schema:
  serde_json::Value` stays JSON Schema — no zod round trip needed in Rust;
  rmcp consumes JSON Schema natively, removing v1's
  `jsonSchemaToZodShape` shim), `ToolRegistry` with the same
  activity-recorder hook, `is_write_tool_call` ported once and shared with
  `verql-ai`. The seven db-tools port as plain functions over the
  `verql-db` access traits; `max_rows` read live from settings.
- **`verql-mcp`**: **rmcp 2.x `StreamableHttpService`** (a tower `Service`)
  mounted via axum `nest_service` at a **single `/mcp` endpoint**, plus a
  plain axum `/health` route, bound to `127.0.0.1`. Transport = MCP
  **Streamable HTTP** per spec revision **2025-11-25** (single endpoint,
  POST+GET, JSON-or-SSE responses, `MCP-Session-Id`). **The legacy
  `GET /sse` + `POST /messages` pair is NOT ported** — rmcp removed SSE in
  v0.11.0, every major client speaks Streamable HTTP, and the ADR-0006
  amendment sanctions the deviation. Middleware order stays
  CORS-preflight → Host guard → **Origin guard** → bearer auth
  (constant-time compare via `subtle::ConstantTimeEq`): the 2025-11-25 spec
  makes **`Origin` validation a MUST** for local servers, so a mismatched
  `Origin` header gets `403` in addition to v1's Host allowlist; the static
  bearer token stays (the sanctioned localhost pattern — OAuth is out of
  scope for loopback).
- `clientCount` maps to rmcp's session tracking; port probe (async
  TcpListener bind probe over the same 20-port span), `autoSelectedPort`,
  and the `EADDRINUSE`-shaped start error all replicate. The `/health`
  response and the `mcp:*` IPC shapes keep their v1 forms so the settings
  UI ports unchanged; `buildMcpClientConfig` is updated to emit the
  Streamable HTTP config (`type:'http'`, url `…/mcp`) — the renderer-facing
  shape change is part of the sanctioned deviation.
- **Client reconfiguration notice is an explicit deliverable**: users with
  a configured v1 SSE client get a one-time notice (settings MCP panel,
  T-506) and the v1→v2 migration report includes the new endpoint + a
  copy-ready client config (T-605).
- Token store = `verql-keyring`, namespace `__mcp__`/`token` unchanged (v1
  tokens survive data migration, so configured clients keep working — see
  [`keyring.md`](./keyring.md)).
- Approval flow: `DashMap<Uuid, oneshot::Sender<bool>>` + `tokio::time::
  timeout(300s)`; emits `mcp:approval-request`, publishes/resolves on the
  Rust attention hub, answered by the same `mcp:approval-response` channel.
- Activity ring: `VecDeque` cap 100 + `emit("mcp:activity-event", entry)`;
  `summarize_params` with the same 120-char truncation.
- Auto-start after registry composition (compile-time now, but still ordered
  after settings load) iff `mcp.enabled`.

## Parity cases

- **`/health` golden**: byte-identical body, 200, content-type (shape is
  parity-pinned even though the MCP endpoint moved).
- **Auth rejection matrix**: missing header, wrong scheme, wrong token,
  correct token wrong length, rebound Host (`evil.example:3100`,
  `127.0.0.1:9999`, bare `[::1]`), OPTIONS preflight (204, no auth) — same
  verdicts as v1's matrix, now against `/mcp`.
- **Origin-guard rejection**: a request with a non-local `Origin` header
  (e.g. `https://evil.example`) gets `403` even with a valid bearer token —
  the new MUST from spec 2025-11-25, per the ADR-0006 amendment.
- **`selectExposedTools` table tests**: disabledTools, readOnly×write,
  `surfaces` undefined vs `['ai']` vs `['mcp']` — verdicts identical to the
  v1 pure function's unit tests.
- **Approval**: live write call → renderer event payload shape +
  attention-hub request; approve/deny/timeout(=deny) paths; `rejected`
  activity status; read tool with `DROP TABLE` sql requires approval.
- **Ring cap**: 101st entry evicts the first; `mcp:activity` ordering.
- **Live-client checklist (Phase-5 gate, per ADR-0006)**: Claude Code
  configured via `claude mcp add --transport http
  http://127.0.0.1:3100/mcp --header "Authorization: Bearer …"` against the
  Rust server — list tools, run `list_tables`/`query` (with approval),
  token regenerate drops the session, `mcp.readOnly` hides `query`, health
  probe.
- **Client-reconfiguration notice**: the T-506 settings-panel notice and
  the T-605 migration-report entry both render the new endpoint + config
  snippet when v1 MCP state is detected.

## Open questions

- ~~rmcp SSE-transport support level~~ — resolved by the 2026-07 research:
  rmcp removed SSE in v0.11.0; Streamable HTTP only, SSE not ported
  (ADR-0006 amendment). Fallback if rmcp 2.x fights the approval-flow
  integration remains hand-rolled JSON-RPC over axum at the same `/mcp`
  endpoint.
- Whether `mcp:tools` should keep listing AI-only tools (v1 lists the whole
  registry unfiltered; the settings UI shows them with toggles). Parity says
  keep; T-507 verifies the renderer expectation before deviating.
