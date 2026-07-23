---
title: Architecture
description: An end-to-end tour of Verql's orchestrator-plus-plugins design across the Electron main, preload, and renderer processes.
sidebar:
  order: 1
---

Verql is a desktop database client built on **Electron + React**. The guiding
principle is **orchestrator + plugins**: `src/main/` is a thin orchestrator
(windows, IPC, plugin host, config), and everything dialect- or format-specific
— database drivers, import/export formats, themes, the AI assistant — lives in a
plugin under `src/main/plugins/bundled/`. Adding a database type or file format
means writing a plugin, not editing the core.

- [Process model](#process-model)
- [The shared boundary](#the-shared-boundary)
- [Main process](#main-process)
- [Renderer](#renderer)
- [Plugin system](#plugin-system)
- [AI assistant](#ai-assistant)
- [Data flow: two worked examples](#data-flow-two-worked-examples)
- [Build, packaging, and testing](#build-packaging-and-testing)
- [Directory map](#directory-map)

> **Prefer pictures?** [`diagrams.md`](/develop/diagrams/) is a diagram-first visual
> tour of every subsystem below (context, components, sequences, state machines,
> class and data models) — a companion to this prose.

## Process model

Standard three-layer Electron split:

| Layer | Lives in | Runtime | Trust |
|-------|----------|---------|-------|
| **main** | `src/main/` | Node.js | full (filesystem, network, native drivers) |
| **preload** | `src/preload/` | sandboxed bridge | exposes a single typed `window.electronAPI` |
| **renderer** | `src/renderer/src/` | Chromium + React 19 | no Node access; talks only through the bridge |

`src/preload/index.ts` exposes exactly two methods —
`invoke<K>(channel, ...args)` (request/response) and `on(channel, cb)`
(subscribe to a push) — both typed by the channel map. The renderer has no other
way to reach the OS.

## The shared boundary

`shared/` holds the TypeScript contracts both processes import:

| File | Contract |
|------|----------|
| `ipc.ts` | every IPC channel + event, as a typed map and `SCREAMING_SNAKE_CASE` constants |
| `types.ts` | domain types: `ConnectionProfile`, `QueryResult`, `Tab`, schema metadata |
| `ai-types.ts` | chat messages, stream events, the chat-start request |
| `settings.ts` | `AppSettings` shape + defaults (+ centralized `KEYBINDING_ACTION` ids) |
| `driver-capabilities.ts` | serializable driver capability flags — incl. `statementSyntax`, `errorRules`, `nouns` (object/field/record terms so the explorer isn't SQL-specific), plan/session/explain support |
| `db-errors.ts` | `DbErrorCode` taxonomy + serializable `DbErrorRule` (driver-contributed error classification) |
| `i18n/` | the message catalogue + framework-free `t()` / `MessageKey` (see [i18n.md](/develop/i18n/)) |
| `activity.ts` | the unified activity-stream types (`ActivityKind`, entries) shared by the recorder, the renderer panel, and AI/MCP tool access (see [activity.md](/develop/activity/)) |
| `export-import.ts` | renderer-facing export/importer format descriptors, derived from the plugin registries so a connection only offers formats its driver actually supports |
| `mcp.ts`, `plugin-ui-types.ts`, `appdata.ts` | MCP types, plugin UI contracts, app-data-store record types |

All renderer↔main traffic goes through `ipc.ts`. The constant is mandatory at
every call site (a CI test rejects string-literal `invoke`/`on` calls). See
[ipc.md](/develop/ipc/) for how to add a channel.

## Main process

`src/main/index.ts` creates the window and bootstraps the subsystems.
`ipc-handlers.ts` registers handlers, delegating by domain to files under
`src/main/ipc/` (`connections.ts`, `db.ts`, `export-import.ts`, `plugins.ts`,
`settings.ts`, `mcp.ts`, …).

| Subsystem | Where | Notes |
|-----------|-------|-------|
| **Config store** | `config/store.ts` | one JSON file (connections + settings), atomic writes; connection secrets are extracted to the OS keyring, never written to disk |
| **Keyring** | `keyring.ts` | `safeStorage`-backed secret storage, namespaced |
| **Database adapters** | `db/` | just the `DbAdapter` interface + a `factory.ts` shim; every driver (sqlite/postgresql/mysql included) is a plugin that registers with the SDK `DriverRegistry`, and `createAdapter` resolves through it |
| **Plugin host** | `plugins/` | discovers, validates, activates plugins; see below |
| **MCP server** | `mcp/` | exposes the shared tool registry to external MCP clients (e.g. Claude Code) over an approved, tokenised endpoint |
| **Attention seam** | `attention/` | a delivery-agnostic relay for "the user's response is needed" (approval prompts, alerts). Producers (AI/MCP approvals) call `request`/`resolve`; it's provided as the `attention` service so a plugin can surface it. The bundled `os-notifications` plugin owns the delivery (native OS notifications). Full detail + diagrams: [notifications.md](/develop/notifications/). |
| **Migration / updater** | `migration/`, `updater/` | schema-import migrations and auto-update |

`DbAdapter` (`db/adapter.ts`) is the contract every driver implements: connect /
query / introspect (`getTables`, `getColumns`, `getSchemas`, …) plus optional
session/transaction methods (`openSession`, `beginTransaction`, `commit`, …) for
drivers that support manual transactions, and an optional
`parseQueryPlan(result)` so EXPLAIN parsing stays in the driver.

**Drivers own their dialect knowledge end-to-end — the renderer never branches on
db type.** Beyond SQL generation, a driver declares serializable capabilities the
renderer consumes generically: `statementSyntax` (which statement splitter the
CodeLens gutter uses), `errorRules` (regexes that classify query errors —
messages stay in the renderer's i18n catalogue), `explain`/`session` support, and
`parseQueryPlan` for plan trees. This is enforced by the `export-import-no-hardcoding`
test, which fails if a db-type literal/branch reappears in the orchestrator or the
key renderer files. See [proposals/db-boundary-renderer-migration.md](https://github.com/arshad-shah/verql/blob/main/docs/proposals/db-boundary-renderer-migration.md).

Per-query timeouts (`opts.timeoutMs`) are honoured by the pooled SQL drivers:
Postgres sets a server-side `statement_timeout` on a dedicated client, MySQL
uses mysql2's per-query `timeout`.

> **Known limitation — SQLite runs synchronously on the main thread.** The
> `sqlite` plugin uses `better-sqlite3`, whose API is synchronous by design, and
> the adapter runs in the main process. A long-running query against a large
> SQLite file therefore blocks the main process — freezing the UI and all IPC
> until it returns — and a per-query timeout can't be enforced for SQLite
> (a JS timer can't fire mid-statement on the blocked thread, and `interrupt()`
> would have to come from another thread). Snowflake's `queryTimeout` is
> likewise not yet applied. The fix is to move the SQLite engine into a worker
> (the build already ships a second main-process worker entry — `plugin-worker`
> via `utilityProcess` — so the pattern is proven); it's deferred because the
> production worker-spawn + packaged native-module path needs verification in a
> real Electron build. Tracked as a follow-up.

## Renderer

A React 19 SPA. Two pillars: Zustand stores for state and a CVA-based primitives
design system for UI.

**Stores** (`src/renderer/src/stores/`):

| Store | Owns |
|-------|------|
| `connections.ts` | connection profiles, connect/disconnect lifecycle, active connection |
| `tabs.ts` | open tabs (a discriminated union: query / table / ER-diagram / connection-form / plugin-detail / install-plugin / settings / welcome / release-notes) |
| `schema.ts` | cached schema metadata keyed by connection + schema |
| `ui.ts` | panel layout, sidebars, bottom dock, settings category (persisted) |
| `ai.ts` | AI chat: messages, providers/models, **conversations + history** |
| `editor.ts`, `tab-actions.ts` | non-reactive registries of mounted Monaco editors / per-tab save+txn handlers |
| `query-history.ts` | recorded query runs (mirror of the SQLite app-data `query_history` table), capped to `general.maxHistoryItems` |
| `activity.ts` | mirrors the unified activity stream (cap 1000) that backs the Activity panel; applies each IPC batch in one update (see [activity.md](/develop/activity/)) |
| `explain.ts` | per-tab streaming state for the AI "Explain" feature (loading, streamed text, duration, error) |
| `statement-status.ts` | per-statement run status (`ok`/`error`/`running`, duration, row count), keyed by tab + statement hash, read by the `StatementGutter` |
| `src/renderer/src/lib/tab-persistence/` | incremental **tab-persistence engine** — per-tab restore-on-startup backed by the SQLite app-data store (`open_tabs`, over IPC); a pure diff/select core + debounced engine persists only the changed tab, restored when `general.restoreTabsOnStartup` is on |
| `selection.ts`, `notifications.ts`, `toast.ts` | inspector selection, the notification center, transient toasts |
| `driver-capabilities.ts`, `themes.ts`, `settings.ts` | capability flags, theme list, settings mirror |
| `plugin-*.ts` | plugin-contributed commands / panels / lifecycle |

**Settings** (`general.*`, `appearance.*`, `editor.*`, …) flow UI → `settings`
store → `settings:set` IPC → `ConfigStore` (atomic JSON, secrets to keyring) →
broadcast back; every setting is consumed somewhere (editor options, result
formatting, query history, tab restore, keybindings). Full pipeline + per-setting
consumers: [settings.md](/develop/settings/).

**Internationalization.** All user-facing strings resolve through `t()` from the
cross-process catalogue in `shared/i18n`; the renderer wraps it with
`<I18nProvider>` / `useTranslation` (locale synced from `general.language`). See
[i18n.md](/develop/i18n/).

**Design system** (`src/renderer/src/primitives/`) is organised by category
(`forms/`, `layout/`, `surfaces/`, `data-display/`, …) and styled with
class-variance-authority. Theming is three layers in `primitives/theme/tokens.css`
(raw color scale → semantic tokens remapped per theme → component tokens),
applied via a `data-theme` attribute by `ThemeProvider`. Variant names follow
semantic tokens (e.g. Button's destructive variant is `error`, not `danger`;
Banner gained a `success` variant), and most primitives now expose a `size`
variant. `Switch` is built from a hidden checkbox + a visual track driven by
`--color-switch-*` tokens so the toggle reads identically across light/dark/plugin
themes; `ColorInput`'s picker portals so it isn't clipped. The new
`GradientSurface` (`surfaces/`) paints a soft, theme-derived gradient
(`tone` × `intensity`) for hero panels, empty states, and callouts.

**Key libraries:** Monaco (SQL editor, custom completion in
`lib/monaco-sql.ts`), AG Grid (results), Recharts (chart panel). The ER diagram
is **handrolled** — no external graph library (see below).

**ER diagram.** `components/er/` is a self-contained, dependency-free entity-
relationship renderer (it replaced `@xyflow/react` + `@dagrejs/dagre`). The
split keeps every module single-purpose and the geometry testable headless:
`model.ts` (engine-agnostic schema shapes), `adapter.ts` (the one file that maps
a `SchemaColumn` onto that model), `theme-bridge.ts` (reads the ERD palette out
of the semantic token layer and repaints on `data-theme` change — the canvas
can't resolve `var(--…)`, so this is how the diagram follows the theme with zero
hardcoded colours), `metrics.ts` (content-driven card sizing), `notation.ts`
(crow's-foot / Information-Engineering cardinality symbols), `layout.ts` (a
layered rank/order/place engine — the dagre replacement, LR or TB), `route.ts`
(orthogonal corridor routing), `viewport.ts` (pan/zoom/hit-test), `paint.ts`
(canvas painter) and `svg.ts` (export serialiser — shares layout+routing with
the painter so the two can't disagree). `ErdView.tsx` is the only file that
imports React. Geometry invariants are guarded in `tests/unit/er/`.

**Query editor.** The query editor renders per-statement actions through a `StatementGutter` overlay rather than Monaco's built-in CodeLens. The splitter + lens actions are keyed by **statement syntax** (`'sql'` / `'redis'` / `'mongodb'`), which each driver declares via its `statementSyntax` capability — the renderer resolves the syntax from capabilities and looks up the matching contribution (no hardcoded db-type list). The gutter owns the view-zone + content-widget lifecycle and reads execution results from the `statement-status` store to show a per-statement chip (last run duration, row count, error).

## Plugin system

The orchestrator's extension mechanism. A plugin is a directory with a
declarative `manifest.json` (`contributes` block) and an `activate(ctx)` that
registers contributions through the SDK. Lifecycle: **discover → validate →
resolve → activate → runtime**, managed by the `PluginBootCoordinator` in
`plugins/plugin-host.ts`; what's declared in the manifest must actually be
registered or the plugin lands in a `degraded` state.

Contribution surfaces include drivers, exporters, importers, formatters, type
mappers, themes, panels, commands, AI providers, connection middleware, and
connection fields. (Query formatting is plugin-owned and keyed by editor
language: SQL drivers register a dialect formatter via the shared `formatSql`
helper, MongoDB a JSON one via `formatJson`, Redis tidies its plaintext command
buffer; the main app only resolves and invokes them over `db:format-query`.) The SDK (`plugins/sdk/`) provides the registries (`DriverRegistry`,
`ToolRegistry`, `CommandRegistry`, `PanelRegistry`, …) and access objects
(`SchemaAccess`, `ConnectionAccess`, `PluginSettings`) via the `PluginContext`.
Bundled plugins live in `plugins/bundled/` (`sqlite`, `postgresql`, `mysql`,
`mongodb`, `redis`, `snowflake`, `db-tools`, `ai`, `core-formats`, `core-themes`,
`ssh-tunnel`, `os-notifications`). Full guide: [plugins.md](/plugins/).

## AI assistant

The assistant is itself a bundled plugin. It registers AI providers and tools
through the SDK, shares one `ToolRegistry` with the MCP server, and can both
guide the user (deep-link chips) and act on the UI (an agentic App-Action
bridge). It keeps a persisted, branchable conversation history and trims each
request to a token budget. This is a subsystem in its own right — see
[ai.md](/develop/ai/).

## Data flow: two worked examples

**Running a query.** `QueryPanel` (renderer) calls
`invoke(DB_QUERY, profileId, sql, …)` → preload → `ipc/db.ts` handler → the
profile's `DbAdapter.query()` → `QueryResult` returned back up the same path →
`tabs.ts` stores it on the active `QueryTab` → AG Grid renders it, and the bottom
dock offers chart / plan tabs.

**An AI chat turn.** `ChatInput` → `useAIStore.sendMessage()` →
`invoke(AI_CHAT_START, { message, connectionId, appActionsCatalog, … })` → the AI
plugin's `ConversationManager.chat()` assembles the system prompt, trims context
to budget, and streams from the provider. Text arrives as `ai:chat:event`
broadcasts; tool calls run through the shared `ToolRegistry` (with approval for
`write` tools); `perform_app_action` tool calls round-trip to the renderer to
drive the UI. The renderer accumulates the turn into the active conversation and
persists it. Full detail in [ai.md](/develop/ai/).

## Build, packaging, and testing

- **Build:** `electron-vite` with three targets (main / preload / renderer) in
  `electron.vite.config.ts`. Native modules (`better-sqlite3`, `pg`, `mysql2`)
  are externalised from the bundle. Path aliases: `@shared` → `shared/`,
  `@` → `src/renderer/src/`.
- **Packaging:** the `build` field in `package.json` (macOS `.dmg`, Windows MSIX, Linux
  AppImage).
- **Testing:** Vitest with two projects (`vitest.config.ts`) — `unit` (jsdom,
  `tests/unit/`) and `storybook` (Playwright browser, validates stories +
  accessibility). `better-sqlite3` is rebuilt for Electron's ABI on install, so
  the SQLite adapter unit tests need `pnpm rebuild better-sqlite3` to run under
  system Node (see the README).
- **Versioning:** Changesets — every user-visible change adds one.

## Directory map

```
shared/              Cross-process TypeScript contracts (ipc, types, ai-types, settings)
src/
├── main/            Orchestrator (Node)
│   ├── index.ts         Window + bootstrap
│   ├── ipc-handlers.ts  Handler registration
│   ├── ipc/             Handlers by domain (db, connections, export-import, …)
│   ├── config/          Settings + connection store
│   ├── db/              DbAdapter interface + factory shim (drivers are plugins)
│   ├── mcp/             MCP server
│   ├── keyring.ts       OS secret storage
│   └── plugins/         Plugin host + SDK + bundled plugins
├── preload/         Typed window.electronAPI bridge
└── renderer/src/    React SPA
    ├── stores/          Zustand state
    ├── primitives/      CVA design system + theming
    ├── components/       Feature UI (query, explorer, ai, charts, results, …)
    └── lib/              monaco-sql, app-actions, helpers
docs/                This documentation
```
