# Config store — config.json, settings pipeline, change broadcast

Ports `src/main/config/store.ts` (+ `src/main/lib/atomic-write.ts`) and the
`settings:*` / `connections:*` IPC handlers. Secret handling is split with
[`keyring.md`](./keyring.md) — this spec owns *where secrets are absent*;
that one owns where they live. Contract rules:
[`../04-ipc-and-events-contract.md`](../04-ipc-and-events-contract.md).
Tasks: T-202, T-204.

## v1 behavior contract

### File shape and load/save (`config/store.ts`)

`userData/config.json` holds exactly two top-level keys:
`{ connections: ConnectionProfile[], settings: AppSettings }`, serialized
`JSON.stringify(data, null, 2)`. **Any other top-level key is dropped on the
next save** — `load()` reads only `parsed.connections ?? []` and
`parsed.settings ?? {}`. A missing or unparseable file starts fresh silently
(no quarantine, unlike app.db — see
[`appdata-store.md`](./appdata-store.md)).

Writes go through `writeFileAtomic` (`lib/atomic-write.ts`): sibling temp file
`.{basename}.{pid}.{timestamp}.tmp` in the same directory, `writeFileSync`,
`renameSync` onto the target; temp unlinked on failure; parent dir created if
missing. Crash mid-write leaves old-or-new, never a torn file.

### Defaults merging (`shared/settings.ts` `mergeWithDefaults`)

Applied on every load. Semantics to preserve exactly:

- Iterates **`defaultSettings`' keys only** → unknown top-level settings
  categories in a persisted file are dropped.
- Wholesale-replaced categories (no deep merge): `keybindings`, `plugins`,
  `disabledPlugins`, `pluginGrants` — persisted value taken verbatim when
  present.
- Every other category: shallow spread `{ ...defaults[key], ...persisted[key] }`
  → **unknown keys *inside* a known category are preserved**, missing keys get
  defaults. One level deep only.
- Post-merge migration: `appearance.accentColor` cleared when it matches a
  `LEGACY_DEFAULT_ACCENTS` entry (`#7c6ff7`, `#2bd9a3`, case-insensitive).

### Key-path guards

Settings paths arrive from the renderer as dotted strings.
`splitSettingsKeyPath` rejects empty segments and the prototype-pollution set
`__proto__` / `constructor` / `prototype` (error:
`Settings key path '<path>' contains forbidden segment '<part>'`);
`setSetting` re-checks the same three literals at each intermediate and at the
leaf (kept local for static analysis). Intermediate non-objects throw
`Cannot set '<path>': intermediate '<prefix>' is not an object (got <type>)`;
missing intermediates are created as `{}`.

### `setSetting` write path and listener ordering

`setSetting(keyPath, value)`: no-ops (`no save, no listeners`) when
`Object.is(current, value)`. Otherwise: mutate in memory → `save()`
(synchronous, whole file) → notify `onSettingsChanged` listeners. Two distinct
listener paths exist:

1. **In-process** `ConfigStore.onSettingsChanged(cb)` — fired only when the
   store actually changed (post-`Object.is` gate), *after* the durable write.
2. **Renderer broadcast** — the `settings:set` IPC handler
   (`src/main/ipc/settings.ts`) calls `broadcast(SETTINGS_CHANGED, keyPath,
   value)` **unconditionally after `setSetting` returns**, i.e. even for
   no-op writes, but always after the write (if any) is durable. This is the
   ordering `04-ipc` pins: `settings:changed` fires after the store is
   written.

### The four `settings:*` channels (`ipc/settings.ts`)

| Channel | Behavior |
|---|---|
| `settings:get-all` | `getAllSettings()` through `redactSettings` (AI keys blanked — see keyring spec) |
| `settings:get` | `getSettingsCategory(category)`; category `'ai'` through `redactAi` |
| `settings:set` | legacy divert: keyPath `ai.openaiKey`/`ai.anthropicKey` → `keyring.storeSync('__ai__', provider, value)`, **no config write, no broadcast, early return**. Otherwise `setSetting` + broadcast + `rebuildMenuIfKeybindings` (keyPath `keybindings` or `keybindings.*` rebuilds the native menu — [`window-shell-menus.md`](./window-shell-menus.md)) |
| `settings:reset` | `resetCategory` → save → notify; handler re-reads and broadcasts the whole category value, rebuilds menu if keybindings; returns the updated category |

v1 quirk, do **not** replicate: `resetCategory` assigns the shared
`defaultSettings[category]` object *by reference*, so later `setSetting`
mutations alias the in-memory defaults until restart. v2 clones. Unobservable
across restarts; no parity case.

### The three `connections:*` channels (`ipc/connections.ts`)

| Channel | Behavior |
|---|---|
| `connections:list` | profiles with secret fields (per `getSecretFieldKeys`) replaced by `SECRET_PLACEHOLDER` (`redactConnection`) |
| `connections:save` | `mergeIncomingProfile` (placeholder/`''`/`undefined` secret → keep existing value, else delete key) → `saveConnection(merged, secretKeys)` (extracts secrets to keyring, persists stripped, keeps plaintext in memory) → returns the **redacted** saved profile |
| `connections:delete` | disconnect + drop the active adapter first, then `deleteConnection` (deletes keyring entries, saves) |

In-memory profiles are always plaintext-complete (`injectSecretsFromKeyring`
on construction); every save runs each profile through `stripSecretsForDisk`
so unrelated settings writes can't leak secrets into config.json.

## v2 design: `verql-config`

- **Model:** `ConfigData { connections: Vec<ConnectionProfile>, settings: AppSettings }`
  with `#[serde(rename_all = "camelCase")]`. `ConnectionProfile` carries
  `#[serde(flatten)] extra: serde_json::Map<String, Value>` — plugin-declared
  connection fields (ssh*, ssl, warehouse, …) are arbitrary keys on the
  profile in v1 and must round-trip losslessly. `AppSettings` mirrors the
  category structs; each category struct carries a flattened `extra` map to
  reproduce the "unknown keys inside a known category survive" semantics.
- **Merging:** `merge_with_defaults` ported 1:1, including the wholesale-
  replace list, the one-level-deep rule, and the legacy-accent migration.
- **Key paths:** same dotted-string API over `serde_json::Value` navigation.
  Prototype pollution is structurally impossible in Rust, but the guards are
  kept as validation for **wire error parity** — same forbidden-segment and
  empty-segment error messages, same intermediate-not-an-object message.
  `Object.is` no-op gate ported as `Value` equality.
- **Atomic write:** `verql-core::atomic_write` — same temp-name scheme
  (`.<name>.<pid>.<millis>.tmp`), same-directory rename
  (`std::fs::rename`; on Windows fall back to replace-semantics via
  `MoveFileExW`-backed rename as v1's Node `renameSync` does), cleanup on
  error, `create_dir_all`. Serialization: `serde_json` with `preserve_order`
  and 2-space pretty printing so a v2-written file diffs cleanly against v1's.
- **Listeners:** a registry of `Box<dyn Fn(&str, &Value)>` under the store's
  lock (the v1 shape — consumers: theme engine, plugin settings, MCP, menu
  rebuild), invoked synchronously after the durable write; the `settings:set`
  dispatch handler then emits `settings:changed` — replicating the v1
  ordering *and* the fires-even-on-no-op broadcast quirk. A `tokio::sync::watch`
  is not sufficient alone (it coalesces; v1 listeners see every change with
  its keyPath), so watch is used only for async consumers that want
  latest-value semantics.
- Store access is synchronous under a `parking_lot::Mutex`; the file write is
  small and rare, but runs on `spawn_blocking` from async handlers to honor
  the no-blocking rule (02 §concurrency).

## Parity cases

1. **Round-trip fixture:** a real v1 `config.json` (multiple profiles with
   plugin fields, customized settings in every category, unknown intra-
   category keys, an unknown top-level key, a legacy accent) → load in v2 →
   save → resulting JSON is semantically identical to what v1 produces from
   the same input, including: unknown top-level key dropped, intra-category
   unknown keys kept, accent cleared, defaults filled.
2. Missing/corrupt config.json → empty connections + pure defaults, no crash,
   no quarantine file.
3. `settings:set` with `__proto__.x` / empty segment / non-object
   intermediate rejects with the v1 error messages (error-parity fixtures).
4. Ordering: a `settings:changed` subscriber that immediately re-reads
   `settings:get` observes the new value (write-before-broadcast).
5. `settings:set('ai.anthropicKey', …)` writes nothing to config.json and
   emits no `settings:changed` (keyring-divert parity; adversarial case in
   [`keyring.md`](./keyring.md)).
6. `settings:reset('keybindings')` returns the default array, broadcasts the
   category, and the macOS menu rebuild fires.
7. `connections:save` with `SECRET_PLACEHOLDER` password on an existing
   profile: keyring value unchanged; on-disk profile has `password: ""`;
   returned profile shows the placeholder.
8. A save triggered by an unrelated settings change leaves every profile's
   on-disk secret fields blank (`stripSecretsForDisk` chokepoint parity).

## Open questions

- Exact key ordering inside profiles after a v2 rewrite (serde struct-field
  order vs v1 insertion order). Parity target is semantic equality; T-202
  decides whether byte-diff cleanliness is worth field-order pinning and logs
  the choice.
- Whether any in-process listener in v1 depends on being called synchronously
  *within* `settings:set` handling (audit during T-204 port of consumers).
