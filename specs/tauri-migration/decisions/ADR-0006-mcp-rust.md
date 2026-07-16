# ADR-0006: MCP server reimplemented in Rust (rmcp), wire-compatible

- Status: proposed
- Verify-first: T-002 confirms rmcp's SSE-transport support level

## Context

v1 exposes the shared ToolRegistry to external MCP clients via
`@modelcontextprotocol/sdk` over **SSE** (`GET /sse` + `POST /messages`,
plus `/health`) on loopback with bearer-token auth, DNS-rebinding Host
guard, per-tool gating, and a write-approval flow through the renderer +
attention hub.

## Decision

Reimplement in Rust with **rmcp** (the official Rust MCP SDK) inside
`verql-mcp`, served by axum on `127.0.0.1` with the same defaults (port
3100, auto-port probe, token in the OS keyring under the `__mcp__`
namespace, timing-safe comparison, Host-header allowlist, CORS behavior).

Compatibility stance:

- **Existing configured clients must keep working**: the SSE endpoints keep
  their paths and semantics. If rmcp's transport support has moved to
  Streamable HTTP only, we serve *both* (SSE compat layer + streamable) —
  the spike task decides implementation, the requirement stands.
- Token format (32-byte hex bearer) and the `/health` response shape are
  parity-pinned so user setups and docs survive.
- Tool listing/gating (`mcp.disabledTools`, `mcp.readOnly`, `surfaces`
  field) and the 5-minute approval timeout replicate v1 behavior exactly.

## Alternatives considered

- **Keep the Node MCP server as a sidecar**: rejected for the same reasons
  as every sidecar (ADR-0002) — and MCP is tightly coupled to the
  ToolRegistry, which is moving to Rust; a sidecar would need its own IPC
  back into the core for every tool call.
- **Hand-rolled JSON-RPC without an SDK**: viable (the surface used is
  small) and remains the fallback if rmcp fights the approval-flow
  integration; noted so the implementer doesn't treat rmcp as load-bearing
  dogma.

## Consequences

- The approval flow's attention-hub integration is a first-class parity
  case: a write tool call from a live external client must surface the
  renderer prompt + OS notification and honor approve/deny/timeout.
- The Phase-5 gate includes a live client test (Claude Code against the
  Rust server).
