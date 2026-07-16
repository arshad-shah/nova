# Keyring — secret storage, profile-secret flows, v1 migration

Ports `src/main/keyring.ts` and the secret plumbing in
`src/main/ipc/{keyring,secrets,profile-secrets}.ts`. Decision record:
[ADR-0007](../decisions/ADR-0007-secrets.md). The config-side chokepoints are
specified in [`config-store.md`](./config-store.md). Tasks: T-203, T-006
(migration spike).

## v1 behavior contract

### Storage format (`keyring.ts` `KeyringService`)

One file `userData/credentials.enc`: a JSON object mapping composite key
`"<namespace>:<key>"` → encoded string, written via `writeFileAtomic` with
**mode 0600**. Encoding (`encode`/`decode`):

- OS backend available (`safeStorage.isEncryptionAvailable()`):
  `base64(safeStorage.encryptString(value))`.
- No backend (headless/WSL2 Linux): `"plain:" + base64(utf8)` — obfuscation,
  not encryption; one-time `console.warn`. The `plain:` tag can never collide
  with a legacy encrypted blob (`:` never appears in base64).

API surface and quirks that are load-bearing:

| Method | Behavior |
|---|---|
| `store` / `retrieve` | async wrappers over the sync pair |
| `storeSync(ns, key, value)` | **empty value deletes the entry**; every mutation rewrites the whole file |
| `retrieveSync` | decode failure (OS key changed, keychain reset) **deletes the entry and saves** — self-healing to a clean "missing key" state so callers re-prompt instead of throwing forever |
| `has(ns, key)` | cache presence, no decode |
| `listKeys(ns)` | keys with prefix `"<ns>:"`, prefix stripped |
| `deleteAll(ns)` | prefix sweep, single save |

Unparseable `credentials.enc` on load → empty cache (silent).

### Namespacing

The `profileId` position doubles as a namespace. In use:

- **Connection profiles** — ns = profile id; keys are secret field names.
- **`__ai__`** — provider API keys, keys `openai`/`anthropic`. Written by
  `ai:keys:set` (bundled ai plugin, `plugins/bundled/ai/internal/index.ts`)
  and the `settings:set` legacy divert (`ipc/settings.ts`); read back only as
  a boolean (`ai:keys:has`) — never echoed.
- **`__mcp__`** — the MCP bearer token, key `token` (`ipc/mcp.ts`
  `MCP_TOKEN_NS`/`MCP_TOKEN_KEY`), with a one-time migration that moves a
  legacy plaintext `mcp.token` setting into the keyring and scrubs the
  setting to `''`.

### Secret-field-key derivation (`ipc/secrets.ts`)

`getSecretFieldKeys(driverRegistry)` = `{'password'} ∪ { f.key | driver
connectionFields f with f.type === 'password' }` across all registered
drivers — plugins declare what is secret; nothing is hardcoded per dialect.
`SECRET_PLACEHOLDER = '__SECRET_PRESENT__'` is the renderer-visible sentinel:
`redactConnection` replaces each non-empty secret field with it;
`mergeIncomingProfile` maps an incoming placeholder/`''`/`undefined` back to
the existing stored value (or removes the key if none existed).

### Profile-secret flows (`ipc/profile-secrets.ts`)

The at-rest model (file-header comment): **disk = blanked, memory =
plaintext, wire = placeholder.**

| Flow | Function | When |
|---|---|---|
| extract | `extractAndPersistSecrets` — non-empty secret fields → `storeSync`, field blanked to `''` on the disk copy | `connections:save` |
| inject | `injectSecretsFromKeyring` — for each `listKeys(profile.id)`, `retrieveSync` back onto the profile | ConfigStore construction; after each save |
| strip | `stripSecretsForDisk` — blanks every field named by `listKeys(profile.id)`; the single chokepoint every disk serialization passes through | every `ConfigStore.save()` |
| delete | `deleteProfileSecrets` — prefers `deleteAll` | `connections:delete` |

Note `strip`/`inject` derive the field set **from the keyring itself**
(`listKeys`), not from the driver registry — so they work when drivers aren't
loaded and after a driver is uninstalled.

### Renderer-facing IPC (`ipc/keyring.ts`)

`keyring:store/retrieve/delete` are gated by `assertKeyringAccess`:
reserved namespaces (`__ai__`, `__mcp__`) rejected; `key` must be in
`getSecretFieldKeys`; `profileId` must be an existing connection. Within
those bounds `keyring:retrieve` **does** return plaintext to the renderer —
that is the v1 posture (the connection form re-reads a password for "test
connection" edits) and it is preserved, not widened.

### Sync accessors used by the SDK

`sdk/types.ts` exposes `retrieveSync`/`storeSync` on the plugin `KeyringAccess`;
`sdk/permissions.ts` wraps both in the enforced `keyring` permission gate
(`need()`), and the isolation worker context stubs them `NOT_SUPPORTED`.
These call sites are why v2 needs sync-shaped reads.

## v2 design: `verql-keyring` (per ADR-0007)

- **Primary store:** `keyring` crate, **v4 line** (per the amended
  ADR-0007; 4.1.x as of 2026-07). v4 splits `keyring-core` from
  per-platform store crates, and backends are explicit feature/dependency
  choices: `apple-native-keyring-store` + `windows-native-keyring-store` +
  on Linux `dbus-secret-service-keyring-store` (the **sync** store — the
  baseline, avoiding async-runtime coupling in the sync-shaped accessor
  paths below; the implementer may swap the `zbus-…` store if the cache
  layer makes everything async anyway). `service = "verql"`,
  `account = "<namespace>/<key>"` (`/` because `:` is Windows-hostile in some
  backends; the namespace scheme itself is unchanged).
- **Enumeration index:** OS keyrings cannot list by prefix, but v1's
  `listKeys` powers strip/inject/deleteAll. v2 keeps a **names-only index**
  (`userData/keyring-index.json`, atomic-written): namespace → key names. It
  contains no secret material (adversarial case below), is rebuilt-tolerant
  (a missing index entry only means inject skips a field until next save),
  and is updated inside the same store/delete critical section.
- **Sync-style cache:** per ADR-0007's consequence, a read-through
  `DashMap<(String,String), String>` fills on first retrieve, invalidates on
  store/delete. `retrieveSync` equivalents read the cache or block briefly on
  the OS call (`spawn_blocking` from async contexts).
- **Decode-failure self-heal ported:** an entry the OS refuses to decrypt is
  deleted (entry + index) and reads return `None`, matching v1's re-prompt
  behavior.
- **Empty-value-deletes ported** (`storeSync('', …)` semantics — the ai
  plugin uses it to clear keys).
- **Linux fallback:** when Secret Service is absent, an encrypted file
  (ChaCha20-Poly1305/age or Stronghold, implementer's choice per the ADR)
  holding the same namespace→key map, mode 0600, atomic writes — never
  silently weaker than v1's `plain:` (which it strictly improves on).
- The IPC gate (`assertKeyringAccess`) ports verbatim into the dispatch
  handler: same reserved-namespace, recognized-field, and known-profile
  checks with the same error messages.

### v1 → v2 secret migration (`verql-migrate-v1`)

Reading `credentials.enc` requires reversing `safeStorage`. Strategy per
platform (ADR-0007 §3, amended by the T-006 spike):

| Platform | v1 `safeStorage` backing | Strategy |
|---|---|---|
| Linux, `plain:` entries | none (base64) | (a) decode directly, import |
| Linux, encrypted entries | libsecret-held key (or basic-text) | (a) where the key is app-independent (basic-text store); else (b)/(c) |
| Windows | DPAPI, current-user scope, app-independent | (a) `CryptUnprotectData` on each blob |
| macOS | Keychain entry owned by the **Electron** app (service `verql` — see the `STORAGE_NAME` invariant comment in `src/main/index.ts`) | (b) final v1.x "export for v2" release writing a v2-readable handoff file; fallback (c) re-prompt, listing affected profiles by name |

Rules regardless of path: entries that fail to decrypt are reported (profile
+ field name), never silently dropped; the migration also imports `__ai__`
and `__mcp__` (a lost MCP token regenerates on next start — acceptable; lost
AI keys are re-prompted); `credentials.enc` is left in place untouched until
the cutover checklist's cleanup step.

## Parity + adversarial cases

1. Placeholder round-trip: save profile → list shows `__SECRET_PRESENT__` →
   re-save the listed object unchanged → stored secret survives (pinned
   fixture, per driver with a plugin-declared password field, e.g. ssh
   passphrase via the ssh-tunnel connection fields).
2. `keyring:retrieve('__ai__', …)` and `('__mcp__', …)` reject; retrieve for
   an unknown profile or a non-secret field rejects — same messages as v1.
3. **Secrets never on disk in config.json:** after every mutation sequence in
   the parity suite, scan config.json for every known plaintext fixture
   secret — zero hits (v1 and v2 alike).
4. **Secrets never in logs/activity:** the dispatch tracing middleware
   records channel + timing + arg *count* only (v1: `ipc/context.ts` —
   "never argument values"); the adversarial case drives `keyring:store` and
   `connections:save` and scans the activity export and stderr for fixture
   secrets.
5. Keyring-index file contains only namespace/key names (scan for fixture
   secret values).
6. Self-heal: corrupt one OS entry → retrieve returns null, entry gone,
   subsequent saves don't resurrect it.
7. Migration: a seeded v1 userData tree per platform → all connection
   passwords usable in v2 (test connection succeeds against the seeded
   docker DBs) or explicitly reported as needing re-entry; never silent loss.

## Open questions

- T-006 must confirm Windows DPAPI blobs from Electron's `safeStorage`
  decrypt via raw `CryptUnprotectData` (Electron may prepend a version tag to
  ciphertexts — verify the blob framing) and pick (a)/(b) per platform,
  amending ADR-0007.
- Whether the enforced-permission SDK sync accessors survive into v2's
  declarative-plugin world at all (no programmatic plugins at launch per
  ADR-0003) — if not, the cache exists only for core hot paths and shrinks.
