# ADR-0004: Database driver crates

- Status: proposed
- Versions verified 2026-07-16 against [versions-baseline.md](./versions-baseline.md);
  T-002 re-checks that baseline for drift at execution time

## Context

Six engines to port. v1 uses Node clients (better-sqlite3, pg, mysql2,
mongodb, ioredis, snowflake-sdk). Selection criteria: parity fidelity with
v1 observable behavior (types, errors, cancellation), maintenance health,
async-runtime fit (tokio), and TLS story (prefer rustls; native-tls where a
crate demands it).

## Decision

| Engine | Crate (baseline version) | Rationale / parity notes |
|---|---|---|
| SQLite | `rusqlite` 0.40.x (bundled SQLite 3.53) | mature; `get_interrupt_handle()` (ungated, `Send+Sync`) gives cancellation + timeout the v1 driver couldn't; runs on `spawn_blocking`. Also used for app.db (verql-appdata). |
| PostgreSQL | `tokio-postgres` 0.7.x + `tokio-postgres-rustls` (or `postgres-native-tls`) | actively maintained (repo now under the `rust-postgres` org); direct protocol control needed for parity: server-side `statement_timeout` on a dedicated connection (v1 behavior), `Client::cancel_token()` (the deprecated `cancel_query` is not to be used), numbered `$n` params match v1 placeholderStyle. Chosen over `sqlx` (see below). |
| MySQL | `mysql_async` 0.37.x | tokio-native. **No built-in per-query timeout**: enforce via `tokio::time::timeout` around the query future (client-side; note the server keeps executing) optionally + server-side `max_execution_time`; cancellation = record `CONNECTION_ID()`, then `KILL QUERY <id>` over a second connection (best-effort). |
| MongoDB | `mongodb` 3.x (official Rust driver) | official, tokio-only since 3.0. The v1 adapter translates a JSON command syntax (`statementSyntax: 'mongodb'`) — that translation layer ports as Rust logic, biggest non-SQL parity surface. |
| Redis | `redis` (redis-rs) 1.x with tokio + `connection-manager` | crossed 1.0 in 2026; RESP2/3, auto-reconnect. (`fred` is dormant since Feb 2025 — do not use.) The v1 command-buffer statement splitting is renderer/shared logic and stays. |
| Snowflake | **Snowflake SQL API v2 (REST) over `reqwest`** — auth: **key-pair JWT + PAT first-class, OAuth optional** | still no official Rust driver (`snowflakedb/universal-driver` is experimental/unsupported — watch, don't ship). The REST API **does not accept basic password auth at all**, and Snowflake's MFA enforcement (M3: Aug–Oct 2026) is ending password-only access generally — so v2 leads with key-pair/PAT rather than treating them as extras, and the connection form gains those fields (a sanctioned, product-visible deviation from v1's password-first form; the spike T-007 + ADR sign-off cover it). `snowflake-connector-rs` 1.0 (active, key-pair/PAT-capable) is the fallback if owning the REST client stalls. The v1 features used (query, warehouse/role switch, SHOW/INFORMATION_SCHEMA introspection, cancel endpoint) map cleanly. |

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
