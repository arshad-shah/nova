---
"verql": minor
---

Stop the Redis driver from blocking production servers with `KEYS` (#212). Every
key-listing path — listing key prefixes in the explorer, counting keys per node,
and browsing a prefix's data — used `KEYS` (including unbounded `KEYS *`), which
is O(N) over the entire keyspace and blocks the Redis server for its whole
duration; simply expanding a connection to a multi-million-key instance could
stall every other client. All of them now use the non-blocking, cursor-based
`SCAN` (ioredis `scanStream`), and the previously decorative **Key scan batch
size** (`scanCount`) setting is finally real — it is passed through as the `SCAN`
`COUNT` hint. A new **Max keys to scan** (`maxKeys`, default 10,000) setting caps
how far prefix-listing and key-counting walk, so neither can traverse a whole
huge keyspace; the per-node count is a lower bound once a prefix exceeds the cap.

Browsing a prefix's data ("View data") now pages through `SCAN` honouring the
same **Max Rows to View** limit and "Load more" affordance as the relational
drivers, and reads every key on a page in two pipelined round trips (one `TYPE`
batch, one type-specific read batch) instead of two sequential round trips per
key. Key names stay injection-safe throughout — they are dispatched as
structured argument arrays and pipeline elements, never re-parsed. A new fitness
function (`tests/unit/audit/redis-no-blocking-keys.test.ts`) fails the build if
`KEYS` is reintroduced in either form (a `client.keys(...)` call or a `['KEYS', …]`
command dispatch).
