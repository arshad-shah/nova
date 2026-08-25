# @verql/plugin-sdk

## 0.11.1

### Patch Changes

- [#224](https://github.com/arshad-shah/verql/pull/224) [`8962e8f`](https://github.com/arshad-shah/verql/commit/8962e8fd93607be68fc8ede5fa4797ce9316aaa7) Thanks [@arshad-shah](https://github.com/arshad-shah)! - Unify the two divergent SQL statement splitters into one shared walk ([#199](https://github.com/arshad-shah/verql/issues/199)). The
  SDK splitter (`string[]`) and the renderer gutter splitter (`Statement[]` with
  positions) were separate hand-written tokenisers that disagreed on statement
  boundaries — the SDK deleted comments and missed backticks, the renderer missed
  `''` doubling, and neither handled Postgres `$$…$$` bodies. They now share a
  single pure walk in `shared/sql/statement-splitter.ts` with two thin adapters,
  so "Run statement N" and the SQL importer/formatter always see the same text.
  Comments are now retained in emitted statements, dollar-quoted function bodies no
  longer split on their internal semicolons (gated on a new `supportsDollarQuoting`
  driver capability, set on Postgres), and a `statement-splitter-single-implementation`
  fitness function keeps a second tokeniser from reappearing.

## 0.11.0

### Minor Changes

- [#108](https://github.com/arshad-shah/verql/pull/108) [`3f57477`](https://github.com/arshad-shah/verql/commit/3f57477b20c86dc15f232b3061aea0797cf669e7) Thanks [@arshad-shah](https://github.com/arshad-shah)! - Add an optional `supportsSchema` flag to `RegisteredExporter`.

  Exporters that honour `options.includeSchema` (e.g. SQL exporters that can
  prepend a schema definition) can now declare `supportsSchema: true`. The host's
  Export dialog shows the "include schema" toggle only for formats that declare
  it, instead of hardcoding it to `sql`. Backward-compatible — the field is
  optional and defaults to off.

## 0.10.1

### Patch Changes

- First release published through the hardened CI pipeline: npm **trusted
  publishing** via OIDC (no long-lived token) behind a required-reviewer
  `npm-publish` environment, with an automatic provenance attestation. No API
  changes — validates the publish path and backfills the provenance that the
  manually-published `0.10.0` lacked. Also adds the package `README`.

## 0.10.0

### Minor Changes

- [#81](https://github.com/arshad-shah/verql/pull/81) [`3a2f890`](https://github.com/arshad-shah/verql/commit/3a2f8906bdd1051d219fa162d7c089df4eafe403) Thanks [@arshad-shah](https://github.com/arshad-shah)! - Move query-semantic error classification into the drivers (DB-boundary fix [#2](https://github.com/arshad-shah/verql/issues/2)).
  The renderer previously hardcoded PG/MySQL/SQLite error-message patterns in
  `lib/db-error.ts`. Now:

  - `DbErrorCode` + a serializable `DbErrorRule` live in `shared/db-errors`; an
    `errorRules` capability is added to the `@verql/plugin-sdk` `DriverFactory`
    (additive) and serialized into driver capabilities.
  - The postgresql/mysql/sqlite plugins declare their dialect's rules (bad
    column/table/schema, syntax, constraints, type mismatch, duplicate table,
    division-by-zero, deadlock, aborted txn).
  - `parseDbError(raw, dbType?)` applies the active driver's rules first (regex from
    the driver, friendly message from the renderer's i18n catalogue), then host
    rules for connection/auth/app-layer errors that span drivers. A new driver can
    contribute its own error classification by shipping `errorRules` — no host
    changes. Classification behaviour is unchanged (42-case characterization test).

- [#81](https://github.com/arshad-shah/verql/pull/81) [`3a2f890`](https://github.com/arshad-shah/verql/commit/3a2f8906bdd1051d219fa162d7c089df4eafe403) Thanks [@arshad-shah](https://github.com/arshad-shah)! - Move Postgres EXPLAIN plan parsing out of the renderer into the driver
  (DB-boundary fix [#1](https://github.com/arshad-shah/verql/issues/1)). The renderer previously hardcoded Postgres plan formats
  (`(cost=…)` text + `FORMAT JSON` keys). Now:

  - `PlanNode` lives in `shared/types`; `DbAdapter` gains an optional
    `parseQueryPlan(result)` (additive to the plugin-author surface).
  - The postgresql plugin owns the parsing; a new `db:parse-plan` IPC delegates to
    the active adapter and returns `[]` when a driver has no plan parser.
  - The renderer stores the parsed tree on the query tab and renders it
    generically; `lib/plan-parser.ts` is removed. Other drivers can now contribute
    plan parsing by implementing `parseQueryPlan`.

- [#81](https://github.com/arshad-shah/verql/pull/81) [`3a2f890`](https://github.com/arshad-shah/verql/commit/3a2f8906bdd1051d219fa162d7c089df4eafe403) Thanks [@arshad-shah](https://github.com/arshad-shah)! - Move statement-gutter dialect selection behind a driver capability (DB-boundary
  fix [#3](https://github.com/arshad-shah/verql/issues/3)). Drivers now declare a `statementSyntax` (`'sql'` / `'redis'` /
  `'mongodb'`) on their factory; the renderer's statement registry is keyed by that
  syntax and `StatementGutter` resolves it from the driver's capabilities, instead
  of a hardcoded db-type list in the renderer. A new SQL driver gets the
  "Run/Explain" gutter for free by declaring `statementSyntax: 'sql'`. Adds the
  optional `statementSyntax` field to the `@verql/plugin-sdk` `DriverFactory` type
  (additive). Behaviour for the bundled drivers is unchanged.

- [#81](https://github.com/arshad-shah/verql/pull/81) [`3a2f890`](https://github.com/arshad-shah/verql/commit/3a2f8906bdd1051d219fa162d7c089df4eafe403) Thanks [@arshad-shah](https://github.com/arshad-shah)! - Remove the host-only `serializeStaticCapabilities` helper from the published surface. It is an internal IPC serialization helper (used only by the host), not a plugin-author API, and was never exported from the in-repo SDK barrel. The `sdk-public-surface` test now also asserts against the published package (exact runtime export set + a host-only no-leak list), so internal↔published drift is caught going forward.
