---
title: Writing Plugins
description: How to author a Verql plugin — the manifest, the activate function, every contribution surface, the boot lifecycle, and where bundled plugins live.
sidebar:
  order: 0
---

Verql's main process is an **orchestrator**. The actual database logic,
import/export formats, type translation, UI panels, AI tools, and
connection middleware all come from **plugins**. Adding a new database or
feature should not require editing the main app.

This document covers:

1. [What a plugin looks like](#what-a-plugin-looks-like) — the
   manifest + activate function
2. [Plugin types](#plugin-types) — the contribution surfaces (driver,
   exporter, importer, formatter, type mapper, theme, panel, command, …) with
   worked examples
3. [Lifecycle](#plugin-lifecycle) — how plugins are discovered, validated,
   resolved, activated
4. [Where things live](#repository-layout) — directory and naming
   conventions for bundled plugins

For adding a new IPC channel after the contribution surface is built, see
[IPC channels](/develop/ipc/).

## What a plugin looks like

A plugin is a directory with two files at minimum:

```
my-plugin/
├── manifest.json     # what the plugin contributes (declarative)
└── index.ts          # activate(ctx) function (runtime wiring)
```

The manifest is purely declarative — it tells the orchestrator *what* the
plugin will provide. The `activate(ctx)` function is invoked once at boot
and is where the plugin *registers* those contributions through the SDK.

### Manifest

```json
{
  "name": "verql-plugin-cassandra",
  "version": "1.0.0",
  "displayName": "Cassandra",
  "description": "Apache Cassandra driver",
  "main": "index.js",
  "contributes": {
    "drivers": [{ "id": "cassandra", "name": "Cassandra" }],
    "exporters": [{ "id": "cql", "name": "CQL", "extension": "cql" }],
    "importers": [{ "id": "cql", "name": "CQL", "extensions": ["cql"] }]
  }
}
```

The `contributes` block tells the orchestrator what to expect. After
activation the orchestrator verifies that everything declared here was
actually registered through the SDK — if a plugin promises a `cassandra`
driver and `activate()` doesn't register one, the plugin ends up in
`'degraded'` state with a clear error.

Manifest validation rules:

- `name` matches `^[a-z0-9-]+$` and is unique
- `version` is valid semver
- `main` ends in `.js`
- `displayName` and `description` are non-empty

These are enforced for **every** plugin, including the bundled ones in
this repo (since the audit; see `tests/unit/plugin-boot.test.ts`).

### activate(ctx)

The idiomatic shape uses `definePlugin` so the compiler pins every field
against the SDK's `PluginModule` type. Missing fields, mistyped
contributions, or a wrong `activate` signature fail at compile time
instead of waiting for the boot pipeline to report a runtime error.

**Export `manifest`/`activate`/`deactivate` as named exports, not a default
export.** The loader does `const mod = require(mainPath)` and then checks
`typeof mod.activate === 'function'` directly — there is no `.default`
interop. A plain `export default definePlugin({...})` compiles (with
esbuild/tsup/tsc CJS output) to `exports.default = {...}`, not
`exports.activate`, so the plugin fails validation with `'Missing activate()
export'`. Destructure the return value into named exports instead:

```ts
// my-plugin/index.ts
import { definePlugin } from '@verql/plugin-sdk'
import { CassandraAdapter } from './cassandra-adapter'

export const { manifest, activate, deactivate } = definePlugin({
  manifest: {
    name: 'verql-plugin-cassandra',
    version: '1.0.0',
    displayName: 'Cassandra',
    description: 'Apache Cassandra driver',
    main: 'index.js',
    contributes: {
      drivers: [{ id: 'cassandra', name: 'Cassandra' }],
    },
  },

  activate(ctx) {
    ctx.drivers.register('cassandra', {
      createAdapter: (config) => new CassandraAdapter(config),
      sqlDialect: 'cassandra',         // free-form label, never branched on
      quoteChar: '"',
      placeholderStyle: 'positional',  // 'positional' ⇒ ?  |  'numbered' ⇒ $1,$2
      editorLanguage: 'cql',
      defaultSchemaCandidates: ['system'],
      connectionFields: [
        { key: 'contactPoints', label: 'Contact Points', type: 'text', required: true },
        { key: 'keyspace', label: 'Keyspace', type: 'text', required: true },
        { key: 'username', label: 'Username', type: 'text' },
        { key: 'password', label: 'Password', type: 'password' },
      ],
      sampleQuery: async (table) => `SELECT * FROM ${table} LIMIT 100;`,
      getTableData: async (adapter, table) => {
        const result = await adapter.query(/* safely-escaped CQL */)
        return { rows: result.rows, columns: /* … */ [] }
      },
    })
  },

  // Optional. The SDK tears down subscriptions tracked through ctx.*
  // registries automatically. Use this hook only for things outside the
  // SDK (raw timers, sockets, child processes).
  deactivate() {},
})
```

`ctx` is a sandboxed view of the orchestrator. Everything a plugin can do
goes through one of its sub-registries:

| `ctx.X` | What it lets the plugin do |
|---------|----------------------------|
| `drivers` | Register a database driver (see [Driver](#1-driver)) |
| `drivers.registerConnectionMiddleware` | Pre-/post-connect hooks (e.g. SSH tunnel) |
| `commands` | Register a command palette entry |
| `tools` | Register an AI/MCP tool (shared by the AI chat and the MCP server) |
| `panels` | Legacy panel registration (`title`/`icon`/`location`/`render()`); prefer `ui.registerPanel` |
| `ui` | Register declarative widgets (panels, status-bar items, toolbar selectors, tabs, slots, resolvers) |
| `completions` | Contribute autocomplete items to the query editor |
| `exporters` | Register an export format (CSV, JSON, SQL DDL, …) |
| `importers` | Register an import format |
| `formatters` | Pretty-print the query buffer for a dialect |
| `typeMappers` | Translate column types between dialects |
| `ai` | Register an AI provider or a context provider (tool registration lives on `ctx.tools`) |
| `services` | Provide / consume named cross-plugin services |
| `settings` | Read & subscribe to plugin-scoped settings |
| `schema` | Read introspected schema for a connection |
| `connections` | Read active connection profile / run queries on it |
| `keyring` | Read/write secrets in the OS keyring |
| `ipc` | Own typed IPC channels (only if your plugin needs renderer↔plugin RPC outside the SDK) |
| `broadcast` | Push events to the renderer |
| `notifications` | Push an in-app toast notification (see [notifications & the attention seam](#13-desktop-notifications--the-attention-seam)) |
| `dragDrop` | Claim a file extension for drag-and-drop (e.g. a `.sqlite` file dropped onto the app) |

Disposable returns. Every `ctx.X.register(...)` returns a `Disposable` and
is automatically tracked under `ctx.subscriptions`. When the plugin is
deactivated, those subscriptions are disposed in LIFO order — so the
plugin doesn't have to manage cleanup explicitly.

## Plugin types

This section is the **menu** of contribution surfaces. Each shows the
manifest declaration, the `activate()` registration call, and where in
this repo to find a worked example.

### 1. Driver

A driver makes a new database type available. It must implement the
`DbAdapter` interface (`src/main/db/adapter.ts`).

**Manifest**

```json
"contributes": {
  "drivers": [{ "id": "cassandra", "name": "Cassandra" }]
}
```

**Activation**

```ts
ctx.drivers.register('cassandra', {
  createAdapter: (config) => new CassandraAdapter(config),
  // Field `type` is one of: 'text' | 'password' | 'number' | 'boolean' |
  // 'select' | 'file' | 'file-path'. `file` stores the selected file's
  // *contents* (e.g. an inline SSH key); `file-path` stores its native *path*
  // (e.g. a SQLite database file or a private-key file the adapter reads
  // itself). Add `accept: '.db,.sqlite'` to filter the picker / drag-drop.
  connectionFields: [...],

  // Free-form badge — never branched on. Use it for displayNames like
  // "SQL (Cassandra)".
  sqlDialect: 'cassandra',

  // Structural capabilities the generic helpers consume. `quoteChar` is the
  // identifier quote; `placeholderStyle` is the prepared-statement placeholder
  // style — 'numbered' ⇒ $1,$2 (Postgres); 'positional' ⇒ ? (MySQL/SQLite/
  // Snowflake). Both are plain serializable data (no functions) so the driver
  // descriptor can be process-isolated. The generic CSV → table importer
  // renders placeholders from the style via the SDK's `renderPlaceholder`.
  quoteChar: '"',
  placeholderStyle: 'positional',

  editorLanguage: 'cql',                // Monaco language id
  defaultSchemaCandidates: ['system'],  // renderer picks first match
  defaultSchemaUseConnectionDatabase: false,

  // Which built-in statement syntax the renderer uses for this driver. It keys
  // both the CodeLens "Run/Explain" gutter splitter AND the driver-aware
  // destructive-statement detection behind the "run anyway?" confirm (SQL →
  // DELETE/DROP/UPDATE-no-WHERE, Redis → FLUSHALL/DEL, Mongo → drop/deleteMany).
  // The renderer owns these (Monaco-coupled) contributions and selects one by
  // this id; there is no hardcoded db-type list. Omit to disable the gutter and
  // the destructive confirm for this driver.
  statementSyntax: 'sql',               // 'sql' | 'redis' | 'mongodb'

  // What this driver calls its data concepts, so the schema explorer labels
  // things in *your* terms instead of assuming SQL "table/column/row". The
  // renderer resolves these via `useDataNouns` and falls back to generic words
  // ("object/field/record") when a noun is omitted. Examples: SQL drivers use
  // table/column/row; Mongo collection/field/document; Redis key/field/entry.
  nouns: {
    object: { one: 'table', many: 'tables' },   // top-level container
    field:  { one: 'column', many: 'columns' }, // a field within an object
    record: { one: 'row', many: 'rows' },       // a single record
  },
  // Nouns drive every relational label the shell shows: the explorer's search
  // placeholder, group header, loading/empty states and row counts; the
  // context-menu / hover labels ("Copy {object} name", "Export {object}", "Copy
  // {field} name"); and the query-semantic error copy in `errors.ts` (a
  // not-found / duplicate / constraint error reads in the driver's terms). The
  // renderer resolves them in one place — `lib/data-nouns.ts` (`resolveDataNouns`
  // + `nounVars`), surfaced reactively via the `useDataNouns` hook.

  // Driver-owned error classification. Each rule's regex (matched
  // case-insensitively against the cleaned message; first capture group → the
  // message variable) maps to a DbErrorCode; the renderer owns the friendly
  // i18n message. Lets a new driver get column-not-found / syntax / constraint
  // messages without any host change. Host classifies connection/auth/app errors.
  errorRules: [
    { code: 'COLUMN_NOT_FOUND', pattern: 'Undefined column name ([^;]+)' },
    { code: 'SYNTAX_ERROR', pattern: 'line \\d+:\\d+ (no viable alternative.*)' },
    // …
  ],

  // REQUIRED for every driver — the orchestrator refuses to fabricate a
  // "SELECT * FROM table LIMIT 100" fallback. Async so an isolated driver can
  // answer over the RPC bridge.
  sampleQuery: async (table, schema) => `SELECT * FROM ${table} LIMIT 100;`,

  // Reads all rows for a table/collection/key-prefix. Use
  // `createRelationalGetTableData(quoteChar)` from the SDK if your driver speaks
  // plain SELECT. Powers both data export *and* the "View data" grid (the
  // `'table'` tab) over `db:get-table-data` — so a non-SQL driver (Redis
  // key/value, Mongo documents) gets a real browse grid the renderer can't build
  // from a SELECT. The renderer gates the "View data" action on
  // `hasGetTableData`, set automatically when this is present.
  getTableData: async (adapter, table, schema) => { ... },

  // Optional EXPLAIN capability. `statement` is the prefix the renderer prepends
  // *verbatim* to the query — the renderer never hardcodes an EXPLAIN dialect.
  // `format: 'tree'` ⇒ the renderer draws an ExplainNode tree; 'text' ⇒ raw plan
  // text. Omit the whole `explain` capability if the driver can't explain
  // (e.g. Redis, Mongo) — that hides the Explain action. Bundled values:
  // Postgres/MySQL `EXPLAIN ANALYZE`, SQLite `EXPLAIN QUERY PLAN`,
  // Snowflake `EXPLAIN`.
  explain: { supportsAnalyze: true, format: 'tree', statement: 'EXPLAIN ANALYZE' },

  // Used by the migration tool when this driver is the *target* of a
  // schema migration. Async; compose `generateCreateTable()` from the SDK or
  // hand-roll for dialect-specific quirks (e.g. SQLite's INTEGER
  // PRIMARY KEY rowid alias).
  generateMigrationDdl: async (tableName, columns) => /* DDL */
})
```

The SDK exposes the helpers you'll need for the common case:

```ts
import {
  quoteIdentifier,           // safe identifier escaping (takes quote char)
  formatSqlValue,            // value → SQL literal
  generateCreateTable,       // basic CREATE TABLE for a column list
  generateInsertStatements,  // single-row INSERTs
  splitSqlStatements,        // SQL file → statements
  createRelationalGetTableData,
  validateTheme,             // run-your-own-CI helper for themes
  REQUIRED_THEME_TOKENS,
} from '@verql/plugin-sdk'
```

Look at any of the bundled drivers for a full example:
[postgresql](https://github.com/arshad-shah/verql/blob/main/src/main/plugins/bundled/postgresql/index.ts),
[mysql](https://github.com/arshad-shah/verql/blob/main/src/main/plugins/bundled/mysql/index.ts),
[sqlite](https://github.com/arshad-shah/verql/blob/main/src/main/plugins/bundled/sqlite/index.ts),
[snowflake](https://github.com/arshad-shah/verql/blob/main/src/main/plugins/bundled/snowflake/index.ts),
[mongodb](https://github.com/arshad-shah/verql/blob/main/src/main/plugins/bundled/mongodb/index.ts),
[redis](https://github.com/arshad-shah/verql/blob/main/src/main/plugins/bundled/redis/index.ts).

Your **adapter** (returned by `createAdapter`) may also implement
`parseQueryPlan(result): PlanNode[]` — the renderer calls it over
`db:parse-plan` to render the Query Plan tab, so EXPLAIN-format parsing stays in
the driver. Return `[]` (or omit the method) if the rows aren't a plan.

The orchestrator never branches on driver type. If you need behaviour the
existing capability flags don't cover, **add a flag to `DriverFactory`**
(in `src/main/plugins/sdk/types.ts`) rather than adding a special case in
the main app or the renderer.

### 2. Exporter

Lets the user save table or query data in a new file format.

**Manifest**

```json
"contributes": {
  "exporters": [{ "id": "parquet", "name": "Parquet", "extension": "parquet" }]
}
```

**Activation**

```ts
ctx.exporters.register('parquet', {
  format: 'parquet',
  extension: 'parquet',
  displayName: 'Parquet',
  appliesToTypes: ['cassandra'], // optional
  supportsSchema: false,         // optional — see below
  execute(rows, columns, options) {
    return serializeParquet(rows, columns)  // string | Buffer
  }
})
```

The `appliesToTypes` array restricts the exporter to connections of the listed
types. Omit it for neutral formats (CSV, JSON, Parquet). It is a declarative
`string[]` (not a predicate function) so the contribution can be marshalled
across the process-isolation boundary — see
[plugin-security.md](/plugins/security/).

The Export dialog lists exactly the formats registered for the active
connection (resolved via `export:formats-list`), so it never offers a format the
driver can't produce — a MongoDB connection isn't shown SQL export, for example.
Set `supportsSchema: true` when your `execute` honours `options.includeSchema`
(the SQL exporters prepend a schema definition); the dialog then shows the
"include schema" toggle only for those formats instead of hardcoding it to
`sql`. Importers are surfaced the same way (`import:formats-list`), with
`driverExecutes: true` marking script importers (SQL) that run their own
statements rather than parsing a data file into a target object.

Worked examples:
[core-formats](https://github.com/arshad-shah/verql/blob/main/src/main/plugins/bundled/core-formats/index.ts) (CSV/JSON),
[postgresql/sql-format.ts](https://github.com/arshad-shah/verql/blob/main/src/main/plugins/bundled/postgresql/sql-format.ts),
[mongodb/data-format.ts](https://github.com/arshad-shah/verql/blob/main/src/main/plugins/bundled/mongodb/data-format.ts).

### 3. Importer

The mirror of an exporter — bring data in from a file.

**Manifest**

```json
"contributes": {
  "importers": [{ "id": "parquet", "name": "Parquet", "extensions": ["parquet"] }]
}
```

**Activation**

```ts
ctx.importers.register('parquet', {
  format: 'parquet',
  extensions: ['parquet'],
  displayName: 'Parquet',
  appliesToTypes: ['cassandra'],
  // When the importer drives execution itself (e.g. SQL scripts), set this:
  driverExecutes: false,
  parse(content, options) {
    return { rows: deserializeParquet(content), columns: ['id', 'name'] }
  }
})
```

If `driverExecutes` is `true`, the IPC layer calls `parse()` with
`options.adapter` set and skips the default bulk-insert pass — useful for
SQL scripts that need to be executed statement-by-statement.

### 4. Formatter

Pretty-print the query buffer. Formatters are keyed by **editor language** (your
driver's `editorLanguage` — `sql`, `json`, `plaintext`, …), so any database can
format its own query language, not just SQL. The main app only resolves and
invokes formatters (`db:format-query` glue, the editor's "Format Document", the
`format-editor` app action); the logic is yours.

**Manifest**

```json
"contributes": {
  "formatters": [{ "id": "sql", "name": "SQL (Cassandra)" }]
}
```

**Activation**

```ts
import { formatSql } from '../../sdk/sql-format'

ctx.formatters.register('sql', {
  language: 'sql',                          // the editor language this formats
  displayName: 'SQL (Cassandra)',
  appliesToTypes: ['cassandra'],            // omit for a language-wide fallback
  format: (sql) => formatSql(sql, 'sql'),   // or your own CQL formatter
})
```

**Resolution.** For a given (editor language, connection type), a formatter whose
`appliesToTypes` includes the connection type wins; otherwise a language-wide
fallback (no `appliesToTypes`) is used; otherwise nothing (a clean no-op).
Resolution never crosses languages, so a SQL fallback can't touch a JSON or
plaintext editor.

**Shared SDK helpers** (so bundled plugins don't duplicate logic):

- `formatSql(sql, dialect)` — `sql-formatter`-backed; pass your dialect
  (`'postgresql' | 'mysql' | 'sqlite' | 'snowflake' | 'sql'`). SQL drivers
  register a dialect formatter in one line; `core-formats` registers the
  language-wide `sql` fallback.
- `formatJson(source)` — pretty-prints JSON (MongoDB uses it for its `json`
  editor).

Both return the input unchanged on a parse error, so formatting never destroys
the buffer. A plugin with bespoke needs (e.g. Redis tidies its `plaintext`
command buffer) just provides its own `format(source)`.

### 5. Type mapper

Translate a column type from one dialect to another during migration.
Drivers register what they know about translating into / out of their
own dialect — the orchestrator has no hardcoded translation table.

**Activation**

```ts
ctx.typeMappers.register('postgresql', 'cassandra', {
  'integer': { target: 'int', lossy: false },
  'text': { target: 'text', lossy: false },
  'jsonb': { target: 'text', lossy: true, note: 'Stored as text' }
}, /* optional fallback */ (normalizedSource) => {
  return { target: 'text', lossy: true, note: 'Unmapped' }
})
```

`from` is the source dialect name (e.g. `'postgresql'`), `to` is the
target. The table looks up the lowercased source type. The fallback runs
when nothing in the table matches.

Worked examples (each ships its own `type-maps.ts`):
[postgresql](https://github.com/arshad-shah/verql/blob/main/src/main/plugins/bundled/postgresql/type-maps.ts),
[mysql](https://github.com/arshad-shah/verql/blob/main/src/main/plugins/bundled/mysql/type-maps.ts),
[sqlite](https://github.com/arshad-shah/verql/blob/main/src/main/plugins/bundled/sqlite/type-maps.ts).

### 6. Connection middleware

Wrap the connect/disconnect lifecycle for a particular configuration —
e.g. open an SSH tunnel before connecting and tear it down afterwards.

**Manifest**

```json
"contributes": {
  "connectionMiddleware": [{ "id": "ssh-tunnel" }],
  "connectionFields": [
    { "key": "sshHost", "label": "SSH Host", "type": "text", "group": "SSH Tunnel" },
    { "key": "sshUser", "label": "SSH User", "type": "text", "group": "SSH Tunnel" }
  ]
}
```

**Activation**

```ts
ctx.drivers.registerConnectionMiddleware('ssh-tunnel', {
  shouldApply(profile) { return !!profile.sshHost },
  async beforeConnect(profile) {
    const localPort = await openTunnel(profile)
    return { ...profile, host: '127.0.0.1', port: localPort }
  },
  async onDisconnect(profileId) { await closeTunnel(profileId) }
})
```

Worked example: [ssh-tunnel](https://github.com/arshad-shah/verql/blob/main/src/main/plugins/bundled/ssh-tunnel/index.ts).

### 7. Completion provider

Contribute autocomplete items (keywords, functions, table/column names)
to the Monaco editor for a particular connection.

**Activation**

```ts
ctx.completions.register(async (connectionId, context) => {
  const items: CompletionItem[] = []
  for (const kw of MY_DIALECT_KEYWORDS) {
    items.push({ label: kw, kind: 'keyword', sortText: '3' })
  }
  return items
})
```

Worked examples: every relational driver plugin contributes its own
completion provider. See [postgresql/index.ts](https://github.com/arshad-shah/verql/blob/main/src/main/plugins/bundled/postgresql/index.ts).

### 8. Theme

Themes are *raw token overrides*, layered on top of the design system's
semantic tokens. The registry validates each theme at registration time
against `REQUIRED_THEME_TOKENS`. A theme that's missing required tokens
is still loaded, but **the Appearance settings picker disables its
tile** so the user can't accidentally land on a half-painted UI.

**Manifest**

```json
"contributes": {
  "themes": [
    { "id": "solarized-dark", "name": "Solarized Dark", "type": "dark" }
  ]
}
```

`type` must be `'dark'` or `'light'` — the picker groups by it. The
manifest validator rejects any other value.

**Activation**

```ts
import { validateTheme, REQUIRED_THEME_TOKENS } from '@verql/plugin-sdk'

const myTheme = {
  id: 'solarized-dark',
  name: 'Solarized Dark',
  type: 'dark' as const,
  css: `
    [data-theme="solarized-dark"] {
      --color-bg-primary: #002b36;
      --color-bg-secondary: #073642;
      /* …every token in REQUIRED_THEME_TOKENS… */
    }
  `,
  preview: { bg: '#002b36', sidebar: '#073642', text: '#fdf6e3', accent: '#268bd2' },
}

// Validate in your own CI — fails fast with the exact list of missing
// tokens before the plugin even ships.
const report = validateTheme(myTheme)
if (!report.ok) throw new Error(`Missing: ${report.missingRequired.join(', ')}`)

ctx.themes.register(myTheme)
// Or strict-register so the registry throws if your tokens regress:
ctx.themes.register(myTheme, { strict: true })
```

**Required vs recommended tokens.** Missing one of `REQUIRED_THEME_TOKENS`
makes the theme unselectable. Missing one of `RECOMMENDED_THEME_TOKENS`
shows a warning badge but the theme stays selectable. The full lists
live in `src/main/plugins/sdk/theme-registry.ts`.

### 9. Panel (UI surface)

Add a panel into the primary or secondary sidebar, or the bottom dock.

**Manifest**

```json
"contributes": {
  "panels": [
    { "id": "cassandra-console", "title": "Cassandra", "icon": "terminal", "location": "secondary" }
  ]
}
```

`id`, `title`, `icon`, and `location` (`'sidebar' | 'secondary' | 'bottom'`)
are all required — the manifest validator rejects a panel contribution
missing any of them.

**Activation**

The idiomatic path is `ctx.ui.registerPanel(id, widgets)`: compose the
panel's contents out of declarative widgets (`selector`, `action-button`,
`status-indicator`, `text`, `tree`, `list`, `section`, `separator`), or drop
in a `host-component` widget when the panel needs a full custom UI the host
already knows how to mount (this is how the bundled AI plugin registers its
chat sidebar — `componentId` names a component the renderer's shell maps to a
real React component; it isn't an arbitrary path a plugin supplies).

```ts
ctx.ui.registerPanel('cassandra-console', [
  { id: 'cassandra-console-root', type: 'host-component', componentId: 'cassandra-console-panel' }
])
```

The SDK also carries a lower-level `ctx.panels.register(id, panel)` — a
`PanelContribution` shaped `{ title, icon, location, render(): string }` — but
no bundled plugin uses it; `ctx.ui.registerPanel` is the path every real panel
takes. `ctx.ui` also has `registerStatusBar` / `registerToolbar` /
`registerTab` / `registerSlot` / `registerResolver` for widgets that live
outside a dedicated panel — e.g. a toolbar of selectors, or a widget dropped
into a host-defined slot. See [snowflake/index.ts](https://github.com/arshad-shah/verql/blob/main/src/main/plugins/bundled/snowflake/index.ts)
for a toolbar of role/warehouse selectors driven entirely through declarative
UI, and [ai/index.ts](https://github.com/arshad-shah/verql/blob/main/src/main/plugins/bundled/ai/index.ts)
for the `ai-chat` panel plus several slot contributions.

### 10. Command

Register a command palette entry.

**Manifest**

```json
"contributes": {
  "commands": [{ "id": "format-sql", "title": "Format SQL", "keybinding": "Cmd+Shift+F" }]
}
```

**Activation**

```ts
ctx.commands.register('format-sql', async () => {
  /* implementation */
})
```

The orchestrator prepends the plugin name to the command id, so the
palette ends up running `verql-plugin-foo:format-sql`.

### 11. AI provider / tool

Plugins can register additional AI providers (alongside OpenAI, Anthropic,
Ollama) or new tools — shared by the AI chat and the MCP server — alongside
the built-in ones (`query`, `list_tables`, `describe_table`, `get_schemas`,
`connection_info`, `explain_query`, `get_app_activity`, all registered by the
bundled `db-tools` plugin, plus `perform_app_action` from the `ai` plugin).

**Activation**

```ts
ctx.ai.registerProvider({
  id: 'mistral',
  name: 'Mistral',
  supportsToolCalling: true,
  async models() { … },
  async *chat(request) { … }
})

// Tools are registered on ctx.tools, not ctx.ai — the same registry the
// MCP server reads from, so a tool registered once shows up in both.
import { toJsonSchema } from '@verql/plugin-sdk'
import { z } from 'zod'

ctx.tools.register({
  id: 'count_rows',
  name: 'Count Rows',
  description: 'Count rows in a table',
  inputSchema: toJsonSchema(z.object({ table: z.string() })),
  permission: 'read',
  async execute(params, ctx) { … }
})
```

Set `surfaces: ['ai']` on a tool that only makes sense from the in-app chat
(e.g. one that opens a UI panel) to keep it out of the headless MCP server;
omit `surfaces` to expose it to both.

The MongoDB and Redis bundled plugins both register an AI **context
provider** (`ctx.ai.registerContextProvider`) so Claude knows how to format
queries for those connections.

### 12. Setting

A plugin can declare settings that appear in the app's Settings panel
under any category it likes.

**Manifest**

```json
"contributes": {
  "settings": [
    {
      "key": "queryTimeoutMs",
      "title": "Query timeout (ms)",
      "type": "number",
      "default": 30000,
      "category": "connections"
    }
  ]
}
```

`category` is optional (it defaults to `'plugin'`, showing only in the
plugin's own detail panel); when set, it must be one of the core category
ids the host knows about — `'general' | 'appearance' | 'editor' |
'connections' | 'data-display' | 'keybindings' | 'ai' | 'mcp' | 'plugin'` —
and the setting then also surfaces in that core Settings category.

Settings are scoped per-plugin (`plugins.<name>.queryTimeoutMs`) and
accessed via `ctx.settings.get('queryTimeoutMs')`.

### 13. Desktop notifications & the attention seam

Two related mechanisms let a plugin reach the user *outside* the window — the
in-app notification bus (a toast), and native OS notifications.

**In-app toast** — `ctx.notifications.show({ kind, title, message })` pushes a
transient toast (and records an activity-log entry). Use it for soft, in-window
feedback.

**Native OS notification** — owned by the bundled `os-notifications` plugin,
which publishes an `os-notifications` **service**. Any plugin can consume it:

```ts
import type { OsNotificationService } from '../os-notifications'

const notifier = ctx.services.consume<OsNotificationService>('os-notifications')
notifier?.notify({
  title: 'Export finished',
  body: 'orders.csv is ready',
  category: 'completion',           // 'approval' | 'alert' | 'completion' | 'info'
  onClick: () => { /* runs in main; defaults to focusing the window */ },
})
```

The plugin owns *policy* — a master toggle, an "only when Verql isn't focused"
guard, and a per-category approval toggle (all in its settings) — so consumers
just describe *what* to say, never *whether* to say it.

**The attention seam.** Approval prompts (an AI write tool, an MCP query
authorization) are surfaced automatically: the host owns a delivery-agnostic
`attention` service (`src/main/attention/`) that producers publish to —
`hub.request({ id, kind: 'approval', title, body })` when a prompt is raised and
`hub.resolve(id)` when it's answered — and `os-notifications` subscribes and
turns those into notifications (dismissing them when resolved). Wire a new
approval flow into the seam rather than calling `os-notifications` directly, so
the *what-needs-attention* signal stays decoupled from *how it's surfaced* and a
future plugin (window flash, dock badge, phone push) can consume the same
events.

For the full picture — system context, sequence flows, the dispatcher decision
tree, lifecycle, and the class/data models, all as diagrams — see
[notifications.md](/develop/notifications/).

## Plugin lifecycle

The boot coordinator runs every plugin through a five-phase pipeline.

| Phase | What happens | Failure mode |
|-------|-------------|--------------|
| **Discover** | Scan plugin directories, read manifests, register bundled plugins | `'error'`, phase `discover` |
| **Validate** | Run `validateManifest()` — name, version, main, contributes | `'error'`, phase `validate` |
| **Resolve** | Hold for dependency resolution (currently a passthrough) | `'error'`, phase `resolve` |
| **Activate** | Call `module.activate(ctx)` with a 10s timeout | `'error'`, phase `activate` |
| **Verify** | Compare actual registrations against manifest's `contributes` | `'degraded'` (kept running with whatever it did register) |

After verification each plugin is in one of these states:

- `'active'` — everything declared in the manifest was registered
- `'degraded'` — some contributions are missing; the rest still work
- `'error'` — the phase listed in `error.phase` failed
- `'inactive'` — user-disabled

Activation errors are caught by `safeCall()` (10s timeout) so a stuck
plugin cannot wedge the boot. An `ErrorBudget` opens / closes around
each plugin and auto-disables one that throws repeatedly at runtime
(default: 5 errors in a 60s window).

## Repository layout

Bundled plugins live under `src/main/plugins/bundled/`. The naming
convention is:

```
src/main/plugins/bundled/<plugin-id>/
├── index.ts         # manifest export + activate()
├── *-adapter.ts     # DbAdapter implementation (for driver plugins)
├── sql-format.ts    # exporter/importer (for SQL drivers)
├── data-format.ts   # exporter/importer (for non-SQL drivers)
└── type-maps.ts     # type translation tables (for SQL drivers)
```

To **add a new bundled plugin**:

1. Create the directory under `src/main/plugins/bundled/<your-id>/`.
2. Export `manifest` and `activate` from `index.ts`.
3. Add it to the bundled-plugin list in
   [`src/main/plugins/bundled/index.ts`](https://github.com/arshad-shah/verql/blob/main/src/main/plugins/bundled/index.ts).
   The orchestrator iterates that list — it doesn't know individual driver
   names. Order matters when one plugin consumes another's `service`:
   register producers first (the AI plugin is registered first because
   mongo/redis plugins consume its `ai` service at activate time).
4. Write tests under `tests/unit/`. The pattern is in
   `tests/unit/bundled-plugins.test.ts` (single plugin) and
   `tests/unit/export-import-plugin-driven.test.ts` (cross-plugin).

The architecture test in `tests/unit/audit/main-orchestrator-purity.test.ts`
will refuse to merge if any file under `src/main/` outside `plugins/`
references your driver by name. Keep dialect knowledge inside the plugin.

To **add an external plugin** (third-party, installed by the user at
runtime), package the directory as a zip and use the Plugins panel inside
Verql → Install from Zip. The same `manifest.json` + compiled `index.js`
applies.

## When to add a new contribution surface

If you find yourself reaching for `process.platform === 'darwin'`,
`profile.type === 'postgresql'`, or similar branching inside the main app
or the renderer — **stop**. That's a sign you should be adding a new
`DriverFactory` flag (data-driven, like `defaultSchemaCandidates`) or a
new registry on `PluginContext`. The orchestrator stays generic; the
plugin owns the knowledge.

There's a regression test (`tests/unit/export-import-no-hardcoding.test.ts`)
that fails the build if anyone reintroduces this pattern in the
core IPC handlers or renderer hot paths.
