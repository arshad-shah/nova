# Migration strategy — phases, ordering, exit criteria

## Shape of the migration

This is a **parallel-build strangler**, not an in-place rewrite: the Tauri
app grows in `src-tauri/` next to the living Electron app, both driven by
the same frozen IPC contract and the same renderer, until the Tauri side
passes full parity and v1 is deleted at cutover. At every phase boundary the
Tauri app **builds, boots, and does everything the previous phase proved** —
there is no "big bang integration" phase at the end.

Two consequences the swarm must respect:

1. **The renderer runs against both backends throughout.** The bridge shim
   (Phase 1) makes `window.electronAPI` an interface with two
   implementations. Channels the Rust side hasn't implemented yet fail soft
   with a distinctive `NOT_MIGRATED` error — visible, greppable, and counted
   by the phase gates (the migration's burndown metric is literally the
   number of channels still returning `NOT_MIGRATED`).
2. **Parity before polish.** A subsystem is ported when its golden parity
   cases pass, not when its code "looks done".

## Phases

Task ids are `T-<phase><nn>`. The full graph lives in [`tasks/INDEX.md`](./tasks/INDEX.md).

### Phase 0 — Preflight (T-0xx)

Ratify the ADRs (human touchpoint), validate ecosystem assumptions against
the *current* versions of Tauri/crates (the spec was written against a
point-in-time snapshot; the first task re-verifies every version/capability
claim and amends ADRs that drifted), record the v1 performance baseline,
build the parity-harness skeleton + golden-file generator driven from v1,
stand up Rust CI (fmt/clippy/test) alongside the existing pnpm CI, create
the `v2-tauri` integration branch.

**Gate:** ADRs marked `accepted`; harness produces and replays at least one
golden case against v1; CI green on the integration branch.

### Phase 1 — Shell & bridge (T-1xx)

Tauri scaffold (`src-tauri/`, workspace, `tauri.conf.json`), the command
dispatch + event emit plumbing, binding generation with the ipc-contract
drift check, the renderer **bridge shim** (`electronAPI` shape over
`invoke`/`listen`, `platform` from the OS plugin), window shell: frameless
Win/Linux + overlay macOS title bar, drag regions, window controls,
maximize-change events, the native menu built from serialized
`shared/menus.ts` (+ accelerators from keybindings), edit-role
reimplementation, `open-external` (incl. WSL behavior), dialogs,
file-drop replacement for `File.path`, devtools/reload/fullscreen.

**Gate:** the React app boots inside Tauri on the dev machine; every
`window:`-domain channel works; every other channel returns `NOT_MIGRATED`;
window/menu behavior parity checklist (manual, scripted steps committed with
results); renderer test suites still green with the shim's test stub.

### Phase 2 — Core services (T-2xx)

Config store (config.json read/write parity — a v1 file must round-trip
byte-stable modulo key order), keyring (+ migration read of v1
`credentials.enc`), app-data SQLite store with the v1 schema + migrations
(a v1 `app.db` opens as-is), settings pipeline (`settings:*` +
`settings:changed` broadcast + menu rebuild on keybinding change), activity
log/batcher/`activity:*`, attention hub, `appdata:*` (15 channels),
`connections:*` (list/save/delete with secret extraction), dialog + app
domains, v1-data-migration crate.

**Gate:** all `settings:`/`appdata:`/`connections:`/`keyring:`/`activity:`/
`dialog:`/`app:` channels live; parity: v1 config.json + app.db fixtures
round-trip; secrets never appear in config.json or logs (adversarial case);
tab persistence + query history + conversations function in the Tauri app
end-to-end.

### Phase 3 — Database engine & drivers (T-3xx)

The `verql-db` core (adapter trait, registry, connection manager, sessions/
transactions, cancellation, timeouts, capability serialization, error
taxonomy), then the six drivers **in parallel** (sqlite, postgres, mysql,
mongodb, redis, snowflake — each with its full parity suite incl. error
cases against the seeded test DBs), ssh-tunnel middleware, plan parsing
(postgres EXPLAIN tree; sqlite EXPLAIN QUERY PLAN), migration/type-map +
DDL generation, `db:*` (31 channels) + `export:`/`import:`/`migration:`
glue over the format registries (stub formats acceptable until Phase 4).

**Gate:** full driver parity suites green against seeded DBs; the SQLite
long-query test proves the UI thread never blocks and cancellation works
(the v1 defect is demonstrably fixed); per-query timeouts enforced on all
drivers that support them **including Snowflake**; 100k-row result
performance guardrail met.

### Phase 4 — Contribution surfaces & plugin platform (T-4xx)

Registries as Rust traits (exporter/importer/formatter/type-mapper/theme/
command/completion/drag-drop), `verql-formats` (csv/json/jsonl/sql — parity
with v1 exports byte-for-byte where formats are deterministic),
`verql-themes` (10 themes + validation), plugin manifest model, discovery/
install (zip crate, same guards), permission model, **declarative**
third-party plugins (themes/connection fields) loading end-to-end,
`plugins:*` (22) + `themes:*` channels, plugin lifecycle events.

**Gate:** export/import parity suite green; all 10 themes render identically
(screenshot diff on the theme gallery story); a sample declarative
third-party plugin installs from zip and survives the same attack fixtures
v1 guards against (zip-slip, symlink, name-collision — adversarial cases).

### Phase 5 — AI, tools & MCP (T-5xx)

ToolRegistry + db-tools port, AI provider clients (anthropic/openai/ollama;
SSE streaming; `tracedFetch`-equivalent activity recording), conversation
manager (system prompt assembly, token budget trim, tool-call loop,
`ai:chat:event` stream shape **identical** to v1), permission manager +
approval flow, app-actions round trip, `ai:*` (24 channels), MCP server
(token auth, Host + Origin guards, **Streamable HTTP `/mcp`** per the
amended ADR-0006 — legacy SSE endpoints are not ported; the client
reconfiguration notice ships with it), approval + attention integration,
`mcp:*` (9), os-notifications consumer.

**Gate:** recorded v1 chat-event streams replay identically from the Rust
side (fixture-based — providers mocked); a live MCP client (Claude Code)
connects, lists tools, executes a read tool, and a write tool round-trips
approval; `NOT_MIGRATED` count is zero.

### Phase 6 — Updater, packaging & cutover (T-6xx)

Updater registry + homebrew channel (+ store/appimage strategies per
ADR-0008), `updater:*`, about-info, packaging for all three platforms,
signing/identity, first-run migration UX from a real v1 install, perf
baseline comparison, docs updates (`docs/architecture.md` and friends
rewritten for v2), v1 deletion (`src/main/`, `src/preload/`, electron deps)
behind the final gate, cutover checklist for the human.

**Gate:** the success criteria in `00-goals-and-non-goals.md`, in full.

## Ordering rationale & risk front-loading

- The bridge shim and binding pipeline come first because **every**
  subsequent task depends on the contract plumbing; they are the critical
  path.
- Drivers dominate the schedule (six near-independent L-sized tasks) —
  Phase 3 is where the swarm fans out widest; Phase 2 is deliberately small
  so the fan-out starts early.
- The highest-uncertainty items get spike tasks in Phase 0/1 rather than
  discovery-during-port: Snowflake auth-mode reality under the 2026 MFA
  enforcement (ADR-0004),
  Microsoft Store packaging (ADR-0008), macOS overlay-titlebar behavior,
  and WebKitGTK's fitness for the heavy renderer views (T-009).
- Anything cut from scope mid-flight (per the non-goals) is recorded in the
  task Log + `decisions/`, never silently dropped.

## Cross-phase rules

- A phase's tasks may be dispatched as soon as the previous phase's **gate
  is green**, except tasks explicitly marked `depends_on` an earlier task
  only — the graph, not the phase number, is authoritative for readiness.
- `NOT_MIGRATED` stubs are tracked in one table
  (`tasks/channel-burndown.md`, updated by the orchestrator at each merge)
  so coverage is observable at a glance.
- v1 code is read-only reference until Phase 6. Fixing a v1 bug during the
  port is *forbidden by default* (parity means bug-for-bug) unless the bug
  is on the sanctioned fix list in `01-current-state-inventory.md` §known
  defects — those fix tasks assert the *corrected* behavior in their parity
  allowlists.
