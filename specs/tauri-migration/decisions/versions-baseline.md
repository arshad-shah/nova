# Ecosystem versions baseline — researched 2026-07-16

Verified against crates.io publish data, official docs, and GitHub on the
date above (sources at bottom). This is the **researched baseline the ADRs
are written against**. T-002 re-verifies it at execution time and records
drift as amendments; it does not re-research from scratch.

## Shell

| Component | Version (2026-07-16) | Notes |
|---|---|---|
| tauri | **2.11.5** (2026-07-01) | Tauri 3 unreleased — no alpha/beta tags; 3.0 milestone ~13%, driven by the Linux GTK3→GTK4 migration. Target 2.x. |
| tauri-cli / @tauri-apps/cli | 2.11.4 | |
| tauri-bundler | 2.9.4 (2026-06-28) | Windows: NSIS + MSI (WiX v3). **No native MSIX** (issues #4818/#8548 open). |
| wry / tao | 0.55.1 / 0.35.3 | MSRV 1.77 / 1.74 |
| muda (menus) | 0.19.3 | `tauri::menu` is stable in Tauri 2 |
| MSRV (tauri crate) | **1.77.2** | from crates.io metadata |
| Linux WebView | **webkit2gtk-4.1** | known perf/stability complaints for heavy-DOM apps (discussion #8524); NVIDIA/DMABUF blank-window issues have an official debug page. Validates the T-009 spike. |
| verso (Servo runtime) | experimental | `tauri-runtime-verso` exists; not production-ready |

Official plugins (`tauri-plugin-*` / `@tauri-apps/plugin-*`): dialog 2.7.1,
**opener 2.5.4** (the `shell.open` API split into opener; shell 2.3.5 remains
for child processes/sidecars), notification 2.3.3, os 2.3.2, updater 2.10.1,
single-instance 2.4.3, window-state 2.4.1, fs 2.5.1, clipboard-manager 2.3.2,
deep-link 2.4.9, log 2.9.0, process 2.3.1, global-shortcut 2.3.2.

Frameless-window facts that shape the port:
- macOS: **`trafficLightPosition` is a first-class window config since
  Tauri 2.4.0** (requires `titleBarStyle: "Overlay"` + `decorations: true`).
  No private-API workaround needed.
- Windows: **no window-controls-overlay equivalent** (issue #12930 open) —
  v1's `env(titlebar-area-*)` CSS will not exist; we draw our own controls
  (the renderer already has `WindowControls.tsx`).
- `data-tauri-drag-region` applies **only to the element it is set on** —
  children need it explicitly. Double-click-maximize is manual. Needs
  `core:window:allow-start-dragging` etc. in capabilities.
- IPC: **`tauri::ipc::Channel` is the documented mechanism for
  high-frequency Rust→webview streams**; events are explicitly "not designed
  for low latency or high throughput".

## Typed bindings

| Component | Version | Notes |
|---|---|---|
| ts-rs | 12.0.1 (2026-01-31) | stable; TS type generation only |
| specta / tauri-specta | 2.0.0-rc.25 | still release-candidate after 2+ years of rc; community-maintained; pin if used |

## MCP

| Component | Version | Notes |
|---|---|---|
| rmcp (official Rust SDK) | **2.2.0** (2026-07-08) | 2.0 (Jun 2026) was breaking (aligned to spec 2025-11-25). **Legacy SSE transport REMOVED in v0.11.0 (Dec 2025)** — Streamable HTTP client+server only, exposed as a tower `Service` (mounts into axum via `nest_service`). |
| MCP spec | revision **2025-11-25** | transports: stdio + **Streamable HTTP** (single endpoint, POST+GET, JSON-or-SSE responses, `MCP-Session-Id`, `MCP-Protocol-Version`). Legacy HTTP+SSE deprecated since 2025-03-26. Local servers: bind loopback, **`Origin` validation MUST**, authenticate connections; static bearer over the `Authorization` header is legitimate for localhost (OAuth optional). |
| Client support | — | Claude Code: HTTP recommended, SSE explicitly deprecated. Claude Desktop: Streamable HTTP via connectors (local stdio otherwise). Cursor: url-based auto-detect. **Streamable HTTP covers all major clients; legacy SSE is not needed.** |

## AI provider APIs

- Anthropic: `anthropic-version: 2023-06-01` unchanged; SSE event set
  unchanged; prompt caching GA (`cache_control`, optional 1h TTL). Gotchas:
  newest models 400 on `temperature`/`top_p`/`top_k` and on manual
  `thinking` budgets; new stop reasons (`refusal`, `pause_turn`,
  `model_context_window_exceeded`). No official Rust SDK.
- OpenAI: **chat/completions is not deprecated** and remains the
  multi-provider-compatible baseline (Responses API is recommended for
  new OpenAI-specific work; Assistants API sunsets 2026-08-26).
- Ollama: `/api/chat` NDJSON unchanged; tool calling supported (arguments
  arrive as JSON objects, unlike OpenAI's strings); `/api/embeddings`
  deprecated in favor of `/api/embed`.
- Multi-provider crates: genai 0.7-beta (pre-1.0), async-openai 0.41.1
  (OpenAI-only). **Raw reqwest + per-provider serde models remains the sane
  choice** for anthropic/openai/ollama with full knob control.

## Backend crates

| Crate | Version | Notes |
|---|---|---|
| rusqlite | **0.40.1** (2026-06-06) | bundles SQLite 3.53.2; `get_interrupt_handle()` ungated, `InterruptHandle` is Send+Sync |
| tokio-postgres | **0.7.18** (2026-06-12) | repo moved to the `rust-postgres` org, actively maintained; `Client::cancel_token()` (old `cancel_query` deprecated); TLS via postgres-native-tls 0.5.3 or tokio-postgres-rustls 0.14.0 |
| mysql_async | **0.37.0** (2026-05-25) | **no built-in per-query timeout** — use `tokio::time::timeout` (client-side) ± server `max_execution_time`; cancel = second connection + `KILL QUERY <CONNECTION_ID()>` (best-effort) |
| mongodb | **3.8.0** (2026-07-09) | official; tokio-only since 3.0 |
| redis | **1.4.0** (2026-07-14) | crossed 1.0; RESP3, ConnectionManager auto-reconnect. (`fred` dormant since 2025-02 — do not use.) |
| Snowflake | see below | |
| russh | **0.62.2** (2026-07-06) | direct-tcpip (local forward) supported; the maintained choice — `ssh2` is blocking/C, `openssh` shells out |
| keyring | **4.1.5** (2026-07-14) | **v4 split**: `keyring-core` 1.0 + per-platform store crates (`apple-native-`, `windows-native-`, and on Linux `linux-keyutils-` / `dbus-secret-service-` / `zbus-secret-service-keyring-store`) — backends are explicit feature choices; pick the dbus-sync store to avoid async-runtime coupling, or zbus under tokio |
| zip | **8.6.0** (2026-04-25) | maintained at repo `zip-rs/zip2` but **publishes as `zip`** (no `zip2` crate); avoid the legacy 0.x line |
| axum | 0.8.9 | |
| reqwest | **0.13.4** | 0.13 line — 0.12-era code needs minor migration |
| SSE consumption | eventsource-client **0.17.5** (LaunchDarkly, active) or `reqwest` bytes_stream + eventsource-stream 0.2.3 (frozen-but-stable parser) | avoid `reqwest-eventsource` (stale since 2024) |

### Snowflake (drives ADR-0004 §snowflake)

- Still **no official standalone Rust driver**. `snowflakedb/universal-driver`
  (Rust core, experimental, explicitly unsupported) is worth watching, not
  shipping. Community: `snowflake-connector-rs` 1.0.0 (2026-07-08, active,
  key-pair/PAT/OAuth/password+TOTP; MSRV 1.88), `snowflake-api` 0.14.0
  (wraps undocumented internal API; stale-ish).
- **SQL API v2 (REST)** remains current and recommended for custom clients
  (`/api/v2/statements` execute/status/cancel). **It does not accept basic
  password auth at all** — OAuth, key-pair JWT, PAT, or WIF only.
- **Snowflake MFA enforcement is landing during this migration's window**:
  M2 (May–Jul 2026, now) — new human users must use MFA; M3 (Aug–Oct 2026)
  — service users limited to key-pair/OAuth/PAT/WIF, `LEGACY_SERVICE`
  removed. Password-only connections effectively die by late 2026 —
  **v2's Snowflake driver must ship key-pair JWT + PAT auth as first-class,
  not as a nice-to-have** (this is also true of v1, independent of the
  migration — noted as a product risk).

## Sources

crates.io API pages for every crate above; github.com/tauri-apps/tauri
releases + milestone 5; tauri-docs issue #3143; v2.tauri.app docs
(window-customization, distribute/{windows-installer,microsoft-store},
security/capabilities, develop/calling-frontend, plugin/{shell,opener});
tauri issues #4818, #8548, #12930, #4531, #14935, #13790; commit 30f5a15
(trafficLightPosition); github.com/modelcontextprotocol/rust-sdk (CHANGELOG,
transport tree, features); modelcontextprotocol.io/specification/2025-11-25
(transports, authorization, versioning); code.claude.com/docs/en/mcp;
cursor.com/docs/context/mcp; platform.claude.com docs (models overview,
streaming, prompt-caching, migration guide); platform.openai.com
migrate-to-responses + deprecations; github.com/ollama/ollama docs/api.md;
docs.snowflake.com (sql-api intro/authenticating, security-mfa-rollout);
github.com/{rusqlite/rusqlite,rust-postgres/rust-postgres,blackbeam/mysql_async,redis-rs/redis-rs,aembke/fred.rs,Eugeny/russh,open-source-cooperative/keyring-rs,zip-rs/zip2,launchdarkly/rust-eventsource-client,snowflakedb/universal-driver,mycelial/snowflake-rs,estie-inc/snowflake-connector-rs}.
