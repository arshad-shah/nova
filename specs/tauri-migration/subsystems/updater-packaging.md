# Updater, packaging & v1-data migration

Ports the custom updater registry (`src/main/updater/`), the `updater:*` and
`app:*` IPC, swaps electron-builder for tauri-bundler, and specs the
one-shot v1 data import (`verql-migrate-v1`). Governing decision:
[ADR-0008](../decisions/ADR-0008-packaging-updater.md). Related:
[`keyring.md`](./keyring.md) (secret migration mechanics, ADR-0007),
[`appdata-store.md`](./appdata-store.md) (app.db schema),
[`plugin-system.md`](./plugin-system.md) (JS-plugin incompatibility report).

## v1 behavior contract

### Updater registry (`updater/registry.ts`, `updater/index.ts`)

`UpdaterRegistry`: channels registered in priority order;
`detectActive()` returns the **first** updater whose `isAvailable()`
resolves true, is **cached for the process lifetime** (`cachedActive`; a
throwing updater is skipped, never blocking the rest), `invalidate()` clears
the cache, `register()` also clears it. `createUpdaterRegistry()` registers
exactly one channel today: `new HomebrewUpdater('verql', app.getVersion())`
(cask name = tap entry, comment demands they stay in sync). `UpdaterId`
union reserves `'homebrew' | 'mas' | 'win-store' | 'snap' | 'apt' |
'dmg-direct'` (`updater/types.ts`).

### Homebrew channel (`updater/homebrew.ts`) — exact command sequences

All via `spawn` with inherited env, collecting `{code, stdout, stderr}`:

| Step | Invocation | Interpretation |
|---|---|---|
| `isAvailable` | platform ∈ {darwin, linux} **and** `brew --version` exits 0 **and** `brew list --cask verql` exits 0 | both required so a dev running `pnpm dev` with brew installed is *not* offered an update that would clobber their build |
| `checkForUpdate` | `brew outdated --cask --greedy --json=v2 verql` | non-zero exit or parse failure → `{latestVersion: null, available: false}` (soft-fail, never throws); else find `casks[].name === 'verql'`, `latest = entry.current_version ?? null`, `available = latest !== null && latest !== currentVersion` |
| `update(onProgress)` | `brew upgrade --cask verql` | emits `{phase:'downloading'}` first; non-zero → `{phase:'error', message: stderr \|\| "brew exited with code N"}`; success → `{phase:'done', restartRequired: true}` (brew replaces the .app in place) |

`UpdateProgress` phases (`updater/types.ts`): `idle | checking |
downloading {percent?} | installing | done {restartRequired} | error
{message}` — the full union is the wire shape of the `updater:progress`
event even though the Homebrew channel only emits
`downloading`/`done`/`error`.

### IPC (`src/main/ipc/updater.ts`, `src/main/ipc/app.ts`)

- `updater:status` → `{available: false}` or `{available: true, id,
  displayName, currentVersion}`.
- `updater:check` → `{supported: false}` or `{supported: true,
  currentVersion, latestVersion, available}`.
- `updater:update` → `{started: false, reason: 'no-updater'}` or `{started:
  true}` immediately; the long-running `active.update()` is fire-and-forget
  with progress streamed over the **`updater:progress`** broadcast (a
  rejected update promise is converted to a `{phase:'error'}` event, never a
  rejected invoke).
- `app:restart` → `app.relaunch(); app.exit(0)`.
- `app:about-info` → `{name, version, electron, chrome, node, v8, os, arch}`
  — the four runtime versions come from `process.versions.*`; feeds the
  in-app `AboutModal` on every platform (there is no native About panel).

### Packaging (`package.json#build`, v1.5)

`appId: "com.electron.verql"`, `productName: "Verql"`, `artifactName:
"${name}-${version}-${arch}.${ext}"`. Targets: mac `dmg` (x64 + arm64,
`identity: null` — unsigned; `build/afterPack.cjs` ad-hoc re-signs the
bundle with `codesign --force --deep --sign -` + verify, because a null
identity otherwise ships mismatched resource seals that macOS rejects as
"damaged"); win `appx` with the Microsoft Store identity block
(`identityName: "Arshadshah.verql"`, `publisher: "CN=2ABEC305-…"`,
`applicationId: "Verql"`); linux `AppImage`. Homebrew distribution:
`scripts/render-homebrew.mjs` renders `packaging/homebrew/
verql.cask.rb.tmpl` + `verql.formula.rb.tmpl` (fail-closed `{{KEY}}`
templating; inputs: `--version --sha-arm64 --sha-x64 --sha-appimage`) into a
tap repo — driven by the `homebrew-bump.yml` workflow on release; download
URLs interpolate electron-builder's lowercase artifact names.

## v2 design (per ADR-0008)

### `verql-updater`

Ports structurally 1:1: `trait Updater {id, display_name, is_available,
current_version, check_for_update, update(on_progress)}`,
`UpdaterRegistry` with first-available-wins + `OnceCell` caching +
never-throw scanning. Homebrew channel via `std::process::Command` running
the **same four brew invocations**, same soft-fail parse (serde on the
`--json=v2` shape), same progress emissions; `updater:progress` payloads
serialize to the identical tagged union (`#[serde(tag = "phase")]`, camelCase
fields). The three `updater:*` handlers keep their exact return shapes,
including fire-and-forget update with error-as-event.
`tauri-plugin-updater` may later slot in as the `dmg-direct` channel — not
required for cutover (ADR-0008 §2; v1 shipped Homebrew-only).

### `app:*`

`app:restart` → `app_handle.request_restart()` (tauri restart API).
`app:about-info`: the payload **keys are frozen** by the contract
(`../04-ipc-and-events-contract.md` freeze discipline). Proposed value
mapping, with the AboutModal label change riding the sanctioned renderer
hotspot list ([`renderer-bridge.md`](./renderer-bridge.md)): `version` =
tauri app version; `electron` → Tauri runtime version; `chrome` → the
platform WebView engine version (wry-reported); `node` and `v8` → `""`
(absent runtimes; keys kept so the shape doesn't drift); `os`/`arch`
unchanged (`std::env::consts`). Pinned by a fixture; final display copy is
T-604's call.

### Bundling (tauri-bundler 2.9.x)

- **Identifier changes to `com.arshadshah.verql`** (Apple rejects
  `com.electron.*` defaults; ADR-0008 fixes the name at scaffold time). This
  moves every OS-derived data path, which is precisely why v1 data migration
  must locate the *old* paths explicitly (below).
- macOS: `.app`/`.dmg`, ad-hoc signing to match v1's actual posture (the
  afterPack workaround disappears — tauri-bundler signs coherently; identity
  stays dev-null until post-cutover). Homebrew cask keeps working: the tap
  templates update to the new artifact names/URLs in the same change that
  renames artifacts; `render-homebrew.mjs` itself is packaging-agnostic and
  survives untouched.
- Linux: AppImage.
- Windows (per the amended ADR-0008): **NSIS `-setup.exe` guaranteed**
  (MSI/WiX available as needed); pick a WebView2 install mode —
  `downloadBootstrapper` default, `offlineInstaller` where the Store path
  demands it. tauri-bundler still has **no native MSIX**, but the Store
  situation improved: Microsoft Store **officially supports EXE/MSI-linked
  listings** and Tauri documents that path (code-signed installer,
  silent-install flags, offline WebView2) — that is ladder rung (a), the
  primary path validated by the T-008 spike. Rung (b): third-party MSIX
  packaging over the Tauri build (`@choochmeque/tauri-windows-bundle`)
  **only if** a packaged-identity MSIX is required — watch the known WACK
  S-mode failure (tauri#14935). Rung (c): Store submission deferred at
  cutover, NSIS direct distribution. Dropping below (a) is a product
  decision escalated to the human, never decided by the swarm. Note (a) and
  (b) both require **real code signing** — which v1's appx/Store identity
  sidestepped — so the signing line below becomes load-bearing for the
  Store path.
- CI: per-platform bundle jobs; installer size + idle RSS + cold start
  recorded against the v1 baseline (00-goals footprint gate).

### v1 data migration UX (`verql-migrate-v1`)

Electron `userData` for app name `verql` (from `package.json#name`; Electron
default = `appData/<name>`):

| Platform | v1 path (Electron) | v2 path (identifier `com.arshadshah.verql`) |
|---|---|---|
| macOS | `~/Library/Application Support/verql` | `~/Library/Application Support/com.arshadshah.verql` |
| Windows | `%APPDATA%\verql` (`C:\Users\<u>\AppData\Roaming\verql`) | `%APPDATA%\com.arshadshah.verql` |
| Linux | `$XDG_CONFIG_HOME/verql` (default `~/.config/verql`) | `$XDG_CONFIG_HOME/com.arshadshah.verql` |

First-run flow: if the v2 data dir is uninitialized and a v1 dir exists,
offer a one-shot import (explicit, visible — the two IPC channels of the
`migration:` domain plus onboarding UI own the surface). **Import order**
(each step idempotent, the whole run marked complete in v2 meta so it never
re-runs):

1. `config.json` — connections + settings, re-validated and atomically
   written to the v2 store ([`config-store.md`](./config-store.md)).
2. Secrets — `credentials.enc` (Electron `safeStorage`-encrypted, or the
   `plain:` base64 fallback) imported per the mechanism in
   [`keyring.md`](./keyring.md)/ADR-0007; includes the `__ai__` and
   `__mcp__` namespaces so API keys and the MCP bearer token survive.
   Secrets that cannot be decrypted are reported per-connection, never
   silently dropped.
3. `app.db` (+ `-wal`/`-shm`) — copied, `PRAGMA user_version` checked, then
   normal forward-only migrations run ([`appdata-store.md`](./appdata-store.md)):
   conversations, messages, saved_queries, query_history, open_tabs.
4. `plugins/` — each directory's manifest parsed; **every v1 JS plugin is
   listed by name in the migration report as "not compatible with Verql 2"**
   (ADR-0003 §3; see [`plugin-system.md`](./plugin-system.md)); declarative-
   compatible data (a pure theme plugin) may be offered for reinstall but is
   never auto-imported as code.
5. Report screen: imported counts (connections/settings/conversations/
   history/tabs), secret failures, incompatible plugins. v1 data is left in
   place untouched (v1 stays shippable until cutover — 00-goals).

### Cutover checklist sketch (input to the Phase-6 task)

1. Parity suite green on all six drivers + error-parity + AI stream corpus
   replay + MCP live-client checklist.
2. Data migration verified against a **real** v1.5 install on macOS,
   Windows, Linux (config + secrets + app.db + a JS plugin present →
   correct report).
3. Bundles: dmg (both arches) installs + launches; NSIS exe; AppImage;
   Windows Store path resolved per the ADR-0008 ladder — EXE/MSI-linked
   listing, third-party MSIX, or deferred (human sign-off).
4. Homebrew: tap templates updated, `brew install --cask verql` of the RC,
   then in-app `updater:check`/`updater:update` round trip against a staged
   bump.
5. Performance gates at-or-better vs the recorded v1 baseline.
6. Docs/site compatibility notices (plugin SDK horizon), `@verql/plugin-sdk`
   final v1-line release.
7. Human sign-off on ADR set + this checklist; then `src/main/`,
   `src/preload/`, electron deps deleted from `main`.

## Parity cases

- **Registry semantics**: first-available wins; cache holds across repeated
  `detectActive`; a throwing channel is skipped; `invalidate` re-probes.
- **Homebrew fixtures**: recorded `brew outdated --json=v2` outputs
  (up-to-date, outdated, cask missing, malformed JSON, non-zero exit) →
  identical `UpdateInfo`; update success/failure → identical progress event
  sequences (`downloading` → `done{restartRequired:true}` / `error`).
- **Channel shapes**: `updater:status`/`check`/`update` golden fixtures for
  the no-updater and homebrew cases; `about-info` fixture with the frozen
  key set.
- **Migration**: golden v1 userData trees (per platform) → v2 stores byte-
  compared where deterministic (app.db row counts, config keys), secret
  round trip asserted via connect, plugin report content pinned.

## Open questions

- Exact `about-info` value semantics for the dead `node`/`v8` keys (empty
  string vs omission — omission would change the shape; leaning empty
  string) — T-604 fixes it with the renderer fixture.
- Whether the Linux Homebrew **formula** (`verql.formula.rb.tmpl` exists for
  linuxbrew) stays a supported channel in v2 or the cask alone is blessed —
  T-603 checks real usage and decides.
- Where the migration "already ran" marker lives (v2 app.db `meta` table vs
  a sentinel file) — T-209 decides; must survive an app.db re-import.
