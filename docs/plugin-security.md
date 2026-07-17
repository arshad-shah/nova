# Plugin security

How Verql limits the blast radius of third-party plugins, what it does **not**
defend against today, and what plugin authors and users need to know. Read
[`architecture.md`](./architecture.md) for the plugin model first, then
[`plugins.md`](./plugins.md) for the contribution surfaces. This doc is the
source of truth for the **trust boundary**.

> **One-line summary.** Plugins are ordinary Node modules loaded into the main
> process, so a hostile plugin has the Node API at its disposal. Verql's
> defences are *defence in depth* — explicit capability declaration,
> deny-by-default user consent, hard gating of the sensitive host-provided
> surfaces, and install-time hardening — not an OS sandbox. The honest fix for
> true isolation (process separation) is on the roadmap below.

## Trust model

There are two classes of plugin, and they are treated very differently:

| Class | Where it comes from | `path` | Trust |
|-------|--------------------|--------|-------|
| **Bundled** | Shipped inside the app bundle (`src/main/plugins/bundled/`) — the native drivers, `db-tools`, `ai`, `core-formats`, `core-themes`, `ssh-tunnel`, etc. | `'<bundled>'` | **Trusted.** Every capability is implicitly granted; gating is bypassed. |
| **Third-party** | Installed by the user into `userData/plugins/` | a real path | **Untrusted.** Deny-by-default; only granted capabilities work. |

The distinction is made in exactly one place — `plugin.path === '<bundled>'`
in `plugin-host.ts` — and flows into `createPluginContext` as the `trusted`
flag. There is no in-between: a plugin a user dropped on disk is never trusted,
even if it shares a name with a bundled one (see *Name shadowing* below).

## What a plugin can reach

A plugin's only **sanctioned** interface is the `PluginContext` it receives in
`activate(ctx)` (see [`sdk/types.ts`](../src/main/plugins/sdk/types.ts)). The
surfaces split into three risk tiers:

- **Sensitive, enforced** — gated behind a permission grant:
  - `ctx.keyring` — read/write stored DB passwords and API keys.
  - `ctx.connections` — read connection profiles and run queries on live
    connections.
  - `ctx.ipc` — register arbitrary main-process IPC channels the renderer can call.
- **Trusted-only** — never available to third-party plugins at all:
  - `ctx.rootSettings` — raw, un-namespaced app settings (AI provider config,
    MCP token, …). Untrusted plugins get a throwing shim; they must use their
    own namespaced `ctx.settings` instead.
- **Ungated** — the surfaces a plugin needs to do its normal job: registering
  drivers, themes, exporters/importers, formatters, panels, commands, tools,
  type mappers, completions, drag-drop, notifications, `broadcast`, and reading
  schema metadata (`ctx.schema`). These are how a plugin contributes value;
  gating them would defeat the purpose.

## The capability/permission model

Defined in [`sdk/permissions.ts`](../src/main/plugins/sdk/permissions.ts).

### Declaration

A plugin lists the sensitive capabilities it needs in its manifest:

```jsonc
{
  "name": "my-cloud-driver",
  "version": "1.0.0",
  "displayName": "My Cloud Driver",
  "description": "…",
  "main": "index.js",
  "permissions": ["keyring", "connections", "network"]
}
```

`validateManifest` rejects any unknown permission string at validation time, so
a typo fails the plugin loudly rather than silently granting nothing.

### Enforced vs advisory

| Permission | Tier | Enforced? | What it covers |
|------------|------|-----------|----------------|
| `keyring` | enforced (host) | ✅ host blocks the surface | stored secrets |
| `connections` | enforced (host) | ✅ | connection profiles + live queries |
| `ipc` | enforced (host) | ✅ | custom main-process channels |
| `network` | enforced (worker)¹ | ✅ when isolated | outbound network |
| `filesystem` | enforced (worker)¹ | ✅ when isolated | files outside the plugin folder |
| `process` | enforced (worker)¹ | ✅ when isolated | launching child processes |

¹ Enforced **for process-isolated plugins** via the worker module sandbox (see
below). A plugin that falls back to in-process execution (driver/exporter/tool
plugins — see *Process isolation*) is in the host process where these can't be
gated, so for those they remain advisory. Isolation is on by default, so a
typical command/theme plugin gets real enforcement.

**Host-enforced** capabilities are wrapped by guards (`guardKeyring`,
`guardConnections`, and an inline check in `ctx.ipc.handle`). An ungranted call
throws `PermissionDeniedError` — synchronously for sync methods, as a rejected
promise for async ones — with an actionable message telling the author what to
add to their manifest.

**Worker-enforced** capabilities (`network`/`filesystem`/`process`) are gated by
the **module sandbox** in `src/main/plugins/isolation/sandbox.ts`. When an
isolated worker activates a plugin, it patches the worker's CommonJS loader so
that `require('net')`, `require('fs')`, `require('child_process')`, and friends
(bare and `node:`-prefixed) throw `SandboxViolationError` unless the matching
capability was granted — *before* the plugin's own module code runs. A plugin
with no advisory grants gets a pure-compute sandbox whose only outside contact
is the RPC bridge. This is a real gate, not transparency-only; its honest limit
is that it patches the documented loader, so deeper escapes (native addons a
plugin ships, internal bindings) are follow-up hardening — see the roadmap.

### Consent & grants

- Third-party plugins start with **zero** grants. An enforced capability is
  blocked until the user explicitly grants it.
- Grants are managed in the plugin detail view's **Permissions** tab and
  persisted per-plugin in config under `pluginGrants` (`plugins:get-permissions`
  / `plugins:set-permissions` IPC).
- **Grants are intersected with the manifest** (`effectiveGrants`): a plugin can
  never receive a capability it didn't declare, even if a stale grant record
  lists one. Drop a permission from your manifest and the matching grant becomes
  inert.
- Grants are read at **activation** time, so changing a grant takes effect the
  next time the plugin is enabled (the UI prompts the user to re-enable).

## Loading & install hardening

These guards live in `plugin-host.ts` and predate or accompany the permission
model:

- **Path-traversal guard.** A manifest's `main` is resolved and pinned to the
  plugin's own directory; `../../../etc/x.js` or an absolute path is rejected
  before `require()`. (Test: `audit/plugin-path-traversal.test.ts`.)
- **Name shadowing guard.** A discovered or installed plugin whose `name`
  collides with a bundled plugin is refused, so a user-installed
  `verql-plugin-postgresql` can't shadow the built-in postgres driver and
  intercept every postgres credential. (Test: `audit/plugin-bundled-shadowing.test.ts`.)
- **Symlink rejection on install.** `installFromPath` (and therefore
  `installFromZip`, which funnels through it) walks the source tree with
  `lstat` and refuses to install if it finds any symlink — otherwise
  `fs.cpSync` would copy a link pointing at `~/.ssh`, the keychain dir, or
  `/etc` into the trusted plugin folder. (Test: `audit/plugin-install-symlink.test.ts`.)
- **Zip-slip guard before extraction.** `installFromZip` lists the archive's
  entry names (via `unzip -Z1`) and runs the pure `assertSafeArchivePaths`
  check — rejecting absolute paths, Windows drive letters, and any `..`
  traversal segment — **before** `unzip` writes anything to disk. `unzip` strips
  these by default; this explicit pre-check is defense-in-depth that doesn't
  trust that behaviour across `unzip` versions/platforms. (Test:
  `zip-slip-guard.test.ts`.)
- **Name validation before copy.** The destination directory is
  `pluginDir/<name>`; the name is checked against `^[a-z0-9-]+$` *before* the
  join so it can't escape the plugin directory.
- **Manifest input validation.** Required fields, semver, and the `^[a-z0-9-]+$`
  name pattern are enforced. (Test: `audit/plugin-manifest-rejects-bad-input.test.ts`.)

## Runtime resilience

Separate from the security boundary, the host limits the damage a *buggy* (not
necessarily malicious) plugin can do to the rest of the app:

- **Activation timeout.** `activate()` is wrapped in `safeCall` with a 10s
  timeout; a hung activation can't block boot forever.
- **Error budget.** Repeated runtime errors from a plugin's callbacks
  (`safeCallWithBudget`) trip an `ErrorBudget` and auto-deactivate it.
- **Scoped disposables.** Everything a plugin registers is tracked on its
  context's `subscriptions` and torn down on deactivation, so an
  uninstall/disable fully unwinds its contributions (including its tools and
  IPC handlers).

## Process isolation

Untrusted plugins whose contributions are **marshalling-compatible** run in a
separate OS process (an Electron `utilityProcess`), not the main process. This
is the enforcement layer the capability model was designed for: the plugin's
code physically cannot touch the keyring, the connection pool, or app state —
its only path to any Verql capability is a cross-process RPC the host answers,
and the host applies the permission grant before answering. A crashing or
hostile isolated plugin also can't take down the main process.

How it fits together (`src/main/plugins/isolation/`):

- `protocol.ts` / `rpc.ts` — a small JSON request/response/event protocol and a
  transport-agnostic bidirectional `RpcEndpoint`. The `Transport` abstraction
  lets the whole bridge be unit-tested over an in-memory channel
  (`memory-transport.ts`) with no subprocess.
- `worker-entry.ts` / `worker-runtime.ts` / `worker-context.ts` — the code that
  runs in the worker: it `require()`s the plugin, hands `activate()` a **proxy
  `PluginContext`** whose every capability method forwards to the host, and
  serves host→worker invocations of the contributions it registered. Bundled to
  `out/main/plugin-worker.js`.
- `worker-process.ts` — forks the `utilityProcess` and adapts it to `Transport`.
- `sandbox.ts` — the worker module sandbox: patches the CJS loader so ungranted
  `network`/`filesystem`/`process` builtins throw, turning those advisory
  permissions into real gates for isolated plugins.
- `isolated-plugin.ts` — the host controller. It registers each reported
  contribution as a **proxy** in the real registries and serves the worker's
  capability calls by dispatching them against the *same guarded
  `PluginContext`* the in-process path uses — so permission enforcement is
  identical and lives in exactly one place. On worker exit it tears the proxies
  down and marks the plugin failed.

**Where it's applied.** A plugin is isolated when `canIsolate(manifest)` holds:
its contributions are limited to surfaces whose values can cross a process
boundary — today **commands** and **themes** (plus manifest-only declarations
like connection fields and settings). The boundary the worker exposes covers
the async capability surfaces: `connections.query`, `keyring.store/retrieve/delete`,
and `schema.*`, plus `notifications`/`broadcast` events. Isolation is on by
default and can be disabled with the `plugins.isolation` setting (e.g. to debug
a plugin in-process). Bundled plugins are trusted and always run in-process.

**Why not every plugin (yet).** The current plugin API is pervasively built on
values that don't survive a process boundary: live `DbAdapter` objects and
**synchronous** methods (`DriverFactory.placeholder`, `sampleQuery`,
`DbAdapter.isConnected`), predicate functions (`exporter.appliesTo`,
`formatter.appliesTo`), and Zod `inputSchema` objects on tools. Plugins that
contribute those surfaces fall back to in-process execution (no regression), so
**a third-party driver or tool plugin still runs in-process and should
therefore be treated as trusted.** Broadening isolation to those surfaces means
making that API marshalling-friendly — see the roadmap.

## Known limitations (read this)

Be honest about what the model does and does not buy you:

1. **Isolation is partial by contribution type.** Command/theme plugins run
   sandboxed; driver, exporter, importer, formatter, tool, and UI plugins still
   run in the main process (see above) and can `require` any Node builtin. For
   those, the enforced capability gates are the only boundary.
2. **Zip extraction shells out to `unzip`.** `installFromZip` uses the system
   `unzip` binary. The entry names are now validated against traversal/absolute
   paths (`assertSafeArchivePaths`) *before* extraction, and the symlink scan +
   name validation run on the extracted result before anything is copied — but
   `unzip` is not present on stock Windows. Cross-platform extraction is tracked
   below.
3. **No signature / publisher verification.** Verql does not yet verify a
   signature or checksum on an installed plugin, nor is there a curated
   registry. "Only install plugins you trust" is currently a social control. A
   full design for this exists at
   [`proposals/signed-plugins-and-registry.md`](./proposals/signed-plugins-and-registry.md).
4. **The worker sandbox patches the loader and the low-level escape hatches.**
   It gates `require()` of gated builtins by patching both
   `Module.prototype.require` and the underlying `Module._load` (covering
   `createRequire`-style vectors), and it neutralises `process.binding`,
   `process._linkedBinding`, and `process.dlopen` while any capability is
   withheld. **Remaining gap:** dynamic `import()` of a gated builtin is
   resolved by the ESM loader, not `Module._load`, so it is not yet blocked;
   closing it needs a module customization hook installed at process spawn —
   see roadmap item 2. A plugin shipping its own native addon is also deeper
   escape surface.

## Roadmap

Done (kept here for context):

- ✅ **Marshalling-friendly contribution APIs** — exporter/formatter/importer
  use declarative `appliesToTypes: string[]`; tool `inputSchema` ships as JSON
  Schema; the `DbAdapter`/`DriverFactory` contract is async and `placeholder`
  is a declarative `placeholderStyle`. The rich surfaces can now cross the
  isolation boundary, so isolation will broaden to drivers/exporters/tools.
- ✅ **Enforce advisory permissions in the worker** — `network`/`filesystem`/
  `process` are gated by the worker module sandbox (above) for isolated plugins.

Remaining, in rough priority order:

1. **Broaden `canIsolate`** to the now-marshalling-friendly surfaces (drivers,
   exporters, importers, formatters, tools), with the live `DbAdapter` exposed
   to the host as an RPC handle, so those plugins also run out-of-process.
2. **Deeper worker hardening** — drop `NODE_OPTIONS`/inherited env on the
   forked process, block dynamic `import()` of gated builtins via a module
   customization hook, and restrict the native-addon escape routes the module
   sandbox doesn't cover. (`Module._load` and `process.binding`/`dlopen` are
   now covered; see Known limitations item 4.)
3. **Cross-platform, in-process zip extraction** to remove the `unzip`
   dependency and fully own traversal/symlink handling.
4. **Signed plugins + a trusted registry** — verify a publisher signature or a
   checksum from a known index at install time, and show provenance in the UI.
   A full design spec already exists:
   [`proposals/signed-plugins-and-registry.md`](./proposals/signed-plugins-and-registry.md).

## For plugin authors

- Declare every sensitive capability in `permissions`. If you call a gated
  surface without declaring + being granted it, you'll get a
  `PermissionDeniedError` with the exact fix in the message.
- Prefer `ctx.settings` (namespaced) over reaching for app-wide config; you
  cannot use `ctx.rootSettings` anyway.
- Keep `activate()` fast and side-effect-light; push real work behind the
  surfaces you register.
- Ship no symlinks in your plugin package — the installer will refuse it.

## For users

- Treat installing a plugin like installing any other program: it runs with the
  app's privileges. Only install plugins from sources you trust.
- Review the **Permissions** tab before granting. A formatter or theme that
  asks for `keyring` or `network` is a red flag.
- Bundled plugins are part of Verql itself and are trusted; you can disable but
  not uninstall them (one, `db-tools`, is essential and can't even be
  disabled — the query/schema tools it provides are load-bearing).

## Tests

The security boundary is pinned by tests under `tests/unit/audit/`:
`plugin-permissions.test.ts`, `plugin-install-symlink.test.ts`,
`plugin-path-traversal.test.ts`, `plugin-bundled-shadowing.test.ts`,
`plugin-manifest-rejects-bad-input.test.ts`, and `sdk-public-surface.test.ts`.
The process-isolation bridge is covered under `tests/unit/isolation/`
(`rpc.test.ts`, `isolated-plugin.test.ts`, `sandbox.test.ts`) — including that an
ungranted host capability is denied across the (simulated) process boundary, that
the worker module sandbox blocks an ungranted `require('net')`/`fs`/
`child_process`, that grants flow to the worker, and that a worker crash tears
the plugin's proxies down.
