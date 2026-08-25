# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Verql** — a desktop database client built with Electron + React. Supports PostgreSQL, MySQL, SQLite natively, plus MongoDB, Redis, and Snowflake via bundled plugins. Brand assets live in `build/icon.svg` (source of truth) and the in-app `<VerqlMark>` SVG at `src/renderer/src/components/brand/VerqlMark.tsx`. Regenerate platform icons with `pnpm build:icons`.

## Documentation

**Start from the docs, then go to the source.** Before changing a subsystem,
read the relevant doc in [`docs/`](./docs/) to understand the design and the
glue↔plugin boundary, then follow its file references into the code. The docs
are the source of truth for intent; the code is the source of truth for detail.
Read order: `docs/architecture.md` (the whole picture) → the topic doc for the
area you're touching → the source it points to.

- [`docs/architecture.md`](./docs/architecture.md) — end-to-end architecture: process model, the `shared/` boundary, main subsystems, renderer stores + design system, the plugin model, and data-flow walkthroughs. **Start here.**
- [`docs/diagrams.md`](./docs/diagrams.md) — a diagram-first visual tour of every subsystem (overall → process/IPC → main → database → plugins → security → renderer → AI → MCP → build). 30 Mermaid diagrams across flowchart, sequence, class, ER, state, and mindmap types. The companion to `architecture.md`.
- [`docs/plugins.md`](./docs/plugins.md) — every contribution surface (driver, exporter, importer, formatter, type mapper, theme, panel, command, AI provider, …) and how to write a plugin.
- [`docs/plugin-security.md`](./docs/plugin-security.md) — the plugin trust boundary: bundled (trusted) vs third-party (untrusted), the enforced/advisory capability model (`keyring`/`connections`/`ipc` gating + manifest `permissions`), **process isolation** (untrusted command/theme plugins run in a `utilityProcess` via the RPC bridge in `src/main/plugins/isolation/`; capability calls are dispatched through the gated context so enforcement stays in one place), install hardening, and known limitations. Read before touching anything that grants a plugin access to secrets, connections, or IPC.
- [`docs/sdk/`](./docs/sdk/README.md) — the published `@verql/plugin-sdk` package (source under `packages/plugin-sdk/`) that external plugin authors consume, plus a getting-started walkthrough. The package re-exports the **electron-free** author surface of `src/main/plugins/sdk`; keep its curated barrel and the `sdk-public-surface` test in sync when changing public exports.
- [`docs/guide/`](./docs/guide/README.md) — end-user (consumer) documentation.
- [`site/`](./site/README.md) — the public documentation site ([verql.arshadshah.com](https://verql.arshadshah.com), Astro + Starlight, deployed on Cloudflare Pages). It curates `docs/` + `docs/guide/` into a branded user guide + developer/plugin docs; the in-app **Help** menu (`src/main/index.ts`) and the published `@verql/plugin-sdk` link here. When you change a subsystem doc, update its `site/src/content/docs/` counterpart in the same change.
- [`docs/ipc.md`](./docs/ipc.md) — adding/renaming a typed IPC channel.
- [`docs/settings.md`](./docs/settings.md) — the settings subsystem: the UI → store → IPC → `ConfigStore` pipeline, the centralized category ids, every category and where each setting is consumed, and the query-history / tab-restore / keybinding-rebind / secrets handling. Read before adding or changing a setting.
- [`docs/notifications.md`](./docs/notifications.md) — the notifications subsystem: the host **attention seam** (a delivery-agnostic relay approval flows publish to) and the bundled `os-notifications` plugin that turns it into native OS notifications. Diagram-rich (context, architecture, sequences, state, class/data models). Read before touching approval surfacing or adding a notification consumer.
- [`docs/activity.md`](./docs/activity.md) — the activity & logging subsystem: the unified in-memory activity stream (queries, tool calls, connections, notifications, network, and `log` diagnostics) for both users and devs, the `logger` service, the IPC **batching** + renderer **pause** that keep a busy stream smooth, and the filter/search/export **Activity panel**. Read before adding a recorder, a log call-site, or touching the activity UI.
- [`docs/ai.md`](./docs/ai.md) — the AI assistant: providers, the shared tool registry, App-Actions, the orchestration loop, and conversation history.
- [`docs/i18n.md`](./docs/i18n.md) — internationalization: the homegrown, dependency-free, cross-process message catalogue (`shared/i18n`), the typed `t()` / `MessageKey`, the renderer `<I18nProvider>`/`useTranslation`, key-naming convention, interpolation/plural syntax, and how locales + plugin catalogues register. Diagram-rich. Read before adding or changing user-facing strings.
- [`docs/onboarding.md`](./docs/onboarding.md) — first-run onboarding & release notes: the VS Code-style **Welcome** "Get Started" tab and the per-version, hand-authored **What's New** release-notes tab, the `settings.onboarding` state + pure startup decision (`lib/onboarding.ts`), the curated release registry (`lib/release-notes/`), and the **agent instructions for authoring a release-notes page**. Read before touching the welcome flow or adding a release page.
- [`docs/tab-persistence.md`](./docs/tab-persistence.md) — restore-on-startup for open query tabs: the incremental, per-tab engine (pure `select` + `diff` core, a debounced/coalesced/serialized write loop, IPC `transport`, one-time localStorage `migrate`) backed by the SQLite app-data `open_tabs` table. Diagram-rich. Read before touching tab restore or the `open_tabs` schema.
- [`docs/testing.md`](./docs/testing.md) — the testing model: the two Vitest projects (`unit` jsdom vs `storybook` Chromium) and when to use each, **merged istanbul coverage** across both, the threshold **ratchet**, and how to write behavioral unit tests vs Storybook play tests (portals, animations, IPC stubs). Read before adding tests or touching `vitest.config.ts`.

When you change a subsystem, update its doc (and this file) in the same change
so the docs never drift from the code.

### Ownership boundary (important)

The main app provides the **UI and the glue** (the registries, IPC, and the ways
logic is invoked). **Plugins own their domain logic.** Database, theme (beyond
the brand baseline), AI, SQL formatting, and import/export logic live in plugins
under `src/main/plugins/bundled/`, never in the orchestrator. When adding a
capability, add a contribution surface + registry (glue) and put the actual
logic in a plugin — don't hardcode dialect/format/provider behavior in the main
app or the renderer.

**DB-agnostic language.** The glue + renderer must describe the database
generically — a driver may not be SQL (Mongo, Redis, future plugins). Don't put
"SQL", "EXPLAIN ANALYZE", "CREATE TABLE", or relational nouns
(table/column/row) in user-facing strings; lean on driver capabilities
(`editorLanguage`, `explain.statement`, and the `nouns` capability —
object/field/record — resolved in the renderer by `useDataNouns`, with generic
fallbacks).

**Reduce code: centralize, don't duplicate.** Before adding a helper/hook, look
for an existing one; when the same logic appears 2+ times, unify it into a
single shared implementation (pure helpers in `lib/`, reusable behaviour as one
flexible hook in `hooks/` — e.g. `useClipboard`, not several copy variants).
See [`CONTRIBUTING.md`](./CONTRIBUTING.md).

## Commands

```bash
pnpm dev              # Run app in development mode (electron-vite dev)
pnpm build            # Build for production (electron-vite build)
pnpm test             # Run all tests (vitest run)
pnpm test -- --run tests/unit/foo.test.ts  # Run a single test file
pnpm storybook        # Start Storybook on port 6006
pnpm postinstall      # Rebuild native modules (better-sqlite3)
```

### Local test databases

Spin up seeded databases to validate connections against every native + bundled
driver. `scripts/test-dbs.sh {up|down|reset|seed|sqlite|status}` runs the
Postgres/MySQL/Mongo/Redis containers from `docker-compose.yml` (seeded from
`docker/seed/`) and builds a seeded `docker/testdb.sqlite` via
`scripts/make-sqlite-testdb.sh`. Connection details (hosts, ports, credentials)
live in [`docker/README.md`](./docker/README.md).

## Architecture

### Electron Process Model

Three-layer split: **main** (Node.js), **preload** (IPC bridge), **renderer** (React SPA).

- `src/main/` — Electron main process: window creation, menus, IPC handlers, database adapters, plugin system, import/export
  - **The menu is declared once, in [`shared/menus.ts`](./shared/menus.ts), and rendered by two surfaces.** macOS shows the native app menu (`src/main/app-menu.ts`); Windows/Linux hide the OS frame and render the app-designed bar (`components/shell/MenuBar.tsx` + `menu-model.tsx`). The native menu also supplies the accelerator table on *every* platform. Items with a `nativeRole` become Electron roles; every other item ships its `MenuActionId` over the single `menu:action` event, and the renderer runs it through the `menuActions` registry in `menu-model.tsx` — the one implementation a click, an accelerator, or the app bar all reach. **Add a menu item by declaring it in `shared/menus.ts` and giving it a handler in `menu-model.tsx`; never edit one surface alone** (the two used to be declared separately and macOS silently lost the Query menu, Settings, Find and the panel toggles). Placement follows each platform's conventions, not one OS mirrored onto another: Settings sits in the macOS app menu at Cmd+, and under File elsewhere. Accelerators resolve from the user's live keybindings (`settings:set` rebuilds the native menu), so a rebind moves the real accelerator instead of leaving a stale one that swallows the key. Window min/max/close use the `IconButton` primitive (`WindowControls.tsx`); About routes to the in-app `AboutModal.tsx` (fed by `app:about-info`) on every platform, including macOS — there is no native About panel.
- `src/preload/` — Sandboxed bridge exposing `window.electronAPI` with typed `invoke()` and `on()` methods
- `src/renderer/src/` — React 19 frontend: components, stores, primitives design system
- `shared/` — TypeScript types and IPC channel definitions shared across processes

### IPC Communication

All renderer-to-main communication goes through typed IPC channels defined in `shared/ipc.ts` (`IpcChannelMap`). Handlers are registered in `src/main/ipc-handlers.ts`. Channel naming convention: `domain:action` (e.g., `db:query`, `connections:save`, `plugins:list`).

**Renderer backend access has one chokepoint.** The renderer never touches `window.electronAPI` directly — it goes through the **platform client** (`src/renderer/src/platform/client.ts`), imported as `import { ipc } from '@/platform/client'` (`ipc.invoke` / `ipc.on` / `ipc.optional` / `ipc.available()` / `ipc.platform()`). That single seam is where cross-cutting concerns (error normalization, activity logging, retry, cancellation, instrumentation) are added once instead of per call site, and `useIpcQuery` is built on top of it. The invariant is enforced by `tests/unit/audit/renderer-backend-access-through-platform.test.ts` (#165), which fails the build if the bridge is referenced anywhere outside `src/renderer/src/platform/` (Storybook stories, which stub the bridge as their test seam, are the sanctioned exception). See `docs/ipc.md`.

### State Management

Zustand stores in `src/renderer/src/stores/`:
- `connections.ts` — Connection profiles, connect/disconnect lifecycle, active connection
- `tabs.ts` — Open tabs (discriminated union: `QueryTab | TableTab | ErDiagramTab | ConnectionFormTab | PluginDetailTab | InstallPluginTab | SettingsTab`)
- `schema.ts` — Schema metadata cache (tables, columns, indexes) keyed by connection+schema
- `ui.ts` — Sidebar/secondary-sidebar/bottom-dock state, active panel, layout dimensions (persisted to localStorage)
- `ai.ts` — AI chat: messages, providers/models, and conversation history persisted to the internal SQLite app-data store via IPC (see `docs/ai.md`)
- `selection.ts` / `notifications.ts` / `toast.ts` — inspector selection, notification center, transient toasts
- `editor.ts` / `tab-actions.ts` — non-reactive registries of mounted Monaco editors and per-tab save/transaction handlers (refs, not reactive state)
- `query-history.ts` — recorded query runs (mirror of the SQLite app-data `query_history` table), capped to `general.maxHistoryItems`; surfaced via the Saved/History toggle in the query sidebar panel
- `lib/tab-persistence/` — the **tab-persistence engine**: an incremental, per-tab restore-on-startup system backed by the SQLite app-data store (`open_tabs` table, over IPC). A pure `diff` + `select` core, a debounced/coalesced `engine` that persists only the tabs that changed (one row per single-tab edit, regardless of how many tabs are open), an IPC `transport`, and a one-time `migrate` from the legacy localStorage snapshot. Restored on startup when `general.restoreTabsOnStartup` is on; persistence runs regardless

### Database Adapters

`DbAdapter` interface in `src/main/db/adapter.ts`. Every driver — including the native sqlite/postgresql/mysql ones — is a **bundled plugin** that implements `DbAdapter` and registers a factory with the SDK `DriverRegistry`. `createAdapter` in `src/main/db/factory.ts` resolves a profile's adapter purely through that registry; there are no special-cased built-ins in `src/main/db/`. This invariant is enforced — the rationale lives beside the code in `factory.ts` and is guarded by `tests/unit/audit/db-factory-registry-purity.test.ts` (registry-only resolution + no driver names or bundled-driver imports under `src/main/db/`).

**Capability declaration ⇔ implementation agreement.** A driver *declares* its features as serializable data on its factory (`session`, `explain` in `shared/driver-capabilities.ts`) that the renderer gates on, and *implements* the matching optional `DbAdapter` methods that the glue calls. The two must never disagree — a declared-but-unimplemented feature crashes on use, an implemented-but-undeclared one never surfaces. The adapter factory (`src/main/db/factory.ts`) validates the link in both directions when it builds an adapter — the single chokepoint every real adapter (bundled, third-party, isolated) passes through — throwing an actionable error that names the capability, the offending method, and the fix, so a mismatch fails the connect instead of crashing later (registration stays pure and constructs nothing). Mapping in `src/main/plugins/sdk/driver-validation.ts`; guarded by `tests/unit/audit/driver-capability-agreement.test.ts`. Today's linked pairs: `session.manualTransactions` ⇔ the transaction-lifecycle methods, `explain.format === 'tree'` ⇔ `parseQueryPlan`, and `databaseSwitch.supported` ⇔ `switchDatabase`.

### Plugin System

Plugins live in `src/main/plugins/`. Each plugin has a `manifest.json` declaring contributions (drivers, themes, commands, panels, exporters, importers, connection middleware, connection fields).

**Lifecycle**: discover → validate → resolve → activate → runtime. Managed by `BootCoordinator` in `plugin-host.ts`.

**Plugin SDK** (`src/main/plugins/sdk/`): provides registries (DriverRegistry, ToolRegistry, CommandRegistry, PanelRegistry, ExporterRegistry, …) and access objects (SchemaAccess, ConnectionAccess, PluginSettings) via `PluginContext`. The `ToolRegistry` is shared by the AI assistant and the MCP server — register a tool once and both surfaces see it (gated by the tool's `surfaces` field).

**Bundled plugins** in `src/main/plugins/bundled/`: the native drivers (`sqlite`, `postgresql`, `mysql` — each implements `DbAdapter` and registers via the SDK), `db-tools` (the canonical query/schema tools), `ai` (the assistant — see `docs/ai.md`), `core-formats` (CSV/JSON/SQL exporters + importers), `core-themes`, `ssh-tunnel` (connection middleware), `os-notifications` (surfaces approval/attention requests as native OS notifications via the host **attention seam** — `src/main/attention/` — and exposes an `os-notifications` service for other plugins), `mongodb`, `redis`, `snowflake`.

### AI Assistant & Tooling

The assistant is a bundled plugin (`src/main/plugins/bundled/ai/`). It registers AI providers (OpenAI/Anthropic/Ollama) and the `perform_app_action` tool, drives a streaming tool-call loop in `ConversationManager`, and trims each request to a token budget. The renderer (`stores/ai.ts`, `components/ai/`, `lib/app-actions/`) owns the chat UI, the App-Action registry (deep-link chips + agentic UI actions), and persisted/branchable conversation history. Tool calling is unified with the built-in MCP server through the shared `ToolRegistry`. Full detail in [`docs/ai.md`](./docs/ai.md).

### MCP Server

`src/main/mcp/` exposes the shared tool registry to external MCP clients (e.g. Claude Code) over a tokenised endpoint, with the same per-tool permission gating used by the AI chat.

### Design System

Primitives in `src/renderer/src/primitives/` organized by category: `forms/`, `layout/`, `surfaces/`, `data-display/`, `feedback/`, `navigation/`, `typography/`. All use CVA (class-variance-authority) for variant-based styling. Variant names follow the semantic tokens (Button's destructive variant is `error`, not `danger`; Banner has a `success` variant); most primitives expose a `size` variant. `Switch` is a hidden checkbox + visual track driven by `--color-switch-*` tokens; `surfaces/GradientSurface` paints a theme-derived gradient (`tone` × `intensity`).

Three-layer theming in `primitives/theme/tokens.css`: raw color scale → semantic tokens (remapped per theme) → component tokens. Themes: dark, light, midnight. Applied via `data-theme` attribute, managed by `ThemeProvider`.

**Type scale.** Font sizes come from the named ramp — `text-3xs`/`text-2xs` (10px/11px, fixed dense-chrome steps with their own line-heights) → `text-xs` … `text-3xl`, defined in `primitives/theme/tokens.css` + wired as Tailwind utilities in `styles/globals.css`, and exposed as `size` variants on `Text`/`Label`/`Code`/`Tag` (and `Badge`). Never hand-roll a font size with an arbitrary utility (`text-[10px]`): the `renderer-no-arbitrary-font-size` guard (`tests/unit/audit/`) fails any `text-[Npx]` in `src/renderer/src/components` and names the step to use instead.

**Design-system fitness guards** live in `tests/unit/audit/` and fail CI when a documented rule is violated. Each rule maps to exactly one enforcing test, and a failure names the offending file, line and the sanctioned primitive/token to use instead:
- **No raw Tailwind palette colours** (`text-white`, `bg-gray-*`, …) — express colour through the theme token layer (`renderer-no-raw-palette`).
- **No arbitrary font sizes** (`text-[Npx]`) — use the named type ramp (`renderer-no-arbitrary-font-size`).
- **No raw HTML elements in the component layer** (`<button>`, `<input>`, `<select>`, `<textarea>`, `<table>`, `<h1>`–`<h6>` under `src/renderer/src/components`) — a design-system primitive exists for each (`renderer-no-raw-html-primitives`). The `primitives/` layer is out of scope: a primitive is where a native element legitimately lives.
- **No arbitrary pixel widths** (`w-[Npx]`, `max-w-[Npx]`, `min-w-[Npx]` under `src/renderer/src/components`) — recurring surface widths are named `--container-*` steps (`--container-prompt`/`palette`/`hero` in `styles/globals.css`) exposed as the `width` variant on `Modal`; content constraints use the shared Tailwind width scale (`max-w-40`, …). Genuinely dynamic or density-independent pixel widths use an inline `style={{ width }}`, the sanctioned exception (`renderer-no-arbitrary-width`).
- **Every public primitive ships a Storybook story** — a primitive re-exported through a category barrel (`primitives/<category>/index.ts`, reachable from `primitives/index.ts` via `export *`) must have a sibling `*.stories.tsx` (`primitives-have-stories`). Stories are how a primitive is documented, visually reviewed, and a11y-tested in the browser project. Menu internals (`surfaces/menu/`) and root-level providers/helpers (`ThemeProvider`, `cn`) are off the public surface by construction, not by allowlist; the sanctioned escape hatch is the test's documented `EXCEPTIONS` map.

### Key Libraries

- **Monaco Editor** — query editor with custom completion provider (`lib/monaco-sql.ts`); the language is driver-declared via the `editorLanguage` capability (SQL by default), not assumed
- **AG Grid** — Query results display with custom dark theme
- **@xyflow/react** — ER diagram visualization
- **Recharts** — Chart panel for data visualization

## Build Configuration

- `electron.vite.config.ts` — Main/preload/renderer build config. Native modules (better-sqlite3, pg, mysql2) are externalized from bundle.
- Path aliases: `@shared` → `shared/`, `@` → `src/renderer/src/`
- `package.json` `build` field — electron-builder packaging config (the active one; there is no separate `electron-builder.yml`). macOS DMG, Windows MSIX/appx → Microsoft Store, Linux AppImage. Includes the `appx` Store identity block.

## Testing

**See [`docs/testing.md`](./docs/testing.md)** for the full model: the two
projects, merged coverage, and how to write behavioral unit tests vs Storybook
play tests. In brief:

Vitest with two test projects configured in `vitest.config.ts`:
1. **Unit tests** — jsdom environment, files in `tests/unit/`
2. **Storybook tests** — Browser (Playwright) environment, validates stories + accessibility

Stories located in `src/renderer/src/{primitives,components}/**/*.stories.tsx`.

**Coverage is merged across both projects** (`pnpm test:coverage`, istanbul
provider) so browser-rendered components count — `unit` alone understates
reality. `coverage.thresholds` is a **ratchet**: raise the floor in the same PR
that raises coverage, and never pad the percentage with render-without-assert
tests. Run one file with `pnpm exec vitest run <file>` (not `pnpm test -- --run`,
which runs the whole suite).

### Architecture invariant suite

The documented architectural rules are not left to reviewer habit — each is an
executable **fitness function** in `tests/unit/audit/`, one file per rule, that
fails CI when the rule is violated and whose failure message names the rule, the
offending location, and the sanctioned alternative (a red build teaches, it
doesn't just block). The design-system guards above are part of this suite; the
core architecture invariants and their enforcing tests:

| Rule | Enforcing test |
| --- | --- |
| Renderer backend access only through the platform layer (#165) | `renderer-backend-access-through-platform.test.ts` |
| No `string`-keyed IPC event registration; every `IPC_EVENTS` entry has a shape and vice versa (#166) | `ipc-event-seam-typed.test.ts` |
| The sandboxed preload (and everything it imports) uses no Node builtin — one throws at load and takes the whole IPC bridge with it | `preload-sandbox-safe.test.ts` |
| IPC channels + shared constants are single-sourced | `ipc-channels-single-sourced.test.ts`, `constants-single-sourced.test.ts` |
| No driver-type special-casing in `src/main/db/` (registry-purity) | `db-factory-registry-purity.test.ts` |
| A driver's declared capabilities ⇔ its implemented adapter methods (#168) | `driver-capability-agreement.test.ts` |
| Capability availability comes from declared `DriverCapabilities`, not adapter method probing (#171) | `capability-detection-by-declaration.test.ts` |
| HTTP request bodies are decoded once (`Buffer.concat`), never per chunk (#171) | `request-body-decoded-once.test.ts` |
| Main orchestrator stays pure (domain logic lives in plugins) | `main-orchestrator-purity.test.ts` |
| Redis plugin never interpolates a value into a `query()` command string (#211) | `redis-no-value-interpolation.test.ts` |
| The menu has one implementation across all surfaces | `menu-single-implementation.test.ts` |
| One SQL statement splitter across main + renderer (#199) | `statement-splitter-single-implementation.test.ts` |
| Published `@verql/plugin-sdk` surface stays curated | `sdk-public-surface.test.ts` |
| No raw control bytes in tracked source (a NUL/control byte makes a file binary and invisible to grep) (#208) | `no-control-bytes-in-source.test.ts` |
| The shipped version always has a curated "What's New" page (registry newest-first, never behind `package.json`) | `release-notes-cover-shipped-version.test.ts` |

When you add or change an architectural invariant, add (or update) its guard in
`tests/unit/audit/` and its row here in the same change — demonstrate the guard
red against a deliberately-introduced violation before relying on it.

When working on UI components, always use the `your-project-sb-mcp` MCP tools to access Storybook's component and documentation knowledge before answering or taking any action.

- **CRITICAL: Never hallucinate component properties!** Before using ANY property on a component from a design system (including common-sounding ones like `shadow`, etc.), you MUST use the MCP tools to check if the property is actually documented for that component.
- Query `list-all-documentation` to get a list of all components
- Query `get-documentation` for that component to see all available properties and examples
- Only use properties that are explicitly documented or shown in example stories
- If a property isn't documented, do not assume properties based on naming conventions or common patterns from other libraries. Check back with the user in these cases.
- Use the `get-storybook-story-instructions` tool to fetch the latest instructions for creating or updating stories. This will ensure you follow current conventions and recommendations.
- Check your work by running `run-story-tests`.

Remember: A story name might not reflect the property name correctly, so always verify properties through documentation or example stories before using them.
