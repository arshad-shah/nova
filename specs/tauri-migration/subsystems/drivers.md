# drivers — the six engines, per-engine parity surfaces

One section per driver; sources
`src/main/plugins/bundled/{sqlite,postgresql,mysql,mongodb,redis,snowflake}/`;
tasks T-303…T-308. Glue mechanics: [`db-engine.md`](./db-engine.md); crate
rationale: [`ADR-0004`](../decisions/ADR-0004-database-crates.md). Every
parity suite runs against the seeded test DBs (`scripts/test-dbs.sh`) and
includes the five standard error cases — **auth failure, unreachable host,
syntax error, constraint violation, timeout** — asserting the raw message
shape and, where the driver ships `errorRules`, the `DbErrorCode` match.

## SQLite — v1 better-sqlite3 → v2 `rusqlite` (`verql-driver-sqlite`)

**v1** (`sqlite-adapter.ts`, `index.ts`): one field — `database` (`file-path`,
accept `.db,.sqlite,.sqlite3,.db3`). Connect: `journal_mode = WAL`,
`foreign_keys = ON`. Quote `"`, positional, `defaultSchemaCandidates:
['main']`, explain `{ supportsAnalyze: false, format: 'text', statement:
'EXPLAIN QUERY PLAN' }`, session `{ autoCommit: true, manualTransactions:
true, rollbackKind: 'full' }`. Result shaping branches on the prepared
statement's `reader` flag (`runPreparedStatement`) — `INSERT … RETURNING`
yields rows, non-returning `PRAGMA` uses `.run()`; `affectedRows` =
`info.changes`; `dataType` from `stmt.columns()[].type ?? 'unknown'`,
`nullable` always true. Introspection: `sqlite_master` (minus `sqlite_%`),
`PRAGMA table_info`/`foreign_key_list`/`index_list`/`index_info`/
`database_list`; `getDatabases()` = file basename; `switchDatabase` throws
`SQLite does not support switching databases`. Sessions: `Map<string,
{autoCommit, inTxn}>` over the **single shared connection**;
`assertExclusiveTxn` throws a legible one-txn-at-a-time message; disconnect
rolls back open txns. Synchronous on the main thread (known defect); no
`cancelQuery`; `timeoutMs` ignored. `generateMigrationDdl` special-cases
`INTEGER PRIMARY KEY` (rowid alias). Error rules (`error-rules.ts`): no such
column/table, `near …: syntax error`, UNIQUE/NOT NULL/FK/CHECK constraint
failed, `datatype mismatch`.
**v2**: `rusqlite` 0.40.x (bundled SQLite; see
[versions-baseline.md](../decisions/versions-baseline.md)), all calls on
`spawn_blocking`; same pragmas. Cancel + timeout via
`get_interrupt_handle()` (ungated in 0.40; `InterruptHandle` is `Send+Sync`)
— both new vs v1's nothing; the
phase-3 gate requires the non-blocking proof. Reproduce the reader-flag branch
(RETURNING/PRAGMA fixtures pin it); session model ports as-is.
**Parity**: RETURNING rows; non-returning PRAGMA; UPDATE `affectedRows`;
exclusive-txn + switchDatabase error strings; introspection goldens; interrupt
mid-`WITH RECURSIVE`. Types: INTEGER > 2^53 (better-sqlite3 emits lossy JS
numbers — pin v1's output), REAL, TEXT with quotes/newlines, BLOB (encoding
pinned by golden), NULL, affinity oddities (string in INTEGER column).

## PostgreSQL — v1 pg → v2 `tokio-postgres` + TLS (`verql-driver-postgres`)

**v1** (`postgres-adapter.ts`, `index.ts`): fields host/port(5432)/database/
username/password/ssl(boolean)/`sslMode` select (`verify-full` default |
`no-verify`); SSL sets `{ rejectUnauthorized: sslMode !== 'no-verify' }` —
verification opt-out. `pg.Pool` `max: 5`, `idleTimeoutMillis: 30000`; connect
acquires+releases a client. Quote `"`, **numbered** `$n`, explain
`{ supportsAnalyze: true, format: 'tree', statement: 'EXPLAIN ANALYZE' }`,
session `{ autoCommit: true, manualTransactions: true, isolationLevels:
['READ COMMITTED','REPEATABLE READ','SERIALIZABLE'], readOnly: true,
rollbackKind: 'full' }`. Sessions pin a `PoolClient`; `beginTransaction`
emits `BEGIN [ISOLATION LEVEL …] [READ ONLY]` validated against the static
`ISOLATION` set; `switchDatabase` serializes pool teardown/rebuild behind a
`switchLock` promise chain, rolling back/releasing sessions first;
`setSchema` = `SET search_path TO <quoted>`. `timeoutMs` (when passed):
dedicated client, `SET statement_timeout TO <ms>`, reset `TO DEFAULT` in
`finally`. Introspection: `information_schema.tables/columns`; PKs via
`pg_index`+`pg_attribute`; FKs via `key_column_usage`+`table_constraints`+
`constraint_column_usage`; indexes via `pg_index` join with `array_agg`
(excluding primary); `getSchemaObjects` = `pg_matviews`, `pg_proc`
(`prokind IN ('f','p')`), `pg_trigger` (`NOT tgisinternal`),
`information_schema.sequences`, per-table indexes, `pg_extension` (only when
schema = `public`). Field `dataType` = stringified `dataTypeID` (**the OID**,
e.g. `"23"`) — pin it. No `cancelQuery` in v1.
**Plan parsing** (`plan-parse.ts`): `parseQueryPlan` handles `EXPLAIN
(FORMAT JSON)` (first cell parses to an array with `[0].Plan`) and indented
text, into `PlanNode { type, table?, cost, rows, actualTime?, children[],
details }`. JSON mapping: `Node Type`→type, `Relation Name`→table,
`Total Cost`→cost, `Plan Rows`→rows, `Actual Total Time`→actualTime,
`Plans[]`→children recursively, remaining keys joined `k: v` into `details`.
Text mode: indent-stack parser keyed on `(cost=…..N rows=M)` with a
simple-match fallback. Port both branches verbatim; goldens = recorded output
in both formats. **Errors** (`error-rules.ts`): 13 rules — relation/column/
schema does not exist, `syntax error at or near`, unique constraint, null
value in column, FK/check violations, `invalid input syntax for type`,
already exists, division by zero, deadlock, txn aborted.
**v2**: `tokio-postgres` 0.7.18+ (actively maintained under the
`rust-postgres` org); pool of ≤5 with pinnable session clients (pool
crate validated by T-304). TLS default-verify with an explicit `no-verify`
mode, via `tokio-postgres-rustls` (or `postgres-native-tls` if rustls
fights a platform). Cancellation via `client.cancel_token()` — the old
`cancel_query` is **deprecated**, do not use it (new vs v1). Keep the
dedicated-connection `statement_timeout` mechanism and OID-string `dataType`.
**Parity**: SELECT/INSERT/UPDATE shapes (`affectedRows` = pg `rowCount`);
plan trees (text + JSON); BEGIN isolation/read-only visible server-side;
switchDatabase under concurrency; getSchemaObjects golden. Errors: 28P01
auth, ECONNREFUSED, syntax, unique violation, statement_timeout fired.
Types: `int8`/`numeric` (node-postgres returns **strings**), `json`/`jsonb`
(objects), `bytea` (Buffer), `timestamptz`/`date` (JS `Date`), `uuid`,
arrays, `interval`, NaN/Infinity in `float8`.

## MySQL — v1 mysql2 → v2 `mysql_async` (`verql-driver-mysql`)

**v1** (`mysql-adapter.ts`, `index.ts`): fields host/port(3306)/database/
username/password/ssl (→ `ssl: {}`); pool `connectionLimit: 5`. Quote `` ` ``,
positional, `defaultSchemaUseConnectionDatabase: true`, explain
`{ supportsAnalyze: true, format: 'text', statement: 'EXPLAIN ANALYZE' }`.
**No `session` capability** — no txn UI, no session/txn methods, no
`cancelQuery`. `timeoutMs` (when passed) → mysql2 options-object `timeout`.
Result shaping: rows-vs-header on `Array.isArray(result)`; `affectedRows`
from `ResultSetHeader`; `dataType` = stringified numeric `f.type`; nullable
from the NOT_NULL flag bit (`isNullableFromMysqlFlags`, bitfield or flag-name
array). Introspection: `information_schema.tables/columns/key_column_usage/
statistics` (indexes exclude `PRIMARY`, `GROUP_CONCAT … ORDER BY
seq_in_index`); `getSchemas()` = `[config.database]`; `getDatabases()`
filters mysql/information_schema/performance_schema/sys; `switchDatabase`/
`setSchema` = `USE <quoted>` + config update. Errors (`error-rules.ts`):
Unknown column, doesn't exist, `error in your SQL syntax … near`, Duplicate
entry, cannot be null, child-row FK, `Incorrect … value`, already exists,
division by zero, Deadlock found.
**v2**: `mysql_async` 0.37.x, pool cap 5. Cancel: `KILL QUERY <conn-id>`
from a second connection (id recorded via `CONNECTION_ID()` at query start)
— best-effort, new vs v1. `timeoutMs`: `mysql_async` has **no built-in
per-query timeout**, so enforce `tokio::time::timeout` around the query
future + best-effort KILL; this is a client-side bound and the server keeps
executing — which matches v1, since mysql2's options-object `timeout` is
also client-side, so parity holds. (Optional server-side
`max_execution_time` is a post-cutover Note, not parity.) Keep
numeric-type-id `dataType` strings and flag-derived nullability.
**Parity**: result shapes; `USE` ↔ getSchemas interplay; index column
ordering. Errors: ER_ACCESS_DENIED_ERROR, unreachable, syntax, duplicate
entry, FK child row, client timeout. Types: `BIGINT` > 2^53 and `DECIMAL`
(pin mysql2 default renderings from goldens), `DATETIME`/`DATE`/`TIME`/
`YEAR`, `TINYINT(1)`, `JSON`, `ENUM`/`SET`, `BINARY`/`BLOB`, zero dates.

## MongoDB — v1 mongodb driver → v2 official `mongodb` Rust driver (`verql-driver-mongodb`)

**v1** (`mongo-adapter.ts`, `index.ts`): fields host/port(27017)/database/
username/password/authSource('admin')/srv/ssl. `createAdapter` builds
`mongodb[+srv]://[user:pass@]host[:port]/db` with `authSource` iff username,
`tls=true` iff ssl, credentials URL-encoded. Capabilities: `editorLanguage:
'json'`, `statementSyntax: 'mongodb'`, nouns collection/field/document; **no**
quote/placeholders/explain/session/errorRules. Plugin settings
(`defaultLimit`, `defaultAuthSource`, `preferSrv`) are declared but never
read by the adapter.
**JSON command translation layer** — the biggest non-SQL parity surface;
port `parseMongoQuery`, the operation switch, and `formatMongoResult`
exactly. `query()` input is a JSON **object** string (never shell syntax):
required `collection` + `operation`; parse errors `Invalid query: not valid
JSON` / `… must be a JSON object` / `… missing required field "collection"` /
`"operation"` / `Unknown operation: "x". Allowed operations: …`.
`ALLOWED_OPERATIONS`: find, findOne, aggregate, count, distinct, insertOne,
insertMany, updateOne, updateMany, deleteOne, deleteMany; optional fields
`filter`, `pipeline`, `limit`, `sort`, `projection`, `update`, `document`,
`documents`, `field`, `options` (accepted, unused). Dispatch: `find` →
`coll.find(filter??{})` + `.sort/.limit/.project` when present; `findOne` →
0/1-element array; `aggregate(pipeline??[])`; `count` → `countDocuments`
scalar; `distinct` requires `field`; `insertOne` requires `document` →
`{ insertedId }` (stringified), affectedRows 1; `insertMany` requires
`documents` → `{ insertedCount }`; `updateOne/Many` → `{ matchedCount,
modifiedCount }` (affectedRows = modifiedCount); `deleteOne/Many` →
`{ deletedCount }`. `formatMongoResult`: reads — columns from the **first
document's keys**, `dataType: 'unknown'`, values through `flattenValue`
(objects/arrays → `JSON.stringify`, so ObjectId/Date become their JSON
renderings); writes — one flattened row; scalars — one `{ result }` row.
Introspection: `listCollections` → tables (`type: 'table'`, schema = current
db); columns inferred from `findOne({})` (`typeof` dataTypes, `_id` = PK);
`indexes()`; `countDocuments`; `getSchemas()` = `[currentDatabase]`;
`getDatabases()` via `admin().listDatabases()`; `switchDatabase` repoints
`client.db()`; `testConnection` → `MongoDB <ver>`. `cancelQuery` explicit
no-op; `timeoutMs` ignored. `getTableData` (`data-format.ts`) issues a `find`
through the same JSON path (jsonl/json formats:
[`import-export.md`](./import-export.md)); an AI context provider teaches the
JSON command format (`index.ts:197`).
**v2**: official `mongodb` crate 3.8.x (tokio-only since 3.0); URI
construction verbatim; translation layer
as a pure parse → dispatch → format module with identical error strings;
documents via `bson::Document`, cell rendering pinned by goldens (v1's
`JSON.stringify` of driver objects is the oracle — whether `_id` appears as
plain hex vs `{"$oid":…}` is measured, not assumed). Cancel stays a no-op
(`killOp` = post-cutover Note); `timeoutMs` ignored, as v1.
**Parity**: all 11 operations on seeded collections; every parse-error
string; nested-object cell flattening; first-document column inference on
heterogeneous collections; write-result shapes. Errors: bad credentials,
unreachable host, invalid JSON, unknown operation, `distinct` without field,
duplicate `_id` (E11000 message shape — no errorRules). Types: ObjectId,
ISODate, nested docs/arrays, NumberLong/NumberDecimal, null vs missing
field, binary.

## Redis — v1 ioredis → v2 `redis` crate + tokio ConnectionManager (`verql-driver-redis`)

**v1** (`redis-adapter.ts`, `index.ts`): fields host/port(6379)/password/
database(number 0-15)/ssl. `buildRedisConnection` maps profile → options
explicitly (username/password when non-empty; `ssl` → `tls: {}`; `database`
via `SELECT` after connect, then `PING`). Capabilities: `editorLanguage:
'plaintext'`, `statementSyntax: 'redis'`, nouns key/field/entry; nothing
else. `query()`: split lines, tokenize on whitespace (`parseRedisCommands`),
dispatch via `client.call(cmd, …args)` so unknown commands surface as Redis
ERR replies. `formatRedisResult`: single command — nil → `[{ value: '(nil)' }]`,
array → `{ index, value }` rows, object (HGETALL) → `{ field, value }` rows,
scalar → `{ value }`; multi-command — prepend a `command` column, separate
results with `{ command: '---', value: '---' }` rows; fields from the first
row's keys, `dataType: 'unknown'`. Introspection: `getTables` = `KEYS *`
grouped by first `:`-prefix (schema `db<n>`); columns/indexes `[]`;
`getRowCount` = `KEYS <table>:*` length; `getDatabases` parses `INFO keyspace`
(db0 always present); `switchDatabase('dbN')` → `SELECT n`; `testConnection`
parses `redis_version:` from `INFO server`. `cancelQuery` no-op; `timeoutMs`
ignored. `sampleQuery` = `KEYS <glob-escaped-prefix>:*`; `getTableData`
(`data-format.ts`) walks keys with `TYPE` then GET/LRANGE/SMEMBERS/HGETALL/
ZRANGE…WITHSCORES into `{ key, type, value }` rows.
**v2**: `redis` crate 1.4.x (crossed 1.0 in 2026; RESP2/3), tokio
ConnectionManager auto-reconnect; raw
`redis::cmd(args[0]).arg(rest)` dispatch so ERR replies pass through. Value
decoding must reproduce ioredis renderings (bulk strings as UTF-8, integers
as numbers, nested arrays) — goldens decide ambiguous cells. No cancel/
timeout (parity).
**Parity**: GET/nil, HGETALL rows, multi-command delimiter rows, unknown
command ERR passthrough, prefix table model + typed getTableData, INFO-derived
databases, SELECT switching. Errors: NOAUTH/WRONGPASS, unreachable,
WRONGTYPE, wrong arity. Types: integer replies, nested arrays
(ZRANGE WITHSCORES), empty array vs nil, non-UTF-8 values.

## Snowflake — v1 snowflake-sdk → v2 SQL REST API v2 over `reqwest` (`verql-driver-snowflake`)

**v1 SDK-usage audit** (`snowflake-adapter.ts`) — the adapter uses exactly:
`createConnection` + callback `connect`/`destroy`; `execute({ sqlText, binds,
fetchAsString: ['Number'], complete })` with `stmt.getColumns()`
(`getName/getType/isNullable`) and `stmt.cancel()`; `configure({ logLevel:
'ERROR' })`. No streaming, no async statement polling, no pool.
**v1 contract**: fields account(required)/host(→ `accessUrl` override)/
username/password/authenticator select (`externalbrowser` default |
`snowflake` | `SNOWFLAKE_JWT` | `oauth` | Okta URL)/privateKeyPath
(file-path `.pem,.p8,.key`)/passphrase/role + warehouse (fetchable selects,
step 1)/database + schema (fetchable, step 2, schema default `PUBLIC`). Auth
branch order in `connect()`: `privateKeyPath` ⇒ JWT key-pair (key read at
connect, optional `privateKeyPass`); else `authenticator && !password` ⇒
SSO/OAuth with `clientStoreTemporaryCredential: true`; else username/password;
database/schema/warehouse/role passed only when set (auth-only connections
support field fetching). Quote `"`, positional,
`defaultSchemaCandidates: ['PUBLIC','public']`, explain `{ supportsAnalyze:
false, format: 'text', statement: 'EXPLAIN' }`; **no session capability, no
errorRules**. `fetchAsString: ['Number']` ⇒ **every numeric cell is a
string**. `affectedRows` is (observably) `rows.length`. `cancelQuery` cancels
only the tracked `activeStatement`. Introspection:
`INFORMATION_SCHEMA.TABLES/COLUMNS/SCHEMATA` with `?` binds; `SHOW PRIMARY
KEYS/IMPORTED KEYS IN TABLE` reading the SDK's quoted-lowercase columns
(`"column_name"`, `"fk_column_name"`, …); `SHOW DATABASES` (name via
`r['"name"'] ?? r.name`); indexes `[]`. Context: `USE DATABASE/SCHEMA/
WAREHOUSE/ROLE <quoted>`; `getConnectionOptions(field)` → `SHOW …`; toolbar
selectors resolve via `SHOW ROLES/WAREHOUSES` and run
`USE ROLE|WAREHOUSE "<value>"` (`index.ts:245-272`).
**queryTimeout defect + fix**: the plugin declares `queryTimeoutSec`
("STATEMENT_TIMEOUT_IN_SECONDS applied to queries from Verql", `index.ts:28`)
but nothing reads it, and `query()` ignores `opts.timeoutMs`. v2 fixes it
(phase-3 gate requirement): send the resolved timeout as
`parameters.STATEMENT_TIMEOUT_IN_SECONDS`, and implement real cancel via
`POST /api/v2/statements/{handle}/cancel`.
**v2 REST mapping** (de-risked by spike T-007): `POST /api/v2/statements`
(`statement`, `bindings` for `?` binds, `database`/`schema`/`warehouse`/
`role` context, timeout parameter), poll `GET /api/v2/statements/{handle}`,
cancel endpoint above. **Auth: the SQL API v2 does not accept basic
password auth at all** — it takes OAuth, key-pair JWT, PAT, or WIF only.
Independently, Snowflake's MFA enforcement rollout (M2, May–Jul 2026: new
human users must use MFA — in effect now; M3, Aug–Oct 2026: service users
limited to key-pair/OAuth/PAT/WIF) kills password-only auth generally
during this migration's window. So the **v2 driver leads with key-pair JWT
+ PAT as first-class auth** (OAuth optional); the connection-form field
change vs v1's password-first form is a sanctioned, product-visible
deviation per [ADR-0004](../decisions/ADR-0004-database-crates.md).
Fallback crate if owning the REST client stalls: `snowflake-connector-rs`
1.0 (active, key-pair/PAT-capable); `snowflakedb/universal-driver` is
experimental/unsupported — **watch only, do not ship**.
`resultSetMetaData.rowType` → `FieldInfo`, numbers rendered **as strings**.
`USE …` as plain statements vs per-request context — implementer picks;
`SELECT CURRENT_ROLE()`-after-switch parity cases decide.
**Parity** (needs a live account — suite tagged `requires-credentials`,
skipped without secrets; gate report records what ran): numeric-as-string
SELECT; SHOW quoted-column extraction; USE-switch visibility; EXPLAIN text;
getConnectionOptions per field; cancel mid-query; timeout enforced
(allowlisted intentional diff vs v1). Errors: bad credentials (rejected
JWT/PAT — the SQL API takes no passwords), bad account URL,
syntax, NOT NULL violation, timeout. Types: NUMBER/DECIMAL as strings,
VARIANT/OBJECT/ARRAY, TIMESTAMP_NTZ/_TZ/_LTZ, DATE, BINARY, BOOLEAN.

## Open questions

- **Snowflake `externalbrowser`/Okta SSO over REST** — not covered by SQL-API
  key-pair/PAT auth; T-308 (with T-007) decides: browser OAuth flow, or ship
  v2.0 without SSO — narrowing a v1 auth mode requires human ratification.
- **mysql2 default renderings for BIGINT/DATETIME** (config-dependent) —
  measured from v1 goldens in T-305, never asserted from docs.
- **Mongo ObjectId/Date renderings across the structured-clone → JSON bridge
  change** — per-case allowlist decided in T-306 with harness evidence (see
  [`db-engine.md`](./db-engine.md) open questions).
- **Postgres pool crate** (deadpool/bb8/bespoke 5-slot) — T-304 validates
  against the switchDatabase-lock and pinned-session cases and records it.
