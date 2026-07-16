# ADR-0005: IPC bridge — single dispatch command, `electronAPI`-shaped shim, TS contract stays authoritative

- Status: proposed

## Context

166 renderer `invoke` call sites in 54 files, ~20 event subscriptions, all
typed off `shared/ipc.ts`. Options ranged from "rewrite every call site
against tauri-specta-generated bindings" to "emulate the existing bridge".

## Decision

Three coupled choices (full detail: `../04-ipc-and-events-contract.md`):

1. **The renderer keeps the `electronAPI` shape.** A `BackendBridge`
   interface with Electron and Tauri implementations is assigned to
   `window.electronAPI`; zero mass call-site rewrites; Storybook/test stubs
   keep working.
2. **One generic `ipc_dispatch(channel, args)` Tauri command** routes on
   the frozen v1 wire strings to per-domain Rust handler modules; events
   are `emit(wire_string, payload)`. Per-channel typing happens inside via
   serde. Tracing middleware + `NOT_MIGRATED` burndown live at this single
   seam.
3. **TypeScript stays the authored contract**; Rust mirrors are verified by
   a CI schema drift-check + per-channel round-trip fixtures, rather than
   generated bindings becoming a new source of truth mid-migration.

## Alternatives considered

- **tauri-specta / per-channel commands + generated TS client**: the clean
  greenfield answer, but it inverts authority (Rust becomes the contract
  source) *while* parity against a TS-defined contract is the goal, and it
  forces either 166 call-site rewrites or a mapping shim anyway. Rejected
  for the migration; explicitly recommended for **after cutover**, when the
  contract can evolve and Rust-authoritative bindings become an asset, not
  a risk. The dispatch design keeps that path open (handlers are already
  per-channel typed functions; exploding the match table into commands is
  mechanical).
- **Capability-scoped per-channel commands now, for finer Tauri permission
  granularity**: real security benefit, same cost as above. Interim
  mitigation: the dispatch command is only exposed to the app window, and
  domain-level gating inside the dispatcher replicates v1's effective
  posture (renderer was fully trusted with all 143 channels in v1 anyway).

## Consequences

- One untyped seam (`channel: String, args: Value`) exists by design;
  round-trip fixtures + the drift check are mandatory, not optional — they
  are what keeps the seam honest.
- The burndown metric ("channels still `NOT_MIGRATED`") is trivially
  derivable from the dispatch table — the orchestrator's coverage report is
  a grep.
- Post-cutover cleanup (typed commands, capability scoping, dropping the
  shim) is pre-authorized as future work and out of scope for v2.0.
