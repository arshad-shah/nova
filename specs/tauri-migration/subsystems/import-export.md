# import-export — export/import glue, formats, formatters, type-map/DDL

Ports `src/main/ipc/export-import.ts`, `src/main/ipc/dialog.ts`,
`src/main/ipc/migration.ts`, `src/main/migration/type-map.ts`, the
exporter/importer/formatter/type-mapper registries in
`src/main/plugins/sdk/`, the SDK helpers (`sql-format.ts`,
`csv-into-table.ts`, `sql-statements.ts`, `identifier.ts`), and the format
plugins (`bundled/core-formats/`, plus the sql/jsonl/json formats shipped by
the driver plugins). Target crates: registry traits in `verql-core`/`verql-db`
glue (T-311, Phase 3, formats may stub) and `verql-formats` (T-401 registry
traits, T-402 formats; type-map/DDL is T-310). Channels: `export:*` (3),
`import:*` (3), `migration:*` (2), `dialog:*` (2), plus `db:format-query`
(dispatch documented in [`db-engine.md`](./db-engine.md)).

## v1 behavior contract

### Registration shapes and resolution precedence

- **Exporter** (`sdk/exporter-registry.ts`): `register(id, { format,
  extension, displayName, appliesToTypes?, supportsSchema?, execute(rows,
  columns, options) → string | Buffer })`. Unique `id`, duplicate throws.
  `resolve(format, connectionType)` returns the **first insertion-order**
  entry matching `format` whose `appliesToTypes` is absent or includes the
  type — so dialect exporters (registered by driver plugins with
  `appliesToTypes: ['postgresql','postgres']` etc.) coexist with generic ones
  under the same `format`. `ExporterOptions = { tableName, schema?,
  connectionType, includeSchema? }`.
- **Importer** (`sdk/importer-registry.ts`): `register(id, { format,
  extensions[], displayName, appliesToTypes?, driverExecutes?, parse(content,
  options) })` → `ImporterResult { rows, columns?, executed?, errors? }`.
  `findByExtension(ext, connectionType)` lowercases/strips the dot and
  applies the same appliesTo filter.
- **Formatter** (`sdk/formatter-registry.ts`): `{ language, displayName,
  appliesToTypes?, format(source) }` — resolution: connection-type-specific
  match **wins over** the language-wide fallback; never crosses languages
  (a SQL fallback can't format a JSON editor). Must return input unchanged on
  parse failure.
- **Type mapper** (`sdk/type-mapper-registry.ts`): `register(from, to, table,
  fallback?)` — direction-keyed `{ table: Record<normalizedSource,
  { target, lossy, note? }>, fallback(normalized) }`; duplicate direction
  throws; `resolve` lowercases/trims the source and returns identity
  (`lossy: false`) when `from === to`.

v1 registrations to reproduce: core-formats — csv + json exporters, csv/tsv
importer, generic `sql` formatter fallback; each SQL driver — a `format:
'sql'` exporter/importer/formatter scoped to its type (sqlite/postgresql
(+`'postgres'` alias)/mysql/snowflake, `supportsSchema: true`,
`driverExecutes: true` importers); mongodb — `jsonl` + `json`
(json-array) exporters, `jsonl`/`ndjson` importer (`driverExecutes: true`),
`json` formatter; redis — `json` exporter (`redis/index.ts:186`). Type-map
tables: `PG_TO_SQLITE`/`MYSQL_TO_SQLITE`(+fallbacks) in sqlite,
`MYSQL_TO_PG`/`sqliteToPgFallback` in postgresql, `PG_TO_MYSQL` in mysql —
port the tables verbatim (`bundled/*/type-maps.ts`).

### Export flow (`ipc/export-import.ts`)

- `export:formats-list(profileId)` / `import:formats-list`: registry `list`
  filtered by the profile's type, **deduped by `format` — first registration
  wins**; returns `{ format, displayName, extension, supportsSchema }` /
  `{ …, extensions, driverExecutes }` (`shared/export-import.ts`).
- `export:table(profileId, tableName, format, options)`: resolve exporter by
  `(format, connectionType)`; rows come from the **driver's** `getTableData`
  (`readRowsForExport` — throws a named error when the driver lacks it);
  `exporter.execute(rows, columns, { tableName, schema, connectionType,
  includeSchema })`; then `dialog.showSaveDialog` with `defaultPath =
  safeFileName(tableName) + '.' + exporter.extension` (control/reserved chars
  → `_`, 200-char cap) and a single extension filter; cancel returns
  `{ cancelled: true }`; else `fs.writeFileSync(filePath, content)` →
  `{ filePath }`. Note the order: **content is generated before the dialog**.
- `export:query-result(rows, fields, format)`: resolves with
  `connectionType: ''` — so only exporters **without** `appliesToTypes` can
  match (generic csv/json; dialect SQL exporters are unreachable here — pin
  this). Columns synthesized from field names (`dataType: 'unknown'`);
  `tableName: 'query-result'`.

### Import flow

- `import:csv(profileId, tableName, columnMapping, onConflict)`: open-dialog
  filtered `csv,tsv` → `findByExtension('csv', type)` → `importer.parse`
  (core-formats: csv-parse with `columns: true, skip_empty_lines: true,
  trim: true`, **delimiter always `','`** — a `.tsv` file is accepted by
  extension but parsed with commas; v1 quirk, keep it). If
  `!importer.driverExecutes`: generic path `importCsvToTable`
  (`sdk/csv-into-table.ts`) builds one `INSERT INTO <qTable> (<cols>) VALUES
  (<placeholders>)` from the driver's contributed `quoteChar` +
  `placeholderStyle` (throws a named error if either is missing) and executes
  **row-by-row** through `adapter.query`, counting
  `{ inserted, skipped, errors[] }` — `onConflict: 'skip'` counts failures as
  skipped; `'error'` and `'update'` both push `Row N: <message>` (upsert is
  unimplemented; errors are surfaced, not silent). `driverExecutes` importers
  return `{ inserted: executed ?? rows.length, skipped: 0, errors }`.
- `import:sql(profileId)`: open-dialog `sql` → `findByExtension('sql', type)`
  → driver's `sqlImporter.parse`: `splitSqlStatements` (SDK tokenizer:
  single/double-quoted strings with doubled-quote escapes, `--` and `/* */`
  comments, split on `;`; **no** dollar-quoting or DELIMITER support) then
  `adapter.query` per statement, collecting `Statement N: <message>` errors;
  returns `{ executed, errors }`.
- `dialog:open-file` returns `{ filePath: basename(path), content }` (utf-8);
  `dialog:open-file-path` returns the full path; both `{ cancelled: true }`
  on cancel (`ipc/dialog.ts`).

### Format behaviors worth pinning (byte-stable goldens)

| Format | Behavior (source) |
|---|---|
| csv export | header row always; empty rows ⇒ `columns.join(',') + '\n'` only; null/undefined ⇒ empty cell; objects ⇒ `JSON.stringify`; other values `String()`; quoting/escaping = csv-stringify defaults (quote only when needed, `\n` records) (`core-formats/csv.ts`) |
| json export | `JSON.stringify(rows, null, 2)` — pretty, 2-space, array (`core-formats/json.ts`) |
| jsonl export | one `JSON.stringify(row)` per line, trailing `\n` iff non-empty (`mongodb/data-format.ts:46`) |
| json-array (mongo) / json (redis) | `JSON.stringify(rows, null, 2)` |
| sql export | optional `generateCreateTable` + `'\n'` when `includeSchema`; `-- No data in <table>\n` marker for empty tables; one single-row `INSERT INTO <qTable> (<cols>) VALUES (…);\n` per row — **no batching**; values via `formatSqlValue`: `NULL`, numbers/booleans unquoted (`TRUE`/`FALSE`), objects JSON-encoded then single-quoted, strings single-quoted with `''` doubling (`sdk/sql-format.ts`, `bundled/*/sql-format.ts`) |
| DDL (`generateCreateTable`) | `PRIMARY KEY` inline, `NOT NULL` for non-nullable non-PK, `DEFAULT <raw>` carried through; identifiers quoted with the driver's `quoteChar` via `quoteIdentifier` (control-char rejection, quote doubling, ≤255 chars) |
| sql formatting | `formatSql(sql, language)` = the `sql-formatter` npm package with dialect ids `postgresql/mysql/sqlite/snowflake/sql`; returns input unchanged on parse error |

### migration:* (`ipc/migration.ts`, `migration/type-map.ts`)

`migration:type-map(sourceType, from, to)` → registry `resolve`, falling back
to identity-with-`lossy: true` + note `No type mapper registered for
<from> → <to>`. `migration:generate-ddl(tableName, columns, from, to)` → map
every column type, then the **target driver's** `generateMigrationDdl`
(throws a named error when missing); returns `{ ddl, mappings }`.

## v2 design

- **Registries** (T-401): Rust traits mirroring the four shapes above, with
  insertion-order-preserving storage (`Vec` + id index, not `HashMap`
  iteration) — resolution precedence is observable behavior. Descriptors stay
  plain data; `execute`/`parse`/`format` become trait methods on registered
  objects from `verql-formats` and the driver crates.
- **`verql-formats`** (T-402): `csv` crate for parse/serialize (validate its
  quoting matches csv-stringify on the golden corpus — quote-only-when-needed,
  CRLF handling), `serde_json` for json/jsonl (2-space pretty print identical
  to `JSON.stringify(…, null, 2)`; key order via `preserve_order`). SQL
  value/DDL/insert helpers (`formatSqlValue`, `generateCreateTable`,
  `generateInsertStatements`, `splitSqlStatements`, `quoteIdentifier`,
  `renderPlaceholder`) port as pure functions with transliterated unit tests.
- **SQL pretty-printing**: `sqlformat-rs` *or* a port of the thin `formatSql`
  wrapper — implementer decides in T-402. Tradeoff: sqlformat-rs is cheap but
  won't match `sql-formatter` token-for-token; since `db:format-query` output
  is user-visible buffer content, byte-parity is *not* required (style diffs
  allowlisted per case) but idempotence and return-input-on-error are. If
  diffs prove disruptive, port sql-formatter's rules for the five dialect ids.
- **Glue** (T-311): `export:*`/`import:*`/`migration:*`/`dialog:*` handlers in
  `verql-ipc` with `tauri-plugin-dialog` for save/open (same
  `{ cancelled: true }` sentinels, same `safeFileName`, same
  generate-before-dialog order), `std::fs::write` for output. The
  `export:query-result` empty-connectionType resolution quirk is preserved.
  Row-by-row CSV insert stays row-by-row (its per-row error semantics are the
  contract; batching is a post-cutover Note).

## Parity cases

1. `export:table` per driver × csv/json/sql on a seeded table — byte-identical
   files (sql case with and without `includeSchema`).
2. csv edge corpus (comma/quote/newline values, null, nested object cell,
   header-only empty table); json/jsonl indent, key order, trailing-newline
   rule, empty-rows outputs (`[]` vs empty file).
3. sql export values: string with `'`, boolean, number, object cell, NULL;
   `-- No data` marker.
4. `export:formats-list`/`import:formats-list` per driver type — exact arrays
   incl. dedupe-by-format ordering; `export:query-result` with format `'sql'`
   → the v1 error (no matching exporter).
5. `import:csv` generic path on postgres (`$n`) and mysql (`?`): inserted/
   skipped/errors counts for each `onConflict` mode against a table with a
   unique constraint; missing quoteChar/placeholderStyle error text.
6. `import:sql` with a mixed script (comments, quoted `;`, one failing
   statement) → `{ executed, errors: ['Statement N: …'] }` parity; splitter
   corpus incl. the known non-support of dollar-quoting (pin current
   behavior).
7. `migration:type-map` full-table sweep for all six registered directions +
   fallback + identity + unregistered-direction note; `migration:generate-ddl`
   goldens incl. the SQLite `INTEGER PRIMARY KEY` special case.
8. `db:format-query`: resolution precedence (pg-specific over generic over
   none), cross-language isolation (json source on a sql connection),
   unparseable input returned unchanged with `changed: false`.

## Open questions

- **sqlformat-rs vs sql-formatter port** — T-402 prototypes both against a
  20-query corpus per dialect and records the decision + diff samples.
- **csv crate quoting parity** — if csv-stringify's exact quoting can't be
  reproduced by configuration, T-402 writes the serializer by hand (~30 lines
  for this feature set); hand-written is the default since exports are
  byte-pinned.
