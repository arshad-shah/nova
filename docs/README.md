# Verql docs

Three audiences, three sections.

## For users

End-user documentation for the Verql app — installing, connecting, querying,
and managing plugins. Start at **[guide/README.md](./guide/README.md)**. The
in-app **Help → User Guide** menu links here.

## For plugin developers

| Doc | What's inside |
|-----|---------------|
| [sdk/README.md](./sdk/README.md) | The `@verql/plugin-sdk` package: what it exports, install, versioning/publishing. **Start here to build a plugin.** |
| [sdk/getting-started.md](./sdk/getting-started.md) | A minimal end-to-end plugin walkthrough. |
| [plugins.md](./plugins.md) | The canonical catalogue: every contribution surface (driver, exporter, importer, formatter, type mapper, theme, panel, command, AI provider, settings, …) and how to write one. |
| [plugin-security.md](./plugin-security.md) | The plugin trust boundary: the capability/permission model, install hardening, what Verql does and does not enforce, and the roadmap. Read before using `keyring`, `connections`, or `ipc`. |

## For contributors (internals)

| Doc | What's inside |
|-----|---------------|
| [architecture.md](./architecture.md) | The whole picture: process model, the `shared/` boundary, main-process subsystems, renderer stores + design system, the plugin model, and two end-to-end data-flow walkthroughs. **Start here.** |
| [diagrams.md](./diagrams.md) | A diagram-first visual tour of every subsystem (30 Mermaid diagrams across flowchart, sequence, class, ER, state, mindmap). The companion to `architecture.md`. |
| [ipc.md](./ipc.md) | How the renderer talks to the main process. Read this when you need to add or rename an IPC channel. |
| [settings.md](./settings.md) | The settings subsystem: the UI → store → IPC → `ConfigStore` pipeline, every category, where each setting is consumed, and the query-history / tab-restore / keybinding-rebind features. |
| [i18n.md](./i18n.md) | Internationalization: the dependency-free, cross-process message catalogue (`shared/i18n`), the typed `t()` / `MessageKey`, the renderer `<I18nProvider>`/`useTranslation`, key naming, interpolation/plurals, and how locales + plugin catalogues register. |
| [ai.md](./ai.md) | The AI assistant subsystem: providers, the shared tool registry (AI + MCP), the App-Action registry (deep-link chips + agentic UI), the orchestration loop with token budgeting, and persisted/branchable conversation history. |
| [notifications.md](./notifications.md) | The notifications subsystem: the host **attention seam** (a delivery-agnostic relay approval flows publish to) and the bundled `os-notifications` plugin. Read before touching approval surfacing. |
| [activity.md](./activity.md) | The activity & logging subsystem: the unified in-memory activity stream (queries, tool calls, connections, notifications, network, `log` diagnostics) for users and devs, the `logger` service, IPC **batching** + renderer **pause** for performance, and the filter/search/export **Activity panel**. |
| [tab-persistence.md](./tab-persistence.md) | Restore-on-startup for open query tabs: the incremental, per-tab engine (pure `select` + `diff`, a debounced/coalesced write loop, IPC transport, one-time localStorage migration) backed by the SQLite app-data `open_tabs` table. Diagram-rich. |
| [onboarding.md](./onboarding.md) | First-run onboarding & release notes: the Welcome "Get Started" tab and the per-version What's New release-notes tab, the `settings.onboarding` state + pure startup decision, the curated release registry, and how to author a release-notes page. |
| [plugin-audit.md](./plugin-audit.md) | A status audit of every plugin extension point — which are fully wired, partly wired, or still aspirational — plus a quick guide to writing a plugin. |

**Design records** live in [proposals/](./proposals/): the internal app-data
store, the DB-boundary renderer→plugin migration (plan parsing, error
classification, statement splitting), and signed-plugins/registry. They capture
intent + status for larger changes.

The architecture is **orchestrator + plugins**: `src/main/` is the
orchestrator (window management, IPC plumbing, plugin host) and almost
everything else lives in a plugin under `src/main/plugins/bundled/`.
Adding a new database type or file format means writing a plugin — see
[plugins.md](./plugins.md).
