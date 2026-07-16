# Plugin system

Ports manifest model, lifecycle, install pipeline, permission model, the
registry concepts, and the `plugins:*` IPC surface — under
[ADR-0002](../decisions/ADR-0002-rust-first-internals.md) (bundled logic =
compiled-in Rust) and [ADR-0003](../decisions/ADR-0003-third-party-plugins.md)
(third-party = **declarative only** at launch). Crate: `verql-plugins`
(+ registry traits in `verql-core`; see
[`../02-target-architecture.md`](../02-target-architecture.md)).

## v1 behavior contract

### Manifest schema (`src/main/plugins/types.ts`)

`PluginManifest`: `name`, `version`, `displayName`, `description`, `main`,
`icon?`, `permissions?: PluginPermission[]`, `contributes` with **18 kinds**:
`drivers`, `themes`, `commands`, `exporters`, `importers`, `formatters`,
`connectionMiddleware`, `connectionFields`, `panels`, `settings`,
`activityBar`, `statusBar`, `toolbar`, `contextMenus`, `tabs`, `selectors`,
`dragDrop`, `welcomeWidgets`, `cellRenderers`. Notable shapes:
`ConnectionFieldContribution` (`key/label/type` required; `type` ∈
text|password|number|boolean|file|file-path|select; plus `accept`, `group`,
`fetchable`, `default`, `step`), `SettingContribution` (`key/title/type`
required; `category?: SettingCategoryTarget` routes it into a core Settings
category), `ThemeContribution` (`id/name/type(dark|light)`, `preview?`).

`validateManifest` (`src/main/plugins/manifest-validation.ts`) enforces
`NAME_PATTERN = /^[a-z0-9-]+$/`, `SEMVER_PATTERN`, required
`displayName`/`description`/`main`, `main` ends in `.js`, every
`permissions` entry passes `isPluginPermission`, plus per-kind required
fields (driver `id`+`name`, panel `id`+`title`+`icon`+`location`, …).
Manifests come from `plugin-manifest.json` or a `package.json` carrying the
`verql-plugin` keyword (`parseManifest`).

### Lifecycle (`src/main/plugins/plugin-host.ts`, `PluginBootCoordinator`)

Phases: **discover → validate → resolve → activate → verify → runtime**.
`PluginStatus.state`: `discovered`, `validated`, `resolved`, `activating`,
`active {contributions}`, `degraded {error, contributions}`, `error {error,
phase}`, `inactive`. Behavior pinned:

- `boot()` runs the phases over `userData/plugins` + registered bundled
  plugins, honoring `disabledPluginsStore.isDisabled` — except
  `ESSENTIAL_BUNDLED = {'verql-plugin-db-tools'}`, never disableable.
  Produces `BootReport {total, active, degraded, failed, plugins[]}`, each
  entry mirrored into the activity stream (`kind:'plugin'`).
- Validate pins `main` to the plugin directory (`path.resolve` +
  `startsWith(pluginRoot + sep)`) before any `require()`; `activatePlugin`
  wraps `activate(ctx)` in `safeCall` with a **10s timeout** — failure
  disposes the context and sets `error{phase:'activate'}`.
- `verifyContributions` compares declared vs actually-registered per surface
  (commands/exporters/importers/formatters checked under the namespaced id
  `${pluginName}:${id}`; panels accept either UIRegistry or legacy
  PanelRegistry; themes additionally run `validateTheme` — missing
  **required** tokens demote the theme to a missing contribution + error
  toast; missing **recommended** tokens only warn). Verdict: nothing
  declared or nothing missing → `active`; nothing registered → `error
  {phase:'verify'}`; partial → **`degraded`** with the missing list.
- `deactivatePlugin({persist})` persists the disabled flag only for
  user-initiated deactivations; `shutdown()` deactivates in reverse
  `activationOrder` with a 5s `safeCall` timeout.
- `safeCallWithBudget` + `ErrorBudget`: repeated runtime errors
  auto-deactivate (`error{phase:'runtime'}`, "Disabled due to repeated
  errors").
- Isolation (`isolation/`): untrusted plugins whose contributions are
  marshalling-safe (`canIsolate` — commands/themes + manifest-only kinds)
  run in a `utilityProcess` behind a JSON-RPC bridge, gated by the
  `plugins.isolation` setting; failed verification tears the worker down.

### Install pipeline guards (all in `plugin-host.ts`; see `docs/plugin-security.md`)

| Guard | Mechanism |
|---|---|
| Zip-slip | `installFromZip` lists entries via `unzip -Z1` and runs pure `assertSafeArchivePaths` (rejects absolute paths, `[a-zA-Z]:` drive prefixes, any `..` segment) **before** `unzip -o` writes anything |
| Temp dir | `fs.mkdtempSync` (owner-only, unpredictable) — no pre-creatable path |
| Name → path | `NAME_PATTERN` checked **before** `path.join(pluginDir, name)` |
| Full validation before copy | `validateManifest` runs before anything lands in the trusted folder |
| Bundled-name collision | `discover()` and `installFromPath` both refuse a plugin whose `name` matches an existing `path === '<bundled>'` entry (credential-interception shadowing) |
| Symlinks | `findSymlink` (lstat walk, depth-limited to 32) rejects any symlink in the source tree |
| `main` traversal | resolved-path pinning at validate (above) |
| Uninstall | refuses bundled; `rmSync` the plugin dir |

### Permission model (`src/main/plugins/sdk/permissions.ts`)

- `ENFORCED_PERMISSIONS = ['keyring','connections','ipc']` — gated at the
  SDK boundary (`guardKeyring`, `guardConnections`, inline `ctx.ipc` check);
  ungranted use throws `PermissionDeniedError` (rejects for async methods).
  `ADVISORY_PERMISSIONS = ['network','filesystem','process']` — consent
  only; enforced solely for isolated plugins via the worker module sandbox.
- **`effectiveGrants(declared, userGranted) = declared ∩ userGranted`** — a
  stale grant record can never confer an undeclared capability. Trusted =
  `plugin.path === '<bundled>'` → `ALL_PERMISSIONS`, immutable (`setGrants`
  returns the declared set unchanged).
- Persistence: grants under `pluginGrants` in config (`pluginGrantsStore`),
  enable/disable in `disabledPluginsStore` — both config-store backed
  ([`config-store.md`](./config-store.md)). `PERMISSION_INFO` supplies the
  consent-UI copy returned by `plugins:get-permissions`.

### SDK registries (the shapes v2 traits mirror)

From `src/main/plugins/sdk/`: `ThemeRegistryImpl` (`register` runs
`validateTheme` eagerly and stores the report; `strict` option; duplicate id
throws; `onChange`; constants `REQUIRED_THEME_TOKENS` — 10,
`--color-bg-primary` … `--color-focus-ring` — and
`RECOMMENDED_THEME_TOKENS` — 19), `CommandRegistryImpl` (id-keyed, duplicate
throws, optional execution wrapper), `ServiceRegistryImpl`
(`provide`/`consume`/`onAvailable` with buffered late-binding),
`UIRegistryImpl` (panels/statusBars/toolbars/tabs/slots/resolvers,
owner-tagged via `currentPluginName`; any change →
`plugins:ui:contributions-changed`), plus driver, tool (shared with MCP),
panel, completion, exporter, importer, formatter, type-mapper, drag-drop.

### IPC surface (`src/main/ipc/plugins.ts` — 21 invoke channels + 2 events)

`plugins:list` (name/displayName/version/description/bundled/icon-as-data-
URI/status/contributions/requestedPermissions/grantedPermissions) ·
`plugins:get-permissions` (state + `PERMISSION_INFO`) ·
`plugins:set-permissions` (→ `{granted}` after intersection) ·
`plugins:activate` / `deactivate` · `install-from-path` / `install-from-zip`
/ `open-install-dialog` / `uninstall` · `errors` (error-budget list) ·
`get-settings` / `set-setting` (`plugins.<name>.<key>` in config) /
`get-categorized-settings` (only `active`/`degraded` plugins surface) ·
`connection-fields` (from DriverRegistry factories) · `middleware-fields`
(manifest `connectionFields` of all plugins) · `get-commands` ·
`completions` · `ui:get-contributions` (per surface: statusBar/toolbar/
panels/tabs/slot/contextMenu/activityBar) · `ui:resolve` / `ui:action` (both
budget-wrapped) · `drag-drop`. Broadcast events: `plugins:lifecycle`
(`{name, event: 'activated'|'deactivated'|'installed'|'uninstalled'}`) and
`plugins:ui:contributions-changed` (no payload).

## v2 design

### Registry traits (bundled crates, per ADR-0002)

The registry *concepts* survive as traits in `verql-core`; bundled crates
register at startup (no lifecycle). One trait per v1 registry: `Driver`
(factory + capabilities; [`db-engine.md`](./db-engine.md)), `Tool` (shared
AI/MCP; [`mcp-server.md`](./mcp-server.md)), `Exporter`, `Importer`,
`Formatter`, `TypeMapper`, `Theme` (data + validation), `Command`,
`ConnectionMiddleware` (ssh-tunnel), `AiProvider`
([`ai-assistant.md`](./ai-assistant.md)), plus a service locator replacing
`ServiceRegistryImpl` (typed `Arc<dyn Any>` map — activation order is now
compile-time, so `onAvailable` buffering disappears). Shape sketch:

```rust
pub trait Exporter: Send + Sync {
    fn id(&self) -> &str;                       // stored namespaced: "<owner>:<id>" (v1 parity)
    fn descriptor(&self) -> ExporterDescriptor; // name, extension, appliesToTypes
    fn export(&self, req: ExportRequest) -> Result<ExportOutput, ExportError>;
}
pub struct Registry<T: ?Sized>(DashMap<String, Arc<T>>); // duplicate-id insert -> Err (v1 throws)
```

### The declarative plugin loader (third-party, per ADR-0003)

`verql-plugins` keeps the **entire v1 pipeline except code loading**:
discovery in the (new) app-data `plugins/` dir, `validate_manifest` with the
same rules, the same install guards (the **`zip` crate, ≥8.x** — maintained
at repo `zip-rs/zip2` but published as `zip`, there is no `zip2` crate;
avoid the legacy 0.x line — replaces v1's `execFileSync('unzip')`;
`assertSafeArchivePaths` and the symlink walk port verbatim as pure
functions; the `unzip -Z1` pre-listing becomes iterating the zip central
directory), bundled-name collision refusal, and `plugins:lifecycle`
broadcasts. Kinds supported at launch: **`themes`** (tokens/css/monaco/
preview data, validated with the ported `REQUIRED_/RECOMMENDED_THEME_TOKENS`)
and **`connectionFields`** (pure manifest data, already consumed via
`plugins:middleware-fields`). Activation = registering the data; deactivation
= removing it. No process, no error budget, no isolation.

Manifest changes (forward-compatible, additive): new optional field
**`sdkTarget`** — absent or `"js"` ⇒ a v1 JS plugin (incompatible, below);
`"declarative"` ⇒ loadable by v2.0; `"wasm"` reserved for the post-launch
SDK. For `"declarative"`, `main` is not required and, if present, is never
executed; all other v1 validation rules apply. A declarative manifest
declaring `permissions` or any code-bearing contribution kind (drivers,
commands, panels, exporters, …) is **rejected at validate** with an explicit
"requires the programmatic SDK" error — never silently ignored.

**v1 JS plugin detection**: at data migration
([`updater-packaging.md`](./updater-packaging.md)) and on every discover
pass, a plugin without `sdkTarget: "declarative"` lands in the list as
`error {phase:'validate'}` with an i18n-keyed "not compatible with Verql 2"
message, so `plugins:list` shows it by name and the migration report
enumerates it. Never silently dropped (ADR-0003 §3).

### Channel disposition (all 21 invoke channels stay callable; none reshaped)

| Channels | v2 behavior |
|---|---|
| `list`, `get-permissions`, `set-permissions`, `activate`, `deactivate`, `uninstall`, `install-from-path`, `install-from-zip`, `lifecycle` event | Full behavior. Bundled crates appear in `list` as synthetic entries (`bundled: true`, status `active`, real contributions) so the Plugins panel is unchanged; `set-permissions` still intersects via the ported `effective_grants`, though at launch only the trusted/immutable path is exercisable (declarative plugins declare no permissions). |
| `open-install-dialog` | Same result shape via `tauri-plugin-dialog`. |
| `get-settings`, `set-setting`, `get-categorized-settings` | Full behavior — bundled crates keep declaring `settings` contributions as data (e.g. the AI plugin's `autoIncludeSchema`), stored at the same `plugins.<name>.<key>` config paths. |
| `connection-fields`, `middleware-fields`, `get-commands`, `completions`, `ui:get-contributions`, `ui:resolve`, `ui:action`, `drag-drop`, `ui:contributions-changed` event | Full behavior, but the *suppliers* are bundled crates (+ declarative `connectionFields`). Third-party UI/command/completion contributions return once the WASM SDK exists. |
| `errors` | Kept; returns `[]` for every plugin — the error budget only ever tracked third-party *code*, which doesn't exist in v2.0. |

Isolation has no channel of its own (the `plugins.isolation` setting gated it);
the setting becomes inert and is dropped from the Settings UI at cutover.

### Future WASM host (post-launch, one paragraph)

The programmatic SDK returns as a WASM component host (wasmtime): plugins
compile against a WIT world mirroring the v1 enforced-capability surfaces
(keyring, connections, custom ipc, registration calls); host functions apply
`effective_grants` before answering — the v1 isolation bridge's
"enforcement lives in one place" property — and advisory permissions become
real WASI capability grants. `sdkTarget: "wasm"` selects it. A direction
with its own post-cutover design cycle (ADR-0003 §2), not a v2.0 task.

## Parity cases

- **Manifest corpus**: every accept/reject case in
  `tests/unit/manifest-validation.test.ts` + the `audit/plugin-*` suites
  replayed against `validate_manifest` — verdicts identical, error messages
  pinned on the fields they name.
- **Install adversarial**: zip-slip archive (`../evil.js`, `C:\evil`,
  absolute path), symlinked content, `name: '../escape'`, bundled collision
  (`verql-plugin-postgresql`), traversal `main` — all refused, no residue.
- **`effective_grants`**: stale-grant, undeclared-grant, empty-manifest
  intersections match `effectiveGrants` exactly.
- **`plugins:list` golden fixture** for the full bundled set — the Plugins
  panel renders identically.
- **Declarative theme round trip**: install zip → theme in registry/picker →
  required-token-missing theme demoted with toast → uninstall removes it;
  `plugins:lifecycle` event order pinned.
- **v1 JS plugin present**: discover reports `error` with the
  incompatibility key; migration report lists it by name.

## Open questions

- Do bundled synthetic entries support live `plugins:activate`/`deactivate`
  (runtime registration gating, as v1 does), or does disable become
  persisted-but-effective-on-restart? T-404 decides and logs.
- Declarative-theme file layout (inline manifest `tokens` vs sibling
  JSON/CSS files) — T-405 fixes the format, ships an example plugin.
- `plugins:errors`: `NOT_MIGRATED` burndown note vs live empty handler —
  T-401 decides (the plugin detail view calls it; a working `[]` is the
  safe default).
