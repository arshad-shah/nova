# IPC & events contract — freezing the boundary

The single most important engineering decision of this migration: **the v1
IPC contract is the specification of the Rust backend.** `shared/ipc.ts`
(143 invoke channels + 15 broadcast events, all typed) is frozen for the
duration; the renderer keeps calling exactly what it calls today; the Rust
side implements the other end. Everything in this file exists to make that
contract mechanically enforceable instead of aspirational.

## The bridge shim

A new module `src/renderer/src/lib/backend-bridge.ts` becomes the only place
that knows which shell hosts the app:

```ts
export interface BackendBridge {
  platform: NodeJS.Platform | 'web'
  invoke<K extends keyof IpcChannelMap>(channel: K, ...args: IpcArgs<K>): Promise<IpcReturn<K>>
  on<K extends keyof IpcEventMap>(channel: K, cb: IpcEventCb<K>): () => void
}
```

- **Electron impl:** delegates to `window.electronAPI` (unchanged, keeps v1
  working from the same renderer source until cutover).
- **Tauri impl:** `invoke` → Tauri `invoke('ipc_dispatch', { channel, args })`
  (see §dispatch); `on` → Tauri `listen(channel, e => cb(...e.payload))`;
  `platform` from the OS plugin, resolved once at startup before first paint
  (v1 reads it synchronously; the shim must not introduce a flash of
  wrong-platform UI — hydrate it in `main.tsx` before render).
- Selection: feature-detect (`'__TAURI_INTERNALS__' in window`), no build flag.
- Rollout: `window.electronAPI` is *assigned* from the shim so the 87
  files that reference it (166 `invoke` call sites across 54 of them, plus
  subscriptions and story stubs), the Storybook stub, and the 12 unit-test
  stubs keep working unmodified. New code may import the bridge directly; mass
  call-site rewrites are explicitly out of scope (non-goal).

## Dispatch on the Rust side

One generic Tauri command, `ipc_dispatch(channel: String, args: Value) ->
Result<Value, IpcError>`, routing on the **v1 wire strings** (`db:query`,
`settings:set`, …) to per-domain handler modules mirroring v1's
`src/main/ipc/*.ts` one-to-one.

Why one dispatch command instead of 143 Tauri commands:

- channel names carry `:` and `-`, which don't map to Rust identifiers —
  a mapping table would have to exist anyway;
- the v1 activity tracer (`ipc/context.ts` traces every call, with a
  secret-channel exclusion list) reimplements naturally as one middleware
  around one entry point;
- `NOT_MIGRATED` stubs, the burndown metric, and per-channel gating all
  live in one match table that doubles as the coverage checklist.

Inside the dispatcher, each channel's handler deserializes `args` into typed
Rust structs — serde does per-channel typing; the untyped seam is exactly
one function wide. Events go the other way as plain `app_handle.emit(wire_string,
payload)` with payloads serialized to the `IpcEventShapes` types.

## Type strategy: TS stays authoritative, Rust proves conformance

`shared/ipc.ts` + the shared type modules (`types.ts`, `settings.ts`,
`ai-types.ts`, `driver-capabilities.ts`, `db-errors.ts`, `appdata.ts`,
`activity.ts`, `export-import.ts`, `mcp.ts`, `plugin-ui-types.ts`) remain
the authored source of truth. The Rust mirrors live in `verql-core::contract`
(+ per-crate payload types) and are **checked, not trusted**:

1. A codegen/check step (Phase 1 task; `ts-rs`-style export from Rust or
   schema extraction from TS — the task evaluates and picks, recording the
   choice in its Log) emits a machine-readable schema from each side.
2. CI diffs the two schemas; any drift fails the `contract` verify scope.
3. Round-trip tests: for every channel, a fixture request/response pair
   (captured from v1 where feasible) deserializes → serializes byte-stably
   on the Rust side.

Rules that keep serde honest with the TS shapes:

- `camelCase` field renaming everywhere (`#[serde(rename_all = "camelCase")]`);
- v1 `undefined`-vs-`null` distinctions preserved
  (`skip_serializing_if = "Option::is_none"` where v1 omits keys);
- discriminated unions match v1 tag fields exactly (`#[serde(tag = …)]`);
- JS number semantics respected: row values that can exceed i64/f64 fidelity
  (bigint columns, decimals) serialize as strings **iff v1 did** — golden
  parity cases pin each driver's behavior;
- error responses: v1 rejected promises surface in the renderer as thrown
  `Error` with a `message`. The shim converts `IpcError { message, code?,
  details? }` into the same thrown shape. Channels where v1 *returned*
  structured error objects (e.g. `TestConnectionResult`) keep returning
  them — rejection vs return parity is per-channel and pinned by fixtures.

## Freeze discipline

- No channel is added, removed, renamed, or reshaped on `v2-tauri` while
  v1 code still serves it. Exception process: a contract defect discovered
  during the port is fixed **in `shared/ipc.ts` on `main` first** (keeping
  v1 shippable), then rebased into the migration — one owner task per
  change, adversarially reviewed on both sides.
- Channels with zero renderer call sites (`WINDOW_MENU_LIST`,
  `WINDOW_MENU_POPUP`) are ported as `NOT_MIGRATED` permanently and deleted
  at cutover — recorded in the burndown table as `wontport`.
- The existing CI test forbidding string-literal channel names stays green
  throughout — the shim uses the same constants.

## Event-stream parity (the subtle half of the contract)

Broadcast events carry the hard parity risks — ordering and batching are
observable behavior:

- `activity:batch` — the v1 batcher's coalescing window and max-batch
  semantics are replicated (the renderer's pause/resume logic depends on
  them);
- `ai:chat:event` — chunk granularity may differ (network reality) but
  event *types*, field shapes, ordering guarantees (e.g. tool-call events
  never interleave wrongly with text deltas), and terminal-event semantics
  are pinned by recorded v1 streams replayed as fixtures;
- `settings:changed` must fire after the store is durably written (v1
  ordering), and `window:maximize-changed` must reflect the state at emit
  time — both have renderer logic relying on it.

Every event channel gets at least one parity fixture; the Phase-5 gate
replays the AI stream corpus.
