# Current state inventory (v1.5, Electron)

The audited ground truth this migration ports from. Compiled from a full
sweep of the source; re-verify against the code (paths given) before relying
on any detail — `main` may have moved since this was written.

**Scale:** ~65k LOC TypeScript — `src/main/` 17k, `src/renderer/` 43k,
`shared/` 4.5k, `src/preload/` 31 lines. Electron 39, React 19, Vite/electron-vite,
pnpm. Renderer is fully sandboxed (`contextIsolation`, no `nodeIntegration`);
every privileged operation crosses the typed IPC boundary.

## The IPC boundary (the migration's spine)

`shared/ipc.ts` single-sources the entire contract:

- **143 invoke channels** (request/response), by domain:
  `db:` 31 · `ai:` 24 · `plugins:` 22 · `appdata:` 15 · `window:` 12 ·
  `mcp:` 9 · `settings:` 4 · `connections:`/`export:`/`import:`/`keyring:`/
  `app:`/`updater:`/`activity:` 3 each · `migration:`/`dialog:` 2 each ·
  `themes:` 1.
- **15 broadcast events** (main→renderer): `ai:chat:event`, `ai:explain:event`,
  `mcp:approval-request`, `mcp:activity-event`, `activity:event`,
  `activity:batch`, `menu:action`, `plugins:lifecycle`,
  `plugins:ui:contributions-changed`, `settings:changed`,
  `notifications:show`, `themes:changed`, `updater:progress`,
  `app:action:perform`, `window:maximize-changed`. (Oddity worth knowing:
  `plugins:ui:contributions-changed` is registered both as an invoke channel
  and as an event — the per-domain counts above include it on the invoke side.)
- Preload (`src/preload/index.ts`) exposes exactly `platform`,
  `invoke(channel, ...args)`, `on(channel, cb) → unsubscribe` as
  `window.electronAPI`. Nothing else.
- Renderer consumption: 166 `invoke` call sites across 54 files, ~20 `on`
  subscriptions across 19 files — but all channel names/types come from
  `shared/ipc.ts`, and a CI test rejects string-literal channels. **A shim
  implementing the `electronAPI` shape over Tauri keeps all call sites
  unchanged.**

## Main-process subsystems (`src/main/`)

| Subsystem | Files | What it does | Electron/Node coupling |
|---|---|---|---|
| Bootstrap | `index.ts` | single BrowserWindow (frameless on Win/Linux, `hiddenInset` on macOS), security guards, maximize broadcast | `app`, `BrowserWindow`, `nativeImage` |
| Composition root | `ipc-handlers.ts` | builds every registry + store, wires plugins, boots MCP, teardown | `ipcMain` (via `ipc/context.ts`) |
| Config store | `config/store.ts` | `userData/config.json` (connections + settings), atomic writes (`lib/atomic-write.ts`), secrets stripped to keyring, prototype-pollution-guarded key paths, change listeners | `fs` |
| Keyring | `keyring.ts` | `userData/credentials.enc` (mode 0600) encrypted with `safeStorage`; `plain:` base64 fallback when no OS backend | `safeStorage` |
| App-data store | `appdata/store.ts` | SQLite `userData/app.db` via better-sqlite3; WAL; PRAGMA `user_version` forward-only migrations (v1 conversations/messages/saved_queries/meta, v2 query_history, v3 open_tabs); corrupt-file quarantine | better-sqlite3 (native) |
| DB layer | `db/adapter.ts`, `db/factory.ts` | `DbAdapter` interface + registry-resolved factory; **all drivers are plugins** | none (interface only) |
| IPC handlers | `ipc/*.ts` (18 files) | per-domain handlers; `ipc/context.ts` traces every call into the activity stream | `dialog` (export-import/dialog/plugins), `shell.openExternal` + WSL `cmd.exe` fallback (window), `Menu` popup, edit roles (window) |
| Activity | `activity/` | in-memory unified log; global sink; **batcher** coalescing into `activity:batch`; `tracedFetch` wrapper for AI network calls | — |
| Attention hub | `attention/attention-hub.ts` | delivery-agnostic "user response needed" relay; consumed by os-notifications plugin | — |
| MCP server | `mcp/` | Node `http` on `127.0.0.1` (default port 3100, auto-port probe), `@modelcontextprotocol/sdk` **SSE transport** (`GET /sse`, `POST /messages`, `GET /health`); 32-byte bearer token in keyring ns `__mcp__`, timing-safe compare, Host-header DNS-rebinding guard; tools from the shared ToolRegistry gated by `mcp.disabledTools`/`mcp.readOnly`; write tools need approval (renderer + attention hub, 5-min timeout) | Node `http` |
| Updater | `updater/` | **custom registry, NOT electron-updater**: first-available channel wins; only Homebrew implemented (shells to `brew` via `spawn`); planned ids `mas/win-store/snap/apt/dmg-direct`; progress via `updater:progress` | `child_process` |
| Menus | `app-menu.ts` + `shared/menus.ts` | declarative tree (31 action ids, surface/platform gates, `nativeRole` passthrough); native menu built on every platform (accelerator table); non-role items emit `menu:action`; rebuilt on keybinding change | `Menu` |
| Migration helpers | `migration/type-map.ts` | cross-DB type mapping + DDL generation (pure) | — |

## Plugin platform (`src/main/plugins/`)

- **Lifecycle** (`plugin-host.ts`, 961 LOC): discover → validate → resolve →
  activate → verify → runtime; `PluginBootCoordinator`; degraded state when
  declared contributions aren't registered; error budget auto-deactivates
  misbehaving plugins; `db-tools` is essential (cannot disable).
- **SDK** (`sdk/`, ~2.8k LOC): registries — driver, tool (flat, shared with
  MCP), command, panel, ui (widgets/slots), completion, service (pub/sub),
  exporter, importer, formatter, type-mapper, theme, drag-drop; access
  objects — connections (**enforced** permission), schema, keyring
  (**enforced**), settings (namespaced), ipc (**enforced**), broadcast,
  notifications, ai. Pure helpers (SQL quoting/DDL/insert-gen/statement
  split, theme validation, JSON-schema→zod) are electron-free.
- **Permissions**: enforced `keyring|connections|ipc` (guards at SDK
  boundary); advisory `network|filesystem|process` (only enforceable under
  isolation). Grants = manifest-declared ∩ user-granted; bundled = trusted.
- **Isolation** (`isolation/`, ~1k LOC): untrusted marshalling-safe plugins
  (commands/themes/connectionFields/settings only) run in an Electron
  `utilityProcess` behind a JSON-RPC bridge with a CJS `Module.require`
  patch sandbox gating Node builtins by permission. Rich plugins can't
  isolate and run in-process.
- **Install**: zip → temp dir (zip-slip + symlink + name-collision guards)
  → `userData/plugins/<name>`. Uses `execFileSync('unzip')`.
- **Published SDK**: `packages/plugin-sdk` (`@verql/plugin-sdk` v0.11.0) —
  curated electron-free re-export mirror of `sdk/`, zod as only dep, pinned
  by the `sdk-public-surface` test.

### Bundled plugins (all trusted, in-process)

| Plugin | npm deps | Contributes | LOC |
|---|---|---|---|
| `sqlite` | better-sqlite3 | driver (sync! blocks main thread — known v1 defect), sql export/import/format, type maps, completions | 592 |
| `postgresql` | pg | driver, `$n` placeholders, EXPLAIN ANALYZE plan parser, isolation levels, ssl fields | 777 |
| `mysql` | mysql2 | driver, backtick quoting, per-query timeout | 480 |
| `mongodb` | mongodb | driver (editorLanguage json, statementSyntax mongodb, nouns collection/field/document), jsonl/json-array exporters, AI context provider | 689 |
| `redis` | ioredis | driver (statementSyntax redis), json exporter, command completions | 544 |
| `snowflake` | snowflake-sdk | driver (+switchWarehouse/switchRole), toolbar contribution, queryTimeout **not yet enforced** (v1 defect) | 655 |
| `db-tools` | zod | AI/MCP tools (query, schema inspection, get_app_activity); essential | 227 |
| `ai` | none (raw `fetch`) | providers anthropic/openai/ollama over REST (no vendor SDKs), conversation manager, permission manager, commands, chat panel, `ai` service | 2384 |
| `core-formats` | csv-parse/stringify | csv/json exporters, csv/tsv importer, generic sql formatter | 120 |
| `core-themes` | none | 10 themes (data-only) | 698 |
| `ssh-tunnel` | ssh2 + `net` | connection middleware (local port-forward), ssh* connection fields | 130 |
| `os-notifications` | Electron `Notification` | attention-hub consumer → native notifications; `os-notifications` service | 280 |

### DbAdapter contract (`db/adapter.ts`)

Required: `connect, disconnect, testConnection, query(sql, params?, {sessionId?, timeoutMs?}),
getTables, getColumns, getIndexes, getRowCount, getSchemas, getDatabases,
switchDatabase, isConnected`. Optional: `setSchema, switchWarehouse,
switchRole, cancelQuery, getConnectionOptions, parseQueryPlan,
getSchemaObjects`, sessions/transactions (`openSession, closeSession,
setAutoCommit, beginTransaction, commit, rollback`). Driver *factories* also
declare serializable capabilities: connection fields, quoteChar,
placeholderStyle, editorLanguage, statementSyntax, errorRules (regex →
`DbErrorCode`), nouns, session/explain support, sampleQuery,
getTableData, generateMigrationDdl.

## Renderer coupling (what must change vs what must not)

Migration-sensitive hotspots — the **complete** list of renderer changes:

1. `src/preload/` bridge → a `window.electronAPI`-shaped shim over Tauri
   `invoke`/`listen` (+ `platform`).
2. `lib/platform.ts` reads `electronAPI.platform`.
3. Drag regions: CSS `drag-region`/`no-drag` (`-webkit-app-region`) in
   `TitleBar.tsx`, `WindowControls.tsx`, `MenuBar.tsx` → Tauri's mechanism.
4. `TitleBar.tsx`: `env(titlebar-area-*)` (Windows WCO) + macOS traffic-light
   repositioning via `WINDOW_SET_TITLEBAR_HEIGHT`.
5. `WindowControls.tsx`: `WINDOW_MINIMIZE/TOGGLE_MAXIMIZE/CLOSE/IS_MAXIMIZED`
   + `window:maximize-changed`.
6. `menu-model.tsx`: `WINDOW_EDIT_ROLE` (Electron webContents edit roles for
   undo/redo/cut/copy/paste/selectAll — **no Tauri equivalent**, needs a
   DOM/Monaco-level reimplementation), `WINDOW_OPEN_EXTERNAL`,
   `WINDOW_TOGGLE_FULLSCREEN/RELOAD/DEVTOOLS`.
7. `hooks/useFileDropForwarding.ts` reads Electron-only `File.path` —
   must move to the Tauri file-drop event.
8. Storybook stub (`.storybook/preview.tsx`) + 12 unit-test files that stub
   `window.electronAPI` — keep working by preserving the bridge shape.

Migration-neutral (do not touch): Monaco 0.55, AG Grid 35, @xyflow/react 12,
`@arshad-shah/swift-chart`, shiki, all Zustand stores, the entire component
tree, `ContextMenu` (pure DOM), clipboard (`navigator.clipboard`),
`import.meta.env.DEV` gates (Vite works under Tauri).

Note: `WINDOW_MENU_LIST`/`WINDOW_MENU_POPUP` channels exist but have **zero
renderer call sites** — candidates for dropping at cutover, not porting.

## Known v1 defects the migration fixes by design

- SQLite driver runs synchronously on the main process thread — long queries
  freeze UI + all IPC; per-query timeout unenforceable (documented in
  `docs/architecture.md`). In Rust: dedicated blocking task, interruptible.
- Snowflake `queryTimeout` setting not applied.
- Advisory permissions (`network`/`filesystem`/`process`) unenforceable for
  in-process plugins — moot once bundled logic is native and third-party
  code is sandboxed by construction (ADR-0003).

## Test & tooling baseline

- Vitest: `unit` (jsdom) + `storybook` (Playwright browser) projects.
- Seeded test DBs: `scripts/test-dbs.sh` (Postgres/MySQL/Mongo/Redis via
  docker-compose, seeded SQLite file) — the parity-harness fixture layer.
- CI-enforced invariants worth preserving: no string-literal IPC channels;
  `export-import-no-hardcoding` (no db-type branches in glue/renderer);
  `sdk-public-surface` (published SDK barrel pinned).
- Packaging: electron-builder — macOS dmg, Windows appx (Microsoft Store
  identity block in `package.json#build.appx`), Linux AppImage.
