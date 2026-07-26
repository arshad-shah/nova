# db-engine — Driver trait, registry, sessions/txns, cancellation, timeouts, capabilities, error taxonomy

Ports the DB glue layer: `src/main/db/adapter.ts`, `src/main/db/factory.ts`,
`src/main/ipc/db.ts`, `src/main/plugins/sdk/driver-registry.ts`, the
`DriverFactory` surface in `src/main/plugins/sdk/types.ts`, and the shared
contracts `shared/driver-capabilities.ts` / `shared/db-errors.ts` /
`shared/types.ts`. Individual driver behavior is in [`drivers.md`](./drivers.md).
Primary tasks: T-301 (verql-db core), T-302 (`db:*` handlers).

## v1 behavior contract

### The `DbAdapter` interface (`src/main/db/adapter.ts`)

Required methods (exact v1 signatures):

```ts
connect(): Promise<void>;  disconnect(): Promise<void>;  isConnected(): Promise<boolean>
testConnection(): Promise<TestConnectionResult>          // { version, details? }
query(sql: string, params?: unknown[], opts?: { sessionId?: string; timeoutMs?: number }): Promise<QueryResult>
getTables(schema?: string): Promise<SchemaTable[]>
getColumns(table: string, schema?: string): Promise<SchemaColumn[]>
getIndexes(table: string, schema?: string): Promise<SchemaIndex[]>
getRowCount(table: string, schema?: string): Promise<number>
getSchemas(): Promise<string[]>;  getDatabases(): Promise<string[]>
switchDatabase(database: string): Promise<void>
```

Optional methods: `setSchema`, `switchWarehouse`, `switchRole`, `cancelQuery`,
`getConnectionOptions(field)`, `parseQueryPlan(result): PlanNode[]` (sync, not
async), `getSchemaObjects(schema?)`, and the session/transaction group
`openSession(sessionId, opts?: SessionOpts)`, `closeSession`,
`setAutoCommit(sessionId, enabled)`, `beginTransaction(sessionId, opts?)`,
`commit(sessionId)`, `rollback(sessionId)`. `SessionOpts =
{ autoCommit?, readOnly?, isolationLevel? }` (`shared/driver-capabilities.ts`).

### The `DriverFactory` surface (`src/main/plugins/sdk/types.ts`)

The complete capability surface a driver plugin registers (functions marked ƒ;
everything else is serializable data):

| Field | Type | Notes |
|---|---|---|
| `createAdapter` ƒ | `(config: Record<string, unknown>) => DbAdapter` | profile passed whole (`db/factory.ts`) |
| `connectionFields` | `ConnectionField[]` | `{ key, label, type: 'text'\|'password'\|'number'\|'boolean'\|'file'\|'file-path'\|'select', required?, default?, group?, fetchable?, step?, options?, accept? }` |
| `sqlDialect` | `string?` | label only, never branched on |
| `quoteChar` | `string?` | `"` (pg/sqlite/snowflake), `` ` `` (mysql) |
| `placeholderStyle` | `'numbered' \| 'positional'?` | `$n` vs `?`; rendered by SDK `renderPlaceholder` |
| `editorLanguage` | `string?` | defaults `'sql'`; mongo `'json'`, redis `'plaintext'` |
| `statementSyntax` | `string?` | renderer splitter id: `'sql'`/`'redis'`/`'mongodb'` |
| `errorRules` | `DbErrorRule[]?` | regex → `DbErrorCode` (see below) |
| `defaultSchemaUseConnectionDatabase` | `boolean?` | mysql only |
| `defaultSchemaCandidates` | `string[]?` | pg `['public']`, sqlite `['main']`, snowflake `['PUBLIC','public']` |
| `sampleQuery` ƒ | `(table, schema?) => Promise<string>?` | orchestrator throws if absent (no SQL fallback) |
| `getTableData` ƒ | `(adapter, table, schema?) => Promise<{rows, columns}>?` | driver-owned data reader for browse + export |
| `generateMigrationDdl` ƒ | `(tableName, columns[]) => Promise<string>?` | target-dialect CREATE TABLE |
| `nouns` | `DataNouns?` | `{ object?, field?, record? }` singular/plural pairs |
| `session` | `SessionCapability?` | `{ autoCommit, manualTransactions, isolationLevels?, readOnly?, savepoints?, transactionLabel?, rollbackKind? }`; omit ⇒ no txn UI |
| `explain` | `ExplainCapability?` | `{ supportsAnalyze, format: 'tree'\|'text', statement }`; renderer prepends `statement` verbatim; omit ⇒ no Explain action |
| `sessionInspection` | `InspectionCapability?` | `{ canKill }`; **no v1 driver sets it** |
| `getRuntimeCapabilities` ƒ | `(adapter) => Promise<RuntimeCapabilityOverlay>?` | **no v1 driver implements it** — `db:connection-capabilities` always returns `null` today |

`serializeStaticCapabilities` (`src/main/plugins/sdk/capabilities.ts`) is the
single serialization point: it maps the factory to `DriverCapabilities` with
`hasSampleQuery`/`hasGetTableData` as booleans derived by `typeof === 'function'`.
`mergeCapabilities` (`shared/driver-capabilities.ts`) applies a runtime overlay
that may only touch `session.{manualTransactions,isolationLevels,readOnly}` and
`sessionInspection` on blocks the driver already declared — pure, never widens.

### Registry and factory

`DriverRegistryImpl` (`src/main/plugins/sdk/driver-registry.ts`):
`register(id, factory)` throws `Driver '<id>' is already registered`; also holds
connection middleware (`registerConnectionMiddleware(id, middleware, pluginName)`,
`getMiddlewares()` — see [`ssh-tunnel.md`](./ssh-tunnel.md)). `createAdapter`
(`src/main/db/factory.ts`) resolves purely via the registry; throws
`Driver registry not initialized` / `No driver registered for type: <type>`.

### `ipc/db.ts` — handler semantics that must survive verbatim

State: `ctx.activeAdapters: Map<string, DbAdapter>` keyed by profile id
(`ipc/context.ts:16`); the SDK-visible "active connection id" lives in
`ConnectionAccessImpl` and is pushed from the renderer.

- **`db:connect`**: returns `{ success: true }` if already connected (re-pins
  active id); an `inFlightConnects` map dedups concurrent connects so losers
  don't orphan adapters. Flow: load profile → each middleware where
  `shouldApply(profile)`, via `safeCall(…, { timeoutMs: 15_000 })` →
  `createAdapter` → `connect()` → store + set active + activity record. On
  failure: if the adapter was constructed but never stored, best-effort
  `disconnect()` (pg pools can half-initialize), then return
  `{ success: false, error }` — **resolves, never rejects**.
- **`db:disconnect`**: `disconnect()`, remove from map, clear active id if it
  matched, then every middleware's `onDisconnect(profileId)` — middleware
  errors logged, never rethrown. **`db:set-active-connection`**: ignores
  non-null ids not in `activeAdapters`; `null` always allowed.
- **`db:query`**: `requireAdapter(profileId)` throws
  `Not connected — select a connection from the sidebar first`;
  success/failure recorded to the activity stream (title
  `` `${rowCount} row(s) · ${duration}ms` ``); errors **rethrow**.
- **`db:test-connection` / `db:connection-options`**: build a *temporary*
  adapter from the incoming profile merged with stored secrets
  (`resolveProfile` via `ipc/secrets.ts`), connect, call, always disconnect in
  `finally`. test-connection returns `{ success: true, ...TestConnectionResult }`
  or `{ success: false, error }` — resolves, never rejects; connection-options
  returns `{}` when `getConnectionOptions` is absent, `[]` per throwing field.
- **Optional-method channels**: `set-schema`, `switch-warehouse`,
  `switch-role`, `session:open`, `session:set-autocommit`, `txn:begin` use
  `requireAdapter` then silently no-op if the method is absent;
  `cancel-query`, `session:close`, `txn:commit`, `txn:rollback` use `.get()`
  (no throw when not connected) then optional-call; `get-schema-objects` → `[]`
  when unimplemented; `switch-database` validates non-empty name first.
- **`db:get-table-data` / `db:sample-query`**: resolved on the *factory*, not
  the adapter; both throw a named contribute-the-capability error
  (`ipc/db.ts:186`, `ipc/db.ts:303`).
- **`db:parse-plan`**: `adapter?.parseQueryPlan?.(result) ?? []`.
  **`db:driver-capabilities`**: `serializeStaticCapabilities(factory)` or
  `null`. **`db:connection-capabilities`**: `null` unless the factory
  implements `getRuntimeCapabilities` *and* the profile is connected (today:
  always null).
- **`db:format-query`** is registered in `src/main/ipc-handlers.ts:188`, not
  `ipc/db.ts`: resolves the formatter registry by `(language, connectionType)`
  → `{ formatted, changed }`; input unchanged when nothing matches.

### Per-query timeout semantics in v1 (subtle — pin exactly)

The `general.queryTimeout` setting is enforced **renderer-side**:
`useQueryExecution.ts:140-144` races the `db:query` invoke against a
`setTimeout` and shows an i18n'd timeout error — it does **not** pass
`timeoutMs`, and the server-side query keeps running. The `timeoutMs` opt is
plumbed through `db:query` and implemented by two adapters (pg: server-side
`SET statement_timeout` on a dedicated pool client, reset in `finally`;
mysql2: per-query `timeout` option), but **no v1 call site passes it** —
neither the renderer nor db-tools; sqlite/mongo/redis/snowflake ignore it.
v2 keeps the argument, honors it when supplied with the same per-engine
mechanisms, and does not invent a backend timeout for the main query path.

### Cancellation in v1

`db:cancel-query` → `adapter.cancelQuery?.()`. Implemented by snowflake
(cancels the tracked `activeStatement` only) and mongo/redis (**documented
no-ops**); pg, mysql, sqlite have no `cancelQuery` at all — the button does
nothing (sqlite can't even be reached: its sync query blocks the process,
`01-current-state-inventory.md` §defects). db-tools' `withCancellation` calls
`connections.cancelQuery(connectionId)` on tool abort
(`src/main/plugins/sdk/connection-access.ts:35`).

### Error taxonomy (`shared/db-errors.ts`)

`DbErrorCode` = 27 string codes (19 query/driver-level from `COLUMN_NOT_FOUND`
to `DUPLICATE_TABLE`, plus 8 app-layer codes `KEYRING_DECRYPT_FAILED` …
`UNKNOWN`). `DbErrorRule { code, pattern }` — pattern is a regex *source*
compiled **in the renderer**, case-insensitive, matched against the cleaned
driver message; first capture group fills the i18n interpolation variable.
Drivers ship rules via `errorRules`; the main process does not classify.

### `QueryResult` (`shared/types.ts:26`)

`{ rows: Record<string, unknown>[]; fields: FieldInfo[]; rowCount: number;
duration: number; affectedRows: number }` with
`FieldInfo { name, dataType: string, nullable }`. Row values cross Electron IPC
by **structured clone**, so JS `Date` and `Buffer` objects survive today; the
Tauri bridge is JSON. Per-driver value renderings (bigint/decimal strings,
date objects, buffers, stringified nested JSON) are enumerated and pinned in
[`drivers.md`](./drivers.md) §type fidelity; where structured clone carried a
non-JSON type, the golden fixture records v1's renderer-observed value and the
driver task reproduces it (e.g. ISO-8601 string for dates) with the difference
allowlisted per case, never globally (`../orchestration/verification.md`).

## v2 design (crate `verql-db`)

Two traits replace the factory/adapter pair, same split as v1:

```rust
#[async_trait]
pub trait Driver: Send + Sync {   // ≈ DriverFactory
    fn id(&self) -> &str;
    fn static_capabilities(&self) -> DriverCapabilities;  // serialized identically
    fn connection_fields(&self) -> Vec<ConnectionField>;
    async fn create_connection(&self, profile: Value) -> DbResult<Box<dyn Connection>>;
    // Option-gated (capability-mirroring): sample_query, get_table_data,
    // generate_migration_ddl, get_runtime_capabilities
}
#[async_trait]
pub trait Connection: Send + Sync {   // ≈ DbAdapter; one impl per engine
    async fn query(&self, sql: &str, params: Option<Vec<Value>>, opts: QueryOpts) -> DbResult<QueryResult>;
    // connect/disconnect/test/introspection/session/txn mirror the v1 method list 1:1;
    // v1-optional methods get defaults reproducing the per-channel no-op/throw split.
    fn parse_query_plan(&self, result: &QueryResult) -> Vec<PlanNode>;  // default vec![]
    fn cancel_handle(&self) -> Option<CancelHandle>;
}
```

- **Capability structs** (`DriverCapabilities`, `SessionCapability`,
  `ExplainCapability`, `InspectionCapability`, `DataNouns`, `DbErrorRule`):
  serde mirrors, `rename_all = "camelCase"` +
  `skip_serializing_if = "Option::is_none"`, so `db:driver-capabilities` is
  byte-identical to `serializeStaticCapabilities`; `mergeCapabilities` ports
  as a pure function with the same narrow overlay rules.
- **`DriverRegistry`**: `HashMap<String, Arc<dyn Driver>>` populated at
  startup from the driver crates (workspace crates, not runtime plugins —
  ADR-0002); duplicate registration is a startup panic (v1 threw). Middleware
  registration lives here too ([`ssh-tunnel.md`](./ssh-tunnel.md)).
- **`ConnectionManager`**: `DashMap<String, Arc<dyn Connection>>` — the
  thread-safe `activeAdapters` — plus
  `active_connection_id: RwLock<Option<String>>` and an in-flight-connect
  dedup map reproducing `inFlightConnects`. Middleware runs under a 15 s
  `tokio::time::timeout` matching `safeCall`.
- **Sessions/transactions** stay inside each `Connection` impl exactly as v1
  adapters own them (sqlite flag-pair, pg pinned client); the dispatcher
  preserves the per-channel throw/no-op split from the handler table above.
- **Cancellation-handle registry**: every `query()` registers an
  engine-specific `CancelHandle` (rusqlite `InterruptHandle` via
  `get_interrupt_handle()`; pg `Client::cancel_token()` — not the
  deprecated `cancel_query`; mysql `KILL QUERY <thread_id>` over a second
  connection, best-effort; snowflake REST cancel; mongo/redis stay no-ops
  — mechanisms per [`drivers.md`](./drivers.md)/ADR-0004) in a per-profile
  slot; `db:cancel-query` fires the current one. This *extends* v1 (pg/mysql/sqlite gained real cancel) —
  permitted because v1's observable behavior was "nothing happens" and the
  phase-3 gate requires the SQLite fix; the allowlist records it per driver.
- **Blocking engines** (rusqlite) run on `spawn_blocking`; no handler blocks
  the runtime (`../02-target-architecture.md` §concurrency).
- **`DbErrorCode`**: Rust enum, `SCREAMING_SNAKE_CASE` wire form identical to
  the TS union. **Rule evaluation stays in the renderer**; Rust only carries
  `errorRules` as data. IPC errors serialize as `IpcError { message, … }` and
  the shim rethrows — rejection-vs-return parity per channel as pinned in
  `../04-ipc-and-events-contract.md`.
- **`QueryResult`** serde model: `rows: Vec<serde_json::Map<String, Value>>`,
  `fields: Vec<FieldInfo>`, `rowCount`/`duration`(ms)/`affectedRows` numbers.
  Value-fidelity rules (bigint/decimal → string where the v1 client did,
  snowflake all-numbers-as-strings, mongo nested-object stringification) are
  per-driver conversion code pinned by the driver parity suites.

### The 31 `db:*` channels → trait calls

| Channel(s) | v2 target |
|---|---|
| `db:connect`, `db:disconnect`, `db:set-active-connection` | ConnectionManager (dedup, middleware, activity, active-id rules as above) |
| `db:query` | `Connection::query` + activity record + cancel-handle registration |
| `db:test-connection`, `db:connection-options` | temp connection from merged profile; always torn down; same return-not-reject shapes |
| `db:get-tables/-columns/-indexes/-schemas/-databases/-row-count/-schema-objects/-table-names` | `Connection` introspection (`get-table-names` = `getTables().map(name)`) |
| `db:get-table-data`, `db:sample-query` | `Driver::get_table_data` / `Driver::sample_query`; same missing-capability error text |
| `db:switch-database/-warehouse/-role`, `db:set-schema` | optional `Connection` methods, v1 no-op/validation rules |
| `db:session:open/close/set-autocommit`, `db:txn:begin/commit/rollback` | `Connection` session/txn methods, v1 throw/no-op split |
| `db:cancel-query` | cancellation registry |
| `db:parse-plan` | `Connection::parse_query_plan` (default `[]`) |
| `db:driver-capabilities`, `db:connection-capabilities` | capability serialization / runtime overlay (null until a driver implements it) |
| `db:format-query` | formatter registry (owned by [`import-export.md`](./import-export.md) §formatters, dispatched from verql-ipc) |

## Parity cases (golden fixtures, both stacks — `../orchestration/verification.md`)

1. `db:driver-capabilities` for all six driver ids — byte-identical JSON
   (field presence/absence, `hasSampleQuery`/`hasGetTableData` booleans).
2. `db:connect` happy path + failure (bad password, dead host): resolved
   `{success:false,error}`, never a rejection; double-connect returns
   `{success:true}` without a second adapter.
3. `db:query` on a disconnected profile → rejection with the exact
   "Not connected — select a connection from the sidebar first" message.
4. `db:test-connection` success/failure shapes; temp connection provably
   closed (no lingering server session).
5. Session lifecycle on pg + sqlite: open → query (implicit BEGIN when
   `autoCommit:false`) → commit/rollback → close; `closeSession` rolls back
   an open txn; sqlite exclusive-txn error on a second concurrent txn.
6. Optional-method channels on drivers lacking them (`db:set-schema` on
   sqlite, `db:txn:begin` on mysql, `db:get-schema-objects` → `[]` on mysql)
   — silent success, not errors.
7. `db:sample-query`/`db:get-table-data` missing-capability error text;
   `db:connection-capabilities` → `null` for every current driver;
   `db:parse-plan` with non-plan rows → `[]`.

## Open questions

- **Structured-clone value types (Date/Buffer) over a JSON bridge** — exact
  wire rendering per driver is *measured from v1 goldens*, not decided here;
  each driver task (T-303…T-308) records the chosen encoding + allowlisted
  diffs in its Log.
- **Whether v2 wires `timeoutMs` from any caller** — contract keeps the arg;
  T-302 decides whether the frozen renderer path stays renderer-raced (default:
  yes, freeze discipline) and documents it in the channel burndown.
