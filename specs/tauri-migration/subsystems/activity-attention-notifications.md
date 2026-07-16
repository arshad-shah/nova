# Activity, attention & notifications

Ports the unified activity stream (`src/main/activity/`), the per-IPC-call
tracer, the attention hub (`src/main/attention/attention-hub.ts`), the
`os-notifications` bundled plugin, and the toast bus. v2 home: a
`verql-core::activity` module + attention module, with delivery via
`tauri-plugin-notification`. Sources of truth: `shared/activity.ts`,
`docs/activity.md`, `docs/notifications.md`. Related:
[`../04-ipc-and-events-contract.md`](../04-ipc-and-events-contract.md)
(batch-timing parity), [`ai-assistant.md`](./ai-assistant.md) /
[`mcp-server.md`](./mcp-server.md) (approval producers).

## v1 behavior contract

### Entry model (`shared/activity.ts`)

`ActivityEntry {id, ts, kind, level, title, detail?, source?, durationMs?,
stack?, metadata?, traceId?}`. `ActivityKind` (10): `query`, `tool-call`,
`connection`, `notification`, `network`, `ipc`, `plugin`, `store`, `perf`,
`log`. `ActivityLevel`: `debug|info|success|warn|error`. Contract note in
the source: metadata "must be secret-free and JSON-serialisable".
`ActivityQuery {kinds?, levels?, sinceTs?, limit?}`.

### Ring & caps (`activity/log.ts`)

`ActivityLog` is an in-memory ring, `DEFAULT_CAP = 1000` entries (oldest
spliced off). Per-entry bounds applied at record time: `MAX_TEXT = 2000`
chars for `title`/`detail`/`stack` (clipped with a trailing `…`);
`MAX_META = 8000` chars of serialized metadata — over-budget metadata is
replaced by `{_truncated: true, preview}` and unserializable metadata by
`{_unserializable: true}`. `list()` filters kinds/levels/sinceTs, returns
**newest-first**, then applies `limit`. `subscribe(listener)` fires per
entry; listener exceptions are swallowed. The single instance is created in
`ipc-handlers.ts`, provided to plugins as the `activity-log` service (read
surface `ActivityReader = {list, subscribe}`), and set as the global sink:
`setActivitySink` / `recordActivity` (`activity/recorder.ts`) let any
main-side code record without constructor threading (no-op before wiring).

### Batcher (`activity/batcher.ts`) — the renderer depends on these numbers

`ActivityBatcher` coalesces entries into `activity:batch` broadcasts:
**`intervalMs = 100`** (flush that long after the *first* buffered entry;
one timer, armed only when the buffer goes non-empty) and
**`maxBatch = 50`** (eager flush the moment the buffer reaches it).
`flushNow` clears the timer and emits the whole buffer as one payload;
`dispose` = final flush. Wired in `ipc-handlers.ts`:
`activityLog.subscribe(activityBatcher.push)` →
`broadcast(IPC_EVENTS.ACTIVITY_BATCH, entries)`.

Why the renderer cares (`docs/activity.md` §"batching & pause"): the store
applies each batch in **one Zustand `set`**, and the Activity panel's
**pause** freezes a display snapshot while batches keep accumulating in the
store. Both assume bursty-but-bounded delivery: a burst of N entries arrives
as ⌈N/50⌉ messages, and a trickle is delayed at most 100 ms. Changing either
constant changes observable re-render behavior — they are parity numbers,
not tuning knobs (also called out in
[`../04-ipc-and-events-contract.md`](../04-ipc-and-events-contract.md)).

Note: `IPC_EVENTS.ACTIVITY_EVENT` (`activity:event`) is declared in
`shared/ipc.ts` but **never emitted** — main only sends `activity:batch`.
Port it as declared-but-unemitted; candidate for `wontport` cleanup at
cutover alongside `WINDOW_MENU_*`.

### Per-IPC-call tracing (`src/main/ipc/context.ts`)

The single `handle` wrapper traces **every** typed IPC call as a `kind:
'ipc'`, level `debug` entry (`title: "<channel> · <ms>ms"`, `source:
channel, durationMs`) and failures as level `error` with `detail` + `stack`.
Two secret-safety properties to preserve exactly:

1. **Exclusion list** `TRACE_EXCLUDED = {'activity:list', 'activity:clear',
   'activity:record'}` — the activity channels themselves, excluded to
   prevent the record-an-entry-records-an-entry feedback loop.
2. **Argument values are never recorded** — metadata carries only
   `{channel, args: args.length}` (the count). This, not the exclusion list,
   is what keeps `keyring:*`, `connections:save`, `ai:keys:set`, etc. out of
   the stream: the tracer is structurally incapable of leaking a payload.

### `tracedFetch` (`activity/net.ts`)

Wrapper for all AI-provider HTTP. Records a `network` entry with **only**:
`method`, `host+pathname` (query string dropped), `status`, `durationMs`,
`source: host`, `metadata {method, url: host+path, status}`; level `info`
(2xx–3xx) / `warn` (!ok) / `error` + `detail` + `stack` on throw. Never
bodies, never headers (auth keys ride in headers — this is the secret
boundary).

### Other recorders wired in `ipc-handlers.ts`

- `toolRegistry.setActivityRecorder` → `tool-call` entries (`title:
  "<toolId> · <ms>ms"`, detail = error or JSON params, level
  success/error).
- The plugin host records `plugin` entries per boot state + a boot summary
  (`plugin-host.ts` `logBootReport`).
- `logger` (`createLogger(activityLog)`) mirrors console logs as `log`
  entries.
- The renderer records `store`/`perf` entries via the `activity:record`
  invoke (verbose-gated capture, `docs/activity.md`).
- IPC handlers: `activity:list` → `log.list(query)`, `activity:clear`,
  `activity:record`.

### Attention hub (`attention/attention-hub.ts`)

A tiny delivery-agnostic relay, provided as service
`ATTENTION_SERVICE_ID = 'attention'`. API: `request(AttentionRequest {id,
kind: 'approval'|'alert'|'info', title, body?, source?})`, `resolve(id)`,
`subscribe(listener)` receiving `AttentionEvent = {type:'requested',
request} | {type:'resolved', id}`. Semantics pinned: the producer supplies
the id; `resolve` of a non-pending id is a **silent no-op** (double-resolve
from a timeout racing a user answer is harmless); listener exceptions are
isolated. Producers: the AI approval seam (`conversation-manager.ts`) and
the MCP approval flow (`mcp/server.ts`). Consumer: os-notifications.

### os-notifications plugin (`plugins/bundled/os-notifications/`)

Electron-free policy (`dispatcher.ts`) + an Electron adapter
(`native-notifier.ts`). Settings (contributed to the `general` category,
each read live): **`enabled`** (default true), **`onlyWhenUnfocused`**
(default true — skip when any non-destroyed window `isFocused()`),
**`notifyApprovals`** (default true). Behavior: `notify()` no-ops when
unavailable/disabled/focused-and-onlyWhenUnfocused; a request `id` replaces
any live notification with the same id and lets `close()`/attention-resolve
dismiss it (`active` map); default click handler focuses the primary window
(restore-if-minimized → show → focus). `handleAttention`: `resolved` →
dismiss; `approval` → gated by `notifyApprovals`, urgency `critical`;
`alert`/`info` → normal notifications. Also publishes the
`os-notifications` service (`OsNotificationService {isAvailable, notify}`)
for other plugins. Electron specifics: `Notification.isSupported()`,
`urgency` honored on Linux only.

### Toast bus (`ipc-handlers.ts` `notificationBus`)

`notificationBus.show(n)` does two things atomically: records a
`notification` activity entry (kind mapping `warning→warn`, default `info`)
and broadcasts **`notifications:show`** with the raw `{kind?, title,
message?, durationMs?}` payload (renderer toast store). Used by the plugin
host for theme-token warnings, isolated-plugin crash notices, etc.

## v2 design

- **`verql-core::activity`**: `ActivityLog` behind
  `parking_lot::Mutex<VecDeque<ActivityEntry>>` (cap 1000) with the same
  clip constants (2000 / 8000, identical truncation markers); subscribers as
  a **bounded** `tokio::sync::mpsc` fan-out per the concurrency rules in
  [`../02-target-architecture.md`](../02-target-architecture.md) —
  slow-consumer overflow drops the oldest buffered batch rather than growing
  unbounded (matching the spirit of the ring; a dev-facing stream, not a
  durability log). `record_activity` global via `OnceLock<ActivitySink>`,
  mirroring the recorder seam.
- **Batcher**: same algorithm on tokio — first-push arms a 100 ms sleep,
  50-entry eager flush, `emit("activity:batch", batch)`. Per the
  [ADR-0005](../decisions/ADR-0005-ipc-bridge.md) streaming addendum,
  `activity:batch` is a designated hot channel and **may be backed by
  `tauri::ipc::Channel`** behind the shim instead of `emit` (Tauri events
  are documented as unsuited to high-frequency streams); batch payload
  shape and the 100 ms / 50-entry constants are identical either way —
  T-206 decides and logs. Constants shared with the parity fixture.
- **IPC tracer**: the one `ipc_dispatch` entry point
  ([`../04-ipc-and-events-contract.md`](../04-ipc-and-events-contract.md))
  wraps every channel with the same entry shape, the same 3-channel
  exclusion set, and the same args-count-only metadata rule. The rule is
  enforced structurally: the tracer receives `args_len: usize`, not the
  `Value`.
- **`traced_fetch`**: a `verql-core` helper wrapping `reqwest` calls,
  recording exactly the v1 field set (method, host+path sans query, status,
  duration). All `verql-ai` traffic goes through it.
- **Attention hub**: same three-method API + pending `HashSet<String>` +
  silent double-resolve; producers in `verql-ai`/`verql-mcp`, consumer the
  notifications module.
- **Notifications**: the dispatcher policy ports verbatim (it is already
  dependency-injected and electron-free); the `NativeNotifier` impl is
  `tauri-plugin-notification` (2.3.x) + `tauri::Window::is_focused()` across all
  windows for focus detection, `set_focus`/`unminimize` for the click
  handler. Same three settings at the same
  `plugins.verql-plugin-os-notifications.*` config keys. **Known
  capability gap**: the plugin has no first-class handle-based `close()` on
  all platforms — replace-by-id and dismiss-on-resolve are best-effort where
  the OS API allows; the policy layer keeps the `active` map so behavior is
  identical wherever close is supported.
- Toast bus: unchanged pairing — record `notification` entry +
  `emit("notifications:show", payload)`.

## Parity cases

- **Batch timing fixture**: scripted pushes (1 entry; 49 entries; 50
  entries; 120 entries in a tick; entries at t=0 and t=90ms) → assert flush
  boundaries: single 100 ms-delayed batch; eager 50-batch + remainder;
  ⌈120/50⌉ batches; the t=90ms entry rides the first timer. Same vector file
  drives the v1 vitest and the Rust test.
- **Ring/clip goldens**: 1001st entry evicts; 2500-char detail clips to
  1999+`…`; 9 KB metadata → `{_truncated, preview}`; circular metadata →
  `{_unserializable}` (Rust analogue: non-serializable → same marker);
  `list` filter/order/limit fixtures.
- **Secrets-never-in-activity (adversarial)**: drive `connections:save` with
  a password, `keyring:*` set/get, `ai:keys:set`, an Anthropic request with
  an `x-api-key`, and a `query` tool call whose params embed a secret-looking
  string; then dump the full activity list + every emitted `activity:batch`
  and assert the secret substring appears **nowhere** (v1 passes this today
  by construction; the test pins it).
- **Attention/notification flows**: approval requested while unfocused →
  notification presented (urgency critical); focused + onlyWhenUnfocused →
  suppressed; resolve dismisses; double-resolve emits nothing;
  `notifyApprovals: false` suppresses approvals but not alerts.
- **Tracer**: `db:query` produces an `ipc` debug entry with `args`-count
  metadata only; `activity:record` produces none; a throwing handler
  produces the error-shaped entry.

## Open questions

- Bounded-fan-out drop policy (drop-oldest vs drop-newest on a saturated
  subscriber) — invisible at v1-comparable rates; T-206 picks, documents,
  and adds a saturation test.
- `tauri-plugin-notification` close/replace support per platform — T-508
  audits and records the per-OS behavior matrix in its Log.
