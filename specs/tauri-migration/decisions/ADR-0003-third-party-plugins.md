# ADR-0003: Third-party plugins — declarative at launch, WASM SDK post-launch

- Status: proposed — **requires explicit human sign-off: this is the one
  deliberate compatibility break in the migration**

## Context

v1 supports third-party plugins: JS modules installed to
`userData/plugins/`, running `activate(ctx)` against `@verql/plugin-sdk`
(v0.11.0, published), with enforced permissions (keyring/connections/ipc)
and optional `utilityProcess` isolation for marshalling-safe plugins.
Without Node, none of that runtime exists in v2. The realistic installed
base is small (young product), but the break must be a decision, not an
accident.

## Decision

1. **v2.0 supports declarative plugins only**: a manifest + data files, no
   executable code. Covered surfaces: **themes** and **connection fields**
   — exactly the contribution kinds v1's isolation layer already deemed
   marshalling-safe minus the two needing code (commands, settings logic).
   The install pipeline (zip, validation, guards), permission consent UI,
   lifecycle states, and `plugins:*` IPC surface all port; only code
   loading is absent.
2. **A programmatic SDK returns post-launch as a WASM component**
   (wasmtime; WASI-limited, capability-gated host functions mirroring the
   v1 enforced-permission model). This is a *direction*, not a commitment
   binding v2.0 — it gets its own design cycle after cutover. The v2
   manifest carries a `sdkTarget` field from day one so manifests are
   forward-compatible.
3. v1 JS plugins are detected at data-migration time and reported to the
   user by name as "not compatible with v2" — never silently dropped.

## Alternatives considered

- **Embed a JS runtime (QuickJS/Boa/deno_core) for SDK compat** — keeps JS
  plugin support but: native-module plugins (any driver) still can't work,
  the SDK surface would need a full shim layer, and it reintroduces the JS
  internals the migration exists to remove. Rejected for v2.0; deno_core
  remains a fallback option for the post-launch SDK if WASM proves too
  restrictive (recorded here so the future design starts from both).
- **Ship v2 with no third-party support at all** — simpler, but throws away
  the working install/permission/lifecycle machinery and the theme
  ecosystem, which is pure data and cheap to keep. Rejected.

## Consequences

- `@verql/plugin-sdk` gets a final v1-line release documenting the horizon;
  its repo docs and `site/` plugin pages need a compatibility notice
  (Phase 6 docs task).
- The advisory-permission hole in v1 (in-process plugins could `require`
  anything) closes structurally: declarative plugins can't execute, and
  the future WASM host is deny-by-default. Security posture strictly
  improves.
- Verql loses "write a driver as a plugin" externally until the WASM SDK
  exists. Bundled drivers cover the six supported engines meanwhile
  (non-goal: no new engines).
