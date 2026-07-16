# Task index

Authoritative task graph. One row per task file. Update in the same commit
as any task-state change. `T-x99` tasks are phase gates (run per
`../orchestration/verification.md`). Estimates: S ≤ half a session, M ~ one
session, L = one session of a strong agent fully focused.

Status legend: `open` `in_progress` `in_review` `blocked` `done`

## Phase 0 — Preflight

| id | title | depends_on | risk | est | status |
|---|---|---|---|---|---|
| T-001 | Ratify ADRs with the human owner | — | high | S | open |
| T-002 | Validate ecosystem assumptions (Tauri, crates, rmcp, bundler targets) | — | high | M | open |
| T-003 | Integration branch, Rust CI, burndown + gate-report scaffolding | T-001 | low | S | open |
| T-004 | Capture v1 performance baseline | T-003 | low | S | open |
| T-005 | Parity harness skeleton + golden generator from v1 | T-003 | high | L | open |
| T-006 | Spike: v1 secrets readability per platform (amend ADR-0007) | T-001 | high | M | open |
| T-007 | Spike: Snowflake SQL REST API (auth, query, introspection) | T-001 | high | M | open |
| T-008 | Spike: Windows Store/MSIX packaging path (amend ADR-0008) | T-001 | high | M | open |
| T-009 | Spike: WebView compat smoke of heavy renderer views (Monaco/AG Grid/xyflow) | T-002 | high | M | open |
| T-099 | Phase 0 gate | T-001..T-009 | — | S | open |

## Phase 1 — Shell & bridge

| id | title | depends_on | risk | est | status |
|---|---|---|---|---|---|
| T-101 | Tauri scaffold: src-tauri workspace, conf, main.rs, dev boot of renderer | T-099 | medium | M | open |
| T-102 | `ipc_dispatch` + event emit + tracing middleware + NOT_MIGRATED table (all 143 channels) | T-101 | high | M | open |
| T-103 | Contract mirror in Rust + CI drift check + round-trip fixture framework | T-102 | high | L | open |
| T-104 | Renderer bridge shim (`backend-bridge.ts`, platform hydration, stubs intact) | T-102 | high | M | open |
| T-105 | Window shell: frameless/overlay title bar, drag regions, window controls + maximize events | T-101, T-104 | high | M | open |
| T-106 | Menus: serialize `shared/menus.ts` → Rust menu builder, accelerators, `menu:action`, keybinding rebuild | T-104 | high | L | open |
| T-107 | Edit-role reimplementation (undo/redo/cut/copy/paste/selectAll) | T-104 | medium | M | open |
| T-108 | open-external (incl. WSL), fullscreen/reload/devtools, `dialog:*` | T-104 | low | S | open |
| T-109 | File-drop port (`File.path` → Tauri drag-drop event) | T-104 | medium | S | open |
| T-199 | Phase 1 gate | T-101..T-109 | — | M | open |

## Phase 2 — Core services

| id | title | depends_on | risk | est | status |
|---|---|---|---|---|---|
| T-201 | verql-core: paths, atomic write, error base, AppSettings mirror | T-199 | low | M | open |
| T-202 | Config store crate + `settings:*` + `settings:changed` + menu rebuild hook | T-201 | medium | M | open |
| T-203 | Keyring crate + `keyring:*` + secret-field keys + profile-secret extract/inject/strip | T-201, T-006 | high | M | open |
| T-204 | `connections:*` (list/save/delete with secret handling) | T-202, T-203 | medium | S | open |
| T-205 | AppData store (rusqlite, v1 schema+migrations, WAL, quarantine) + `appdata:*` (15) | T-201 | medium | L | open |
| T-206 | Activity log + batcher + `activity:*` + batch/event broadcasts | T-201 | medium | M | open |
| T-207 | Attention hub | T-201 | low | S | open |
| T-208 | `app:*` (restart, about-info, action-result plumbing) | T-201 | low | S | open |
| T-209 | verql-migrate-v1: locate v1 userData, import config/app.db/secrets | T-202, T-203, T-205 | high | L | open |
| T-299 | Phase 2 gate | T-201..T-209 | — | M | open |

## Phase 3 — Database engine & drivers

| id | title | depends_on | risk | est | status |
|---|---|---|---|---|---|
| T-301 | verql-db core: Driver trait, registry, ConnectionManager, sessions/txn, cancel, timeouts, capabilities, DbErrorCode | T-299 | high | L | open |
| T-302 | `db:*` handlers (31 channels) over the registry | T-301 | medium | M | open |
| T-303 | SQLite driver + parity suite (non-blocking + interrupt) | T-301 | medium | L | open |
| T-304 | PostgreSQL driver + parity suite (incl. EXPLAIN plan parser) | T-301 | medium | L | open |
| T-305 | MySQL driver + parity suite | T-301 | medium | L | open |
| T-306 | MongoDB driver + parity suite (command-syntax translation) | T-301 | high | L | open |
| T-307 | Redis driver + parity suite | T-301 | medium | L | open |
| T-308 | Snowflake driver (REST) + parity suite (incl. queryTimeout fix) | T-301, T-007 | high | L | open |
| T-309 | SSH tunnel middleware (russh) + connection fields | T-301 | high | M | open |
| T-310 | Type-map + DDL generation + `migration:*` | T-301 | low | M | open |
| T-311 | Export/import glue (`export:*`, `import:*`, dialogs; formats may stub) | T-302 | medium | M | open |
| T-399 | Phase 3 gate | T-301..T-311 | — | L | open |

## Phase 4 — Contribution surfaces & plugin platform

| id | title | depends_on | risk | est | status |
|---|---|---|---|---|---|
| T-401 | Registry traits: exporter/importer/formatter/type-mapper/command/completion/drag-drop + resolution rules | T-399 | medium | M | open |
| T-402 | verql-formats: csv/json/jsonl/sql exporters+importers + formatters (dialect-aware) | T-401 | medium | L | open |
| T-403 | verql-themes: model, validation, 10 core themes, `themes:*` + changed event | T-401 | low | M | open |
| T-404 | Plugin manifest model + discovery/validation | T-401 | medium | M | open |
| T-405 | Plugin install/uninstall (zip crate; zip-slip/symlink/collision guards) | T-404 | high | M | open |
| T-406 | Permission model + grants persistence + consent parity | T-404 | medium | M | open |
| T-407 | `plugins:*` (22) + lifecycle events + declarative plugin loading e2e | T-405, T-406 | medium | L | open |
| T-499 | Phase 4 gate | T-401..T-407 | — | M | open |

## Phase 5 — AI, tools & MCP

| id | title | depends_on | risk | est | status |
|---|---|---|---|---|---|
| T-501 | ToolRegistry + db-tools tools + schema/gating | T-499 | medium | M | open |
| T-502 | AI provider clients (anthropic/openai/ollama; SSE; traced network activity) | T-499 | medium | L | open |
| T-503 | Conversation manager: prompt assembly, token budget, tool loop, `ai:chat:event` stream parity | T-501, T-502 | high | L | open |
| T-504 | AI permission manager + approvals + app-actions round trip | T-503 | medium | M | open |
| T-505 | `ai:*` (24 channels) + conversation persistence wiring | T-503 | medium | M | open |
| T-506 | MCP server (rmcp/axum, token auth, SSE-compatible transport, health) + `mcp:*` | T-501 | high | L | open |
| T-507 | MCP write-approval flow + attention integration | T-506, T-504 | medium | M | open |
| T-508 | os-notifications port (attention consumer → tauri-plugin-notification) | T-499 | low | S | open |
| T-599 | Phase 5 gate | T-501..T-508 | — | L | open |

## Phase 6 — Updater, packaging & cutover

| id | title | depends_on | risk | est | status |
|---|---|---|---|---|---|
| T-601 | Updater registry + Homebrew channel + `updater:*` | T-599 | medium | M | open |
| T-602 | Packaging: macOS dmg + Homebrew cask script update | T-599 | medium | M | open |
| T-603 | Packaging: Linux AppImage | T-599 | medium | S | open |
| T-604 | Packaging: Windows (NSIS + MSIX per ADR-0008/T-008 outcome) | T-599, T-008 | high | M | open |
| T-605 | First-run migration UX (detect v1, run importer, report incompatible JS plugins) | T-599, T-209 | high | M | open |
| T-606 | Performance comparison vs T-004 baseline + report | T-601..T-605 | medium | M | open |
| T-607 | Docs rewrite: docs/, site/ counterparts, CLAUDE.md | T-601..T-605 | medium | L | open |
| T-608 | v1 deletion: src/main, src/preload, electron deps, CI cleanup | T-606, T-607 | medium | M | open |
| T-609 | Cutover checklist + human sign-off | T-608 | high | S | open |
| T-699 | Final gate (= success criteria in 00-goals) | T-609 | — | L | open |

## Burndown

Channel coverage is tracked in [`channel-burndown.md`](./channel-burndown.md),
regenerated by the orchestrator at every merge.
