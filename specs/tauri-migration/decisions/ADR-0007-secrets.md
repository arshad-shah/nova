# ADR-0007: Secrets — `keyring` crate, encrypted-file fallback, v1 migration

- Status: proposed

## Context

v1's `KeyringService` stores all secrets (connection passwords, AI API
keys, the MCP token) in one file `userData/credentials.enc`, encrypted with
Electron `safeStorage` (OS-backed key), with a documented `plain:` base64
obfuscation fallback when no OS backend exists (headless Linux). Secrets
are namespaced (e.g. `__mcp__`), injected into connection profiles at read
time and stripped before config.json writes.

## Decision

1. **Primary store: the `keyring` crate** — real OS credential stores
   (macOS Keychain, Windows Credential Manager, Secret Service/libsecret on
   Linux). Entries keyed `service = "verql"`, `account = "<namespace>/<key>"`,
   preserving the v1 namespace scheme.
2. **Fallback: an encrypted file** for Linux without Secret Service —
   age/ChaCha20-Poly1305 with a machine-derived key, honest about its
   strength in docs exactly as v1's `plain:` fallback was. Never silently
   weaker than v1.
3. **Migration** (`verql-migrate-v1`): reading v1 `credentials.enc`
   requires Electron's `safeStorage` decryption, which the Rust app cannot
   perform on all platforms (the key lives with the OS *per-app* on some).
   Strategy, in order of preference per platform: (a) decrypt directly
   where the backing store is app-independent (Linux `plain:`/basic-text,
   Windows DPAPI current-user scope); (b) where it isn't (macOS Keychain
   entry owned by the Electron app), ship a **final v1.x Electron release
   with an "export for v2" path** that re-encrypts secrets to a v2-readable
   handoff file, and/or fall back to (c) prompting the user to re-enter
   passwords, listing exactly which profiles are affected. The migration
   spike task (Phase 0) determines per-platform which of a/b/c applies and
   records it in this ADR as an amendment. Losing secrets silently is the
   only forbidden outcome.
4. The **keyring IPC surface** (`keyring:store/retrieve/delete`) and the
   profile-secret extraction/injection/strip logic port behavior-identical
   (secrets never in config.json, never in logs/activity — adversarial
   review cases).

## Alternatives considered

- **Tauri Stronghold plugin**: an encrypted vault, but app-custom rather
  than OS-integrated; users expect DB passwords in the OS keychain (and v1
  effectively used OS-backed encryption). Kept as an option for the Linux
  fallback file instead of hand-rolling; the implementer may choose it
  there.
- **One file encrypted with an OS-held key (v1 model replicated)**: loses
  the per-entry OS keychain benefits (ACLs, user visibility) for no gain.

## Consequences

- Secret access becomes per-entry OS calls instead of one file read —
  `retrieveSync`-style hot paths (v1 SDK exposed sync variants) need a
  read-through cache with explicit invalidation on write/delete.
- Uninstall hygiene differs per platform (keychain entries outlive the
  app); the cutover checklist documents it.
