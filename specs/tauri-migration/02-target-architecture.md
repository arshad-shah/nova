# Target architecture (v2, Tauri + Rust)

## Process model

| Layer | v1 (Electron) | v2 (Tauri 2.x) |
|---|---|---|
| Shell | Chromium bundled | OS WebView (WebView2 / WKWebView / WebKitGTK `webkit2gtk-4.1`) via tao/wry — Tauri 2.11.x, MSRV 1.77.2 (see `decisions/versions-baseline.md`) |
| Backend | Node.js main process | **Rust core process** (tokio async runtime) |
| Bridge | preload `contextBridge` → `window.electronAPI` | Tauri `invoke`/`listen` wrapped by a compat shim exposing the same `electronAPI` shape |
| Renderer | React 19 SPA | unchanged React 19 SPA |
| Heavy/blocking work | main-process JS (defect: blocks) | `tokio::task::spawn_blocking` / dedicated threads per connection |

Principles carried over from v1, deliberately:

- **Orchestrator + contributions.** The Rust core stays a thin orchestrator;
  dialect/format/provider logic lives in *contribution crates* registered
  into the same registry concepts (driver, exporter, importer, formatter,
  type-mapper, theme, tool, command). "Bundled plugin" becomes "workspace
  crate implementing a trait"; the ownership boundary in `CLAUDE.md` is
  preserved even though the plugin *runtime* changes (ADR-0002/0003).
- **DB-agnostic glue.** Capabilities (`editorLanguage`, `statementSyntax`,
  `errorRules`, `nouns`, …) remain serializable data the renderer consumes
  generically. No dialect branches in core or renderer.
- **The IPC contract is frozen.** `shared/ipc.ts` remains the single source
  of channel names and payload shapes (see `04-ipc-and-events-contract.md`).

## Repository layout

```
src-tauri/                      # NEW — the Rust side
├── tauri.conf.json
├── Cargo.toml                  # workspace root
├── src/main.rs                 # thin: builder, plugin init, state, window setup
├── src/notifications.rs        # os-notifications attention consumer (needs the
│                               # tauri notification plugin → app crate, not core)
└── crates/
    ├── verql-core/             # registries, capability model, error taxonomy,
    │                           # activity log + batcher, attention hub, paths,
    │                           # atomic write, settings model
    ├── verql-ipc/              # command handlers (one module per v1 ipc/ file),
    │                           # event emitter, tauri-specta binding generation
    ├── verql-config/           # config.json store + secret extraction
    ├── verql-keyring/          # OS credential storage (keyring crate)
    ├── verql-appdata/          # app.db via rusqlite: conversations, messages,
    │                           # saved_queries, query_history, open_tabs, meta
    ├── verql-db/               # DbAdapter trait, DriverRegistry, session/txn
    │                           # manager, cancellation, timeouts, QueryResult
    ├── verql-driver-sqlite/    # rusqlite
    ├── verql-driver-postgres/  # tokio-postgres (+ native-tls/rustls)
    ├── verql-driver-mysql/     # mysql_async
    ├── verql-driver-mongodb/   # mongodb (official Rust driver)
    ├── verql-driver-redis/     # redis-rs (tokio)
    ├── verql-driver-snowflake/ # Snowflake SQL REST API v2 over reqwest (ADR-0004)
    ├── verql-ssh-tunnel/       # russh local port-forward connection middleware
    ├── verql-formats/          # csv/json/jsonl/sql exporters+importers, formatters
    ├── verql-themes/           # theme model, validation, 10 core themes (data)
    ├── verql-plugins/          # manifest model, discovery/validation/install,
    │                           # permission model, declarative plugin loading
    ├── verql-ai/               # providers (anthropic/openai/ollama via reqwest SSE),
    │                           # conversation manager, token budget, permission mgr
    ├── verql-tools/            # ToolRegistry + db-tools (query/schema/activity)
    ├── verql-mcp/              # MCP server (rmcp), token auth, approval flow
    ├── verql-updater/          # updater registry + homebrew/... channels
    └── verql-migrate-v1/       # one-shot importer of v1 user data
                                # (config.json, credentials.enc, app.db)
src/renderer/                   # unchanged React app (bridge shim swapped in)
shared/                         # ipc.ts et al — STILL the contract source of truth
tests/parity/                   # golden-file parity harness (both stacks)
src/main/, src/preload/         # v1 code: stays until cutover, then deleted
```

Crate boundaries mirror v1 subsystem boundaries on purpose: each `subsystems/*.md`
spec maps to one crate (or a small set), and each task's `touches` stays inside
one crate wherever possible so the swarm parallelizes cleanly.

## Key mappings (v1 mechanism → v2 mechanism)

| v1 | v2 |
|---|---|
| `ipcMain.handle` + typed channel map | Tauri commands; a generic dispatch keyed by the same wire strings (04-ipc doc) |
| `webContents.send(event, …)` broadcast | `app_handle.emit(event, payload)`; designated hot streams (`ai:chat:event`, `activity:batch`) may ride `tauri::ipc::Channel` behind the shim — Tauri's documented high-frequency mechanism (ADR-0005 streaming addendum) |
| `safeStorage` + `credentials.enc` | `keyring` crate → OS keychain/DPAPI/libsecret (ADR-0007; keeps encrypted-file fallback for headless Linux) |
| better-sqlite3 (app.db + sqlite driver) | `rusqlite` on `spawn_blocking`, `interrupt()` for cancellation/timeouts |
| Electron `dialog` | `tauri-plugin-dialog` |
| `shell.openExternal` | `tauri-plugin-opener` (keep the WSL special-case behavior) |
| Electron `Notification` | `tauri-plugin-notification` |
| Electron `Menu` (native + accelerators) | Tauri 2 menu API (muda); same `shared/menus.ts` tree drives it via a serialized export (subsystems/window-shell-menus.md) |
| frameless + `-webkit-app-region` | `decorations:false` on Win/Linux + `data-tauri-drag-region` (per-element — children need it too; double-click-maximize is manual); macOS `titleBarStyle: Overlay` + first-class `trafficLightPosition` (Tauri ≥2.4). Windows has no WCO equivalent — v1's `env(titlebar-area-*)` CSS is dead; we draw our own controls (already exist) |
| `utilityProcess` plugin isolation | dropped with JS plugins; future sandbox per ADR-0003 |
| `child_process` (brew, unzip) | `std::process::Command` (brew); `zip` crate ≥8.x (maintained at repo `zip-rs/zip2` but published as `zip`) instead of shelling to `unzip` |
| Node `http` MCP server (legacy SSE) | rmcp 2.x `StreamableHttpService` mounted in axum on 127.0.0.1 — **Streamable HTTP `/mcp`, SSE endpoints not ported** (ADR-0006); same bearer token, Host guard + spec-mandated Origin validation |
| raw `fetch` AI providers | `reqwest` 0.13 + SSE parsing (`eventsource-client`, or `bytes_stream` + `eventsource-stream`; not the stale `reqwest-eventsource`), same `tracedFetch`-style activity recording |
| electron-builder (dmg/appx/AppImage) | `tauri-bundler` (+ ADR-0008 for the Microsoft Store path) |

## Concurrency model (new — v1 had none worth the name)

- One tokio runtime in the core process. **No IPC handler may block it**:
  drivers with blocking clients (rusqlite) run on `spawn_blocking`;
  everything else is async end-to-end.
- Per-connection state (adapter instances, sessions, transactions) lives in
  a `ConnectionManager` actor/`DashMap` keyed by profile id — the v1
  `activeAdapters` map, made thread-safe.
- Query cancellation is first-class: every running query registers a
  cancellation handle (`pg` cancel token, mysql KILL, `rusqlite::interrupt`,
  driver-specific elsewhere) so `DB_QUERY_CANCEL`-equivalent behavior works
  uniformly — including for SQLite, fixing the v1 defect.
- Events that fan out (activity batches, AI stream chunks) go through
  bounded channels; backpressure drops per v1 batcher semantics rather than
  growing unbounded queues.

## Error taxonomy

`shared/db-errors.ts` (`DbErrorCode`) is mirrored as a Rust enum with
identical serialized wire form. Every driver maps native errors to it;
error-parity tests pin the mapping (orchestration/verification.md). Core
uses `thiserror` per crate; IPC responses serialize errors in the exact
shape v1 handlers produced (a rejected promise with `message`, plus
structured fields where v1 had them).

## What stays TypeScript

- The renderer, whole.
- `shared/` as the **authoring format** of the contract; Rust types are
  generated/mirrored from it with a drift-check in CI (04-ipc doc §codegen).
- `shared/i18n` — the catalogue is renderer-consumed; backend-originated
  user-visible strings must arrive as message *keys* + params (v1 already
  leans this way for error rules; the port completes it).
- `shared/menus.ts` — still authored in TS; a build step serializes the menu
  tree to JSON consumed by the Rust menu builder, so macOS native menus and
  the Win/Linux app-drawn MenuBar keep one source of truth.

## Fitness functions (CI-enforced invariants, ported)

- no string-literal channel names at call sites (existing test, kept);
- generated bindings match `shared/ipc.ts` (new drift check, both directions);
- no db-type branches in core/renderer (`export-import-no-hardcoding`, kept);
- `cargo clippy -D warnings`, `cargo fmt --check`, no `unwrap()`/`expect()`
  on IPC-reachable paths (clippy lint config + review lens);
- no `tokio` blocking-in-async (clippy + `tokio-console` spot checks at gates).
