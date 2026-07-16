# ADR-0004: Database driver crates

- Status: proposed
- Verify-first: T-002 re-checks maintenance status/versions of every crate

## Context

Six engines to port. v1 uses Node clients (better-sqlite3, pg, mysql2,
mongodb, ioredis, snowflake-sdk). Selection criteria: parity fidelity with
v1 observable behavior (types, errors, cancellation), maintenance health,
async-runtime fit (tokio), and TLS story (prefer rustls; native-tls where a
crate demands it).

## Decision

| Engine | Crate | Rationale / parity notes |
|---|---|---|
| SQLite | `rusqlite` (bundled sqlite3) | mature; `interrupt()` gives cancellation + timeout the v1 driver couldn't; runs on `spawn_blocking`. Also used for app.db (verql-appdata). |
| PostgreSQL | `tokio-postgres` + `postgres-native-tls`/rustls | direct protocol control needed for parity: server-side `statement_timeout` on a dedicated connection (v1 behavior), cancel tokens, numbered `$n` params match v1 placeholderStyle. Chosen over `sqlx` (see below). |
| MySQL | `mysql_async` | tokio-native; per-query timeout; `KILL QUERY` for cancellation mirrors mysql2 semantics. |
| MongoDB | `mongodb` (official Rust driver) | official, tokio-based. The v1 adapter translates a JSON command syntax (`statementSyntax: 'mongodb'`) — that translation layer ports as Rust logic, biggest non-SQL parity surface. |
| Redis | `redis` (redis-rs) with tokio + connection-manager | RESP2/3, command parity with ioredis usage; the v1 command-buffer statement splitting is renderer/shared logic and stays. |
| Snowflake | **Snowflake SQL REST API v2 over `reqwest`** (JWT key-pair + PAT/password auth) | there is no official Rust driver; community crates are thin wrappers over the same REST API. Owning the REST client directly: fewer deps, and the v1 features used (query, warehouse/role switch, introspection via SHOW/INFORMATION_SCHEMA) map cleanly. Spike task in Phase 1 de-risks auth modes before Phase 3 commits. |

**Not `sqlx` as a unifying layer:** sqlx optimizes for compile-time-checked
app queries against one schema; Verql executes *arbitrary user SQL* against
*arbitrary schemas* and needs driver-specific control (cancel, timeout
mechanisms, type/OID introspection, EXPLAIN forms). Per-engine crates keep
each driver's parity knobs reachable. The `Driver` trait in `verql-db` is
our unifying layer — same role the v1 `DbAdapter` played.

## Consequences

- Value serialization is per-driver work: each parity suite pins how NULL,
  bigint, decimal, date/time, bytea/blob, json, and driver-specific types
  (Mongo ObjectId/dates, Redis bulk strings, Snowflake VARIANT) appear in
  `QueryResult` — matching v1's JS-side renderings exactly, including the
  cases where v1 stringifies to avoid precision loss.
- SSH tunnel (russh, see subsystems/ssh-tunnel.md) fronts any TCP driver as
  connection middleware, same as v1.
- Snowflake REST means we own retry/session semantics — bounded by the v1
  feature surface actually used (audited in the subsystem spec).
