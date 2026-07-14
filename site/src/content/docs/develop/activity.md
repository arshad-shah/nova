---
title: Activity & logging
description: Verql's unified activity stream for users and developers — the in-memory ring buffer, the log kind and app logger, IPC batching and pause for performance, and the Activity panel.
sidebar:
  order: 8
---

The **Activity log** is Verql's single, unified stream of "what's happening" —
queries the app ran, AI/MCP tool calls, connection lifecycle, notifications,
outbound network requests, **IPC calls**, **plugin lifecycle**, renderer
**store** mutations, **perf** signals, and general **diagnostic log lines** from
the glue. One stream feeds two audiences: **users** (a readable, filterable
record of what the app did) and **developers** (in-app diagnostics, no log files
to dig out of `userData`). It is also exposed to agents read-only via a shared
tool.

It follows Verql's **orchestrator + plugins** rule: the host owns the stream
(glue); recording happens at the points where things actually occur. Recorders
spread across the main process reach the single stream through a process-wide
**sink** (`src/main/activity/recorder.ts` — `setActivitySink` / `recordActivity`)
so a subsystem doesn't have to thread the log through its constructor.

## The pieces

| Layer | Owns | Lives in |
|-------|------|----------|
| **`ActivityLog`** (host glue) | an in-memory ring buffer (cap 1000); `record` / `list` / `subscribe` / `clear`; provided as the `activity-log` service | `src/main/activity/log.ts` |
| **`ActivityBatcher`** (host glue) | coalesces appended entries into batches before they cross IPC | `src/main/activity/batcher.ts` |
| **`Logger`** (host glue) | mirrors a log line to the console **and** records it as a `log` entry; provided as the `logger` service | `src/main/logging/logger.ts` |
| **Activity sink** (host glue) | process-wide handle to the one `ActivityLog`, wired once in `ipc-handlers.ts`; lets any main-side subsystem record without threading the log through its constructor | `src/main/activity/recorder.ts` |
| **`tracedFetch`** (host glue) | a `fetch()` wrapper that records a `network` entry (method, host+path, status, timing — never bodies or auth headers) | `src/main/activity/net.ts` |
| **Recorders** | call `recordActivity(...)` / `activityLog.record(...)` where things happen (db queries, connect/disconnect, tool calls, notifications, network, IPC calls, plugin boot, renderer store mutations, perf) | `src/main/ipc/db.ts`, `ipc-handlers.ts`, `src/main/ipc/context.ts`, `src/main/plugins/plugin-host.ts`, `src/main/mcp/server.ts`, … |
| **Renderer diagnostics** | renderer-side recorder (`recordActivity` over `activity:record`) + verbose flag; verbose-gated store-mutation + long-task capture | `src/renderer/src/lib/diagnostics.ts`, `src/renderer/src/lib/store-diagnostics.ts` |
| **Renderer store** | mirrors the stream (cap 1000), applies each IPC batch in one update | `src/renderer/src/stores/activity.ts` |
| **Activity panel** | filter (kind + level), search, pause, export, severity summary, verbose toggle, expand-detail drawer | `src/renderer/src/components/shell/ActivityList.tsx` (presentational), `ActivityPanel.tsx` (container) |

Entries are deliberately free of secrets, and every stored text field is clipped
to 2000 chars so a giant SQL/error can't bloat the ring or the IPC payload.

## The `log` kind and the app logger

Activity entries have a `kind` and a `level`. Alongside the user-facing kinds
(`query`, `tool-call`, `connection`, `notification`, `network`) there are
developer-oriented kinds — `ipc` (a renderer→main IPC call), `plugin` (a plugin
lifecycle event), `store` (a renderer state-store mutation), `perf` (a
performance signal such as a long task) — and a `log` kind for general
diagnostics. The level set adds `debug` (so `debug` → `info` → `success` /
`warn` → `error`).

Beyond the headline fields, an entry can carry an optional `stack` (full error
stack on a failure), `metadata` (a structured, **secret-free** JSON payload —
args/request/response/diffs — rendered in the detail drawer; clipped to 8 KB and
dropped if it can't serialise), and `traceId` (correlates related entries, e.g.
an IPC call and the query it triggered).

`createLogger(sink, scope)` returns a `Logger` with `debug` / `info` / `warn` /
`error(message, detail?)`, a `child(scope)` for narrower scopes
(`app` → `app:plugins`), and `mark(label)` for one-line operation timing. Each
log call:

1. mirrors to the matching `console` method (terminal / devtools unchanged), and
2. records a `log` entry — `title` = message, `source` = scope, `detail` = the
   serialized detail (an `Error` becomes its stack; an object becomes pretty JSON).

An object detail is **secret-redacted** before serialisation: any property whose
key looks like a credential (`password`, `token`, `*key`, `secret`,
`authorization`, `credential`) is replaced with `[redacted]`, recursively — so a
call site that logs a whole `ConnectionProfile` (plaintext secrets in memory)
can't leak them to the console or the persisted stream. Non-secret fields and
free-text strings are untouched.

`mark(label)` returns an `end(extra?)` that records a `log` entry carrying
`durationMs` (and returns that number), so a timed operation — e.g. plugin boot —
shows up in the stream like any other recorder. The engine underneath is
[`@arshad-shah/log-kit`](https://www.npmjs.com/package/@arshad-shah/log-kit):
log-kit owns the record pipeline (level gating, child-scope nesting, perf
markers) and fans each record out to two app-supplied transports — a **console**
transport that preserves the `[scope] message` format + level→method mapping, and
an **activity** transport that records into the `sink`. Transport fan-out is
failure-isolated, so a throwing sink can never break console output (or vice
versa); failures surface via `onTransportError`. The narrow four-level
`Logger` facade (serialised `detail`, `child`, `mark`) is the app's own surface
on top of log-kit's six-level structured API.

The host provides it as the `logger` service so plugins can log into the same
stream, and wires a few glue call-sites (plugin boot, MCP auto-start, drag-drop)
through it instead of raw `console.error`.

## Developer recorders

Several glue seams record diagnostics into the stream automatically. All of them
record metadata only — **never argument values, request/response bodies, or auth
headers**, which can carry secrets.

- **IPC tracing** (`src/main/ipc/context.ts`) — the shared `handle()` wrapper
  records an `ipc` entry (level `debug`) for every typed IPC call, with the
  channel, timing, and ok/err. The `activity:*` channels are excluded to avoid a
  feedback loop (recording an entry would itself record an entry).
- **Plugin lifecycle** (`src/main/plugins/plugin-host.ts`) — each plugin's final
  boot state and the overall boot summary are mirrored as `plugin` entries.
- **Network** — the AI providers call `tracedFetch` (`src/main/activity/net.ts`)
  instead of raw `fetch`, so outbound provider requests show as `network`
  entries.
- **Renderer diagnostics** (`src/renderer/src/lib/diagnostics.ts`,
  `store-diagnostics.ts`) — `installRendererDiagnostics()` (called once from
  `main.tsx`) subscribes to the Zustand stores and a `longtask`
  `PerformanceObserver`, recording `store` and `perf` entries over the
  `activity:record` IPC. This is **verbose-gated**: capture is off by default and
  costs nothing until a dev flips the Activity panel's **verbose** toggle, which
  flips the renderer's diagnostics flag.

## Clever processing: batching & pause

Recording is cheap, but **one IPC message per entry** is not — a migration, a
chatty AI loop, or verbose `debug` logging can produce a burst. Two seams keep
the UI smooth:

- **Batching (main → renderer).** `ActivityLog.subscribe` feeds an
  `ActivityBatcher`, which buffers entries and flushes a single `activity:batch`
  IPC payload when either the buffer hits `maxBatch` (50) **or** `intervalMs`
  (100 ms) elapses since the first buffered entry. The renderer applies each
  batch in one Zustand `set`, so a burst is a few re-renders, not hundreds.
- **Pause (renderer).** The panel can freeze on a snapshot so a fast stream
  can't yank rows out from under a reader; entries keep accumulating in the
  store and reappear on resume.

The panel also caps **rendered** rows (400) independently of how many the store
keeps, while export still sees every matching entry.

## The Activity panel

`ActivityList` is presentational and store-free (used by the panel and
Storybook); it owns its own filter/search/pause state. `ActivityPanel` is the
thin container that wires the live store. Controls: **search** (free-text across
title, detail, source, and serialized metadata), **kind** and **level** chips
(multi-select; empty = show all — kind chips include the developer kinds `ipc`,
`plugin`, `store`, `perf`), a **severity summary** (session error/warn counts;
click to filter that level), a **verbose** toggle (turns on renderer `store` +
`perf` capture), **pause / resume**, **export** (download the matching entries as
`verql-activity-<ts>.json`), and **clear**. Each row expands into a **detail
drawer** with the structured fields — timestamp, kind, level, source, duration,
`traceId`, the `metadata` JSON, and the error `stack` when present.

## Data model

```ts
type ActivityKind  =
  | 'query' | 'tool-call' | 'connection' | 'notification' | 'network'
  | 'ipc' | 'plugin' | 'store' | 'perf' | 'log'
type ActivityLevel = 'debug' | 'info' | 'success' | 'warn' | 'error'

interface ActivityEntry {
  id: string
  ts: number          // epoch ms
  kind: ActivityKind
  level: ActivityLevel
  title: string        // short headline
  detail?: string      // longer text (SQL, error, serialized log detail)
  source?: string      // connection id/name, provider/tool id, or logger scope
  durationMs?: number
  stack?: string       // full error stack on a failure
  metadata?: Record<string, unknown>  // structured, secret-free JSON for the drawer
  traceId?: string     // correlates related entries
}
```

`ActivityQuery` filters `list()` by `kinds`, `levels`, `sinceTs`, and `limit`.

## Where the code lives

| Concern | File |
|---------|------|
| Shared types | `shared/activity.ts` |
| Activity ring buffer | `src/main/activity/log.ts` |
| Process-wide sink | `src/main/activity/recorder.ts` |
| Traced network fetch | `src/main/activity/net.ts` |
| IPC batcher | `src/main/activity/batcher.ts` |
| App logger | `src/main/logging/logger.ts` |
| IPC-trace recorder | `src/main/ipc/context.ts` |
| Plugin-lifecycle recorder | `src/main/plugins/plugin-host.ts` |
| Renderer diagnostics (recorder + verbose store/perf capture) | `src/renderer/src/lib/diagnostics.ts`, `src/renderer/src/lib/store-diagnostics.ts` |
| Host wiring (provide services, stream batches, recorders, set sink) | `src/main/ipc-handlers.ts` |
| IPC channels / events | `shared/ipc.ts` (`activity:list`, `activity:clear`, `activity:record`, `activity:batch`) |
| Renderer store | `src/renderer/src/stores/activity.ts` |
| Activity panel UI | `src/renderer/src/components/shell/ActivityList.tsx`, `ActivityPanel.tsx` |

See also: [Notifications](/develop/notifications/) for the **attention seam** (a
separate concern — "your response is needed", not a passive record), and
[Architecture](/develop/architecture/) for where the activity log sits among the
main-process subsystems.
