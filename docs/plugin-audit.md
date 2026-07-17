# Plugin system — what's wired, what's not

A quick audit of what plugins can extend in Verql today, where the seams
are sharp, and where they're still aspirational.

> Plugins are normal Node modules loaded at app start. Bundled plugins always
> run in the **main** process; a third-party plugin whose manifest sticks to
> a serializable-safe contribution set runs isolated in a separate
> `utilityProcess` instead (see [`docs/plugin-security.md`](./plugin-security.md)).
> Either way they get a typed `PluginContext` and contribute via registries.
> Their UI surfaces are declared in the manifest and rendered by the renderer
> process via shared resolver hooks.

## Status legend

- ✅ **Fully wired** — declarative manifest + runtime API + UI consumes it
- 🟡 **Partly wired** — manifest entry exists, runtime stub exists, but
  the UI or storage layer doesn't honour it yet
- ⛔ **Not wired** — only a placeholder in `manifest.json`, no real impl

---

## Extension points

### Database adapters ✅
The original use case. A plugin can register a new driver:

```ts
ctx.drivers.register('clickhouse', {
  async connect(profile) { /* return DbAdapter */ }
})
```

…and the connection picker, schema browser, and query runner pick it
up automatically. **All six bundled DB plugins use this**:
`postgresql`, `mysql`, `sqlite`, `mongodb`, `redis`, `snowflake`.

### Connection middleware ✅
Wraps any driver's connect call. Used by the `ssh-tunnel` plugin to open
a tunnel before delegating to the underlying driver.

```ts
ctx.drivers.registerConnectionMiddleware('ssh', {
  async wrap(profile, next) {
    const tunnel = await openTunnel(profile)
    return next({ ...profile, host: '127.0.0.1', port: tunnel.localPort })
  }
})
```

### Connection fields ✅
Add custom inputs to the connection form (e.g. an "Account Identifier"
field for Snowflake, or a "Private Key" file field for the tunnel).
Declared under `contributes.connectionFields` in the manifest.

### Exporters & importers ✅
Plugins register file-format readers/writers used by the toolbar
"Export…" and "Import…" actions. `core-formats` ships a CSV exporter
+ importer and a JSON exporter (no JSON importer yet); it also registers
a generic SQL code **formatter** for the editor, which is a different
contribution surface (`ctx.formatters`, not `ctx.exporters`/`ctx.importers`)
and isn't an export/import format. Adding Parquet, Excel, or JSON-Lines
would be a new plugin (or an addition to `core-formats`).

### Type mappers ✅
Declare how column types convert between dialects, e.g. PostgreSQL
`serial` → MySQL `INT AUTO_INCREMENT`. Today the three relational
bundled drivers (`postgresql`, `mysql`, `sqlite`) register mappings
pairwise with each other; `mongodb`, `redis`, and `snowflake` don't
register any. The registry backs the schema-migration DDL generator
(`migration:type-map` / `migration:generate-ddl` IPC channels, see
[src/main/migration/type-map.ts](../src/main/migration/type-map.ts)),
not general schema-read or query-write paths.

### Completion providers ✅
SQL editor completions (column names, function signatures, dialect
keywords). Each DB plugin contributes its own.

### Commands ✅
Register handlers for command-palette entries and keybindings.
`ctx.commands.register('do-thing', handler)` — namespaced under the
plugin name to avoid collisions.

### Panels ✅
Long-form custom UI in the sidebar, secondary sidebar, or bottom dock.
Declared in the manifest, rendered as a React tree the plugin
provides via the UI registry.

### Activity bar / status bar / toolbar / tabs / context menus ✅
Smaller UI surfaces with their own contribution slots. Plugins
declare items in the manifest and resolve their dynamic state
through `ui.registerSlot` / `ui.registerResolver`.

### AI providers, tools, context providers ✅
A plugin can:
- Register a new LLM **provider** (e.g. AWS Bedrock, local Ollama)
- Register a **tool** the assistant can call (`runQuery`, `lookupDoc`)
- Register a **context provider** that injects relevant info into the
  prompt (e.g. "current schema", "recent errors")

`bundled/ai` is the reference implementation.

### Settings contributions ✅
Plugins declare their own settings entries in the manifest. They
appear in the plugin's own panel **and** optionally in a core
Settings category (Editor, Appearance, AI, …).

### Services ✅
A generic dependency-injection lane: any plugin can `provide` a typed
service, any other can `consume` or `onAvailable`. Used by the AI host
to wire providers ↔ tools without hard dependencies.

### IPC + broadcast ✅
A plugin can own typed IPC channels (`ipc.handle('foo:bar', …)`) and
broadcast events to all renderer windows. Channel types live in
`@shared/ipc` so the renderer gets type safety.

### Themes ✅
`contributes.themes` carries real tokens (`ThemeContribution` in
[src/main/plugins/types.ts](../src/main/plugins/types.ts)), and the SDK
has a full `ThemeRegistry`
([src/main/plugins/sdk/theme-registry.ts](../src/main/plugins/sdk/theme-registry.ts)):
plugins call `ctx.themes.register({ id, name, type, tokens, css, monaco,
preview })` at activation. The registry validates required/recommended
CSS-variable tokens and flags a theme that's missing required ones as
unselectable rather than crashing the UI. An IPC channel (`themes:list`)
and broadcast (`themes:changed`) let the renderer fetch the merged
built-in + plugin theme list
([stores/themes.ts](../src/renderer/src/stores/themes.ts)); `ThemeProvider`
resolves the active theme and injects each plugin theme's tokens into a
`<style>` tag scoped to `[data-theme="<id>"]`. The bundled
`core-themes` plugin ships ten themes (Nightshift, Lab, Ink & Paper,
Dark, Light, Midnight, Dracula, Nord, Solarized, Catppuccin) through
this exact registry — it eats its own dogfood. Only the brand baseline theme
("Ion") stays outside the registry, since a default that only paints
once a plugin activates isn't a default.

### Editor themes (Monaco) ✅
[lib/monaco-themes.ts](../src/renderer/src/lib/monaco-themes.ts) reads
the same theme registry: any theme that ships a `monaco` token table is
registered onto the Monaco instance via `monaco.editor.defineTheme`, and
theme ids are 1:1 between the app theme and the Monaco theme name. A
plugin theme with no `monaco` def falls back to the Ion baseline.

### Drag-and-drop providers ✅
`contributes.dragDrop` + a `DragDropRegistry` in the SDK
([src/main/plugins/sdk/drag-drop-registry.ts](../src/main/plugins/sdk/drag-drop-registry.ts))
let a plugin claim file extensions via `ctx.dragDrop.register({ id,
extensions, onDrop })`. The renderer forwards every file dropped
anywhere on the window
([hooks/useFileDropForwarding.ts](../src/renderer/src/hooks/useFileDropForwarding.ts))
over the `plugins:drag-drop` IPC channel, and the host resolves the
provider by extension and calls its `onDrop`. The mechanism is wired
end to end, but no bundled driver currently registers itself — dropping
a `.sqlite` file today matches no provider because the `sqlite` plugin
doesn't claim the `sqlite` extension.

### Notification provider ✅
`ctx.notifications.show({ kind, title, message })` is a typed API on
`PluginContext`. It broadcasts `notifications:show`, which
[stores/toast.ts](../src/renderer/src/stores/toast.ts) subscribes to and
turns into a toast — no plugin has to know the toast store exists.

---

## What's partly wired

### Per-plugin keybindings 🟡
Commands' optional `keybinding` field is fully consumed at runtime: a
global key listener
([hooks/useAppKeyboardShortcuts.ts](../src/renderer/src/hooks/useAppKeyboardShortcuts.ts))
matches it and dispatches the plugin command, and the Keybindings
settings page lists plugin bindings grouped by plugin alongside the
user's own. What's still missing: those entries are read-only there —
a plugin's binding can't be rebound by the user yet, only the built-in
bindings can.

---

## What's not wired

### Result-grid cell renderers ⛔
`contributes.cellRenderers` exists as a manifest field
([src/main/plugins/types.ts](../src/main/plugins/types.ts)) but nothing
reads it — the grid still does its own type detection. Custom cell
renderers (image preview, geo-shape, sparkline) would need a real
registry and a renderer-side consumer.

### Custom welcome / empty-state widgets ⛔
`contributes.welcomeWidgets` is likewise a manifest-only placeholder;
the empty-state hero is still a fixed component. A plugin like "AWS RDS
discovery" can't drop a tile there yet.

### Background tasks / agents ⛔
A plugin can register commands, but there's no lifecycle for
long-lived background workers (e.g. a "watch this table for changes"
worker that emits events). Today this would have to be home-rolled
inside a plugin via `setInterval` + `broadcast`.

### Localisation (as a plugin contribution) ⛔
This one needs a caveat: the host itself is no longer English-only in
the sense of lacking i18n machinery — `shared/i18n/` is a real,
cross-process, typed message catalogue that the renderer and the native
menu both consume (see [`docs/i18n.md`](./i18n.md)), and it exports a
`registerLocale(locale, partial)` function specifically meant for
plugins to call. But only the `en` catalogue ships today, no bundled
plugin calls `registerLocale`, there's no `contributes.locales` manifest
field, and `PluginContext` has no `ctx.i18n` surface — a plugin wanting
to localize has to reach past the context object into the shared module
directly. `docs/i18n.md`'s own architecture diagram marks plugin
catalogues as "(future)".

---

## Quick guide: how to write a plugin

Bundled plugins (`src/main/plugins/bundled/<name>/`) export the manifest
inline from `index.ts` as a `PluginManifest` const — none of them ship a
separate manifest JSON file:

```ts
// src/main/plugins/bundled/my-plugin/index.ts
import type { PluginManifest } from '../../types'
import type { PluginContext } from '../../sdk/types'

export const manifest: PluginManifest = {
  name: 'my-plugin',
  version: '0.1.0',
  displayName: 'My Plugin',
  description: 'What this does',
  main: 'index.js',
  contributes: {
    drivers: [{ id: 'myproto', name: 'My Protocol' }],
    commands: [{ id: 'do-thing', title: 'Do the thing' }]
  }
}

export async function activate(ctx: PluginContext) {
  ctx.drivers.register('myproto', { /* adapter */ })
  ctx.commands.register('do-thing', async () => { /* … */ })
}

export async function deactivate() {
  // optional cleanup — anything pushed to ctx.subscriptions is
  // auto-disposed for you
}
```

Add the module to the list in
[src/main/plugins/bundled/index.ts](../src/main/plugins/bundled/index.ts),
restart the app, and it lights up in the plugin pane.

Third-party (installed, non-bundled) plugins are discovered differently:
the host looks for a **`plugin-manifest.json`** file on disk (not
`manifest.json`), falling back to a `package.json` that carries
`"keywords": ["verql-plugin"]` — see `parseManifest` in
[src/main/plugins/plugin-host.ts](../src/main/plugins/plugin-host.ts).

---

## Recommended priorities

Themes and drag-and-drop are now real, registry-backed contributions
(see above) — the community-theme and "open a file" stories are
unblocked at the mechanism level. What's left, highest value first:

1. **Drag-and-drop adoption** — have the native drivers actually claim
   their file extensions (e.g. `sqlite` registering for `.sqlite`/`.db`)
   so the wired mechanism does something visible.
2. **Result-grid renderers** (small surface, big visible win).
3. **Per-plugin keybinding rebind** — bindings already run and show up
   in Settings; let the user actually remap them.
4. **Localisation as a first-class contribution** — a `ctx.i18n` surface
   and a `contributes.locales` manifest field so a plugin's
   `registerLocale` call doesn't have to bypass the plugin context.
5. **Background tasks** (the most ambitious; defer until something
   actually needs it).
