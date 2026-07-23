---
"verql": patch
---

Fix a Redis stored command-injection vulnerability (#211). The Redis driver read
table data by interpolating server-supplied key names into command strings and
running them through `query()`, whose parser splits on whitespace and newlines —
so a key literally named `app:cache\nFLUSHALL` browsed by a DBA executed
`FLUSHALL` (and `CONFIG SET`, `SCRIPT LOAD`, `SHUTDOWN`, … were reachable the same
way). `getTableData` now dispatches structured argument arrays through a new
`RedisCommandDispatcher.command([...])` method, which ioredis sends verbatim and
never re-parses, closing the hole; keys containing spaces (previously unreadable
due to bad arity) now read correctly too. `parseRedisCommands` — the parser for
user-typed console input — gains `redis-cli`-style quoting, so `SET k "hello
world"` is finally three arguments instead of four. A new fitness function
(`tests/unit/audit/redis-no-value-interpolation.test.ts`) fails the build if any
`query()` call in the Redis plugin is handed an interpolated command string.
