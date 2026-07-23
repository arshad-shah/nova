---
"verql": patch
---

Make in-connection database switching a declared driver capability and stop
swallowing switch failures (#200). Support was previously discovered by catching
a thrown error at two call sites with empty `catch {}` blocks, so a genuine
failure (target database missing, permission denied, connection dropped) was
indistinguishable from "adapter doesn't support switching" — the tab chrome
updated regardless and the next query ran against the *previous* database. A
driver now declares `databaseSwitch: { supported: true }` (postgresql, mysql,
mongodb, redis, snowflake; SQLite declares neither the capability nor the
method), the adapter factory validates the declaration against the optional
`switchDatabase` method in both directions, and the connection selector gates
its database dropdown on the declaration rather than on a thrown error. The
shared `applyConnectionContext` helper now backs both the selector and the
pre-query prelude: a switch that fails on a *capable* driver surfaces the error
and leaves the tab's database unchanged instead of silently running elsewhere.
