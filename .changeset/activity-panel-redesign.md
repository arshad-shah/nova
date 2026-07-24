---
---

Redesign the Activity panel around the message, and give activity entries real
trace ids to correlate on.

- **Activity panel redesign.** The message now owns the full row width with
  severity moved to a 2px edge rail; the search row and both chip grids collapse
  into one filter-expression bar (`level:error kind:query source:pg-main` plus
  free text) with removable tokens and a kind/level popover; row detail moves to
  a pinned, resizable drawer (no more inline reflow); the stream becomes a
  newest-at-bottom tail that follows new entries and shows a "N new" pill when
  detached; and related entries group under the run that caused them, with a
  rolled-up severity so a child error is visible without expanding. Split into
  `components/shell/activity/*` with pure logic (filter/group/scale/tail/meta) in
  `lib/activity/*`.
- **Trace propagation.** `traceId` — declared but previously never populated —
  is now minted at the preload wire boundary and carried on every IPC invoke as
  a trace envelope, then applied on the main side through an `AsyncLocalStorage`
  ambient context that `ActivityLog.record` reads, so a query's ipc/query/driver/
  perf entries, a connection attempt, and a tool call and its network requests
  each share one id. Standalone actions (store mutations, autosaves) correctly
  stay untraced.
