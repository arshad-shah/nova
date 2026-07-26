# ADR-0006: MCP server reimplemented in Rust (rmcp 2.x) on Streamable HTTP

- Status: proposed
- Amended 2026-07-16: original draft required SSE wire-compat with v1;
  ecosystem research (see [versions-baseline.md](./versions-baseline.md))
  showed that stance was already obsolete, so the decision below supersedes
  it. This is the recorded amendment.

## Context

v1 exposes the shared ToolRegistry to external MCP clients via
`@modelcontextprotocol/sdk` over the **legacy HTTP+SSE transport**
(`GET /sse` + `POST /messages`, plus `/health`) on loopback with
bearer-token auth, a DNS-rebinding Host guard, per-tool gating, and a
write-approval flow through the renderer + attention hub.

Since then the ground moved: the MCP spec (current revision **2025-11-25**)
deprecated HTTP+SSE in favor of **Streamable HTTP** back in 2025-03-26; the
official Rust SDK (**rmcp**, 2.2.0) **removed** its SSE transport entirely
in v0.11.0 (Dec 2025); and every major client — Claude Code (docs: "The SSE
transport is deprecated. Use HTTP servers instead"), Claude Desktop
connectors, Cursor — speaks Streamable HTTP today.

## Decision

Reimplement in Rust with **rmcp 2.x** inside `verql-mcp`, serving
**Streamable HTTP on a single `/mcp` endpoint** (rmcp's
`StreamableHttpService` is a tower `Service`; mount it via axum
`nest_service` alongside a plain `/health` route) on `127.0.0.1` with the
same defaults where they still make sense: port 3100, auto-port probe,
32-byte hex bearer token stored in the OS keyring under the `__mcp__`
namespace, timing-safe comparison.

**v1's SSE endpoints are not ported.** This is a sanctioned wire-contract
deviation, handled as product UX rather than compat code:

- users with a configured v1 MCP client see a one-time notice (settings MCP
  panel + the v1-data-migration report) with the new endpoint URL and a
  copy-ready client config;
- the `/health` response and `mcp:*` IPC surface keep their v1 shapes, so
  the in-app settings UI ports unchanged;
- rationale for not hand-rolling a legacy SSE shim: no current major client
  needs it, rmcp cannot serve it, and the spec's own backwards-compat
  guidance treats dual-hosting as optional for *old* clients we don't have.

Security posture follows the 2025-11-25 spec's local-server guidance, which
is a superset of v1's: bind loopback only, **validate `Origin` (403 on
mismatch)** in addition to v1's Host allowlist, bearer token on every
request. OAuth 2.1 (the spec's optional HTTP auth framework) is explicitly
out of scope for a loopback server — static bearer over the
`Authorization` header is the sanctioned localhost pattern.

Tool exposure rules replicate v1 exactly: registry-driven listing gated by
`mcp.disabledTools`, `mcp.readOnly`, and the tool `surfaces` field; write
tools require approval (renderer prompt + attention hub, 5-minute timeout);
the 100-entry activity ring buffer and `mcp:activity-event` behavior port
as-is.

## Alternatives considered

- **Keep the Node MCP server as a sidecar**: rejected — ships Node
  (ADR-0002), and the ToolRegistry it fronts is moving to Rust.
- **Hand-rolled JSON-RPC over axum without rmcp**: remains the documented
  fallback if rmcp 2.x fights the approval-flow integration (its API had a
  breaking 2.0 in June 2026; pin `2.x` and treat it as replaceable — the
  used surface is small: tools list/call + one transport).
- **Also serving legacy SSE for v1 wire parity**: rejected per above.

## Consequences

- The Phase-5 gate's live-client test uses Streamable HTTP (`claude mcp add
  --transport http http://127.0.0.1:3100/mcp --header "Authorization:
  Bearer …"`) and must also verify the Origin guard rejects a
  browser-originated request.
- The approval flow's attention-hub integration remains a first-class
  parity case: a write tool call from a live external client must surface
  the renderer prompt + OS notification and honor approve/deny/timeout.
- `docs/` and `site/` MCP setup pages change endpoint/transport at cutover
  (T-607); the v1→v2 migration report includes the MCP reconfiguration
  notice (T-605).
