# ADR-0002: Bundled plugins become Rust workspace crates — no Node/JS sidecar

- Status: proposed

## Context

v1's "orchestrator + plugins" architecture puts all domain logic (drivers,
formats, themes, AI, tools, SSH, notifications) in bundled **JS plugins**
loaded via `require()` into the Node main process. A Rust core cannot host
Node modules. Something has to give: the language of the internals, or the
single-runtime goal.

## Decision

Every bundled plugin is **rewritten as a Rust crate** in the
`src-tauri/crates/` workspace, registering into Rust registries (traits)
that mirror the v1 SDK surfaces one-to-one conceptually: `Driver`,
`Exporter`, `Importer`, `Formatter`, `TypeMapper`, `Theme`, `Tool`,
`Command`, `ConnectionMiddleware`, `AiProvider`, service locator. The
registry/contribution *architecture* survives; the plugin *runtime* (JS
loading, `activate(ctx)`, utilityProcess isolation) does not apply to
bundled code — crates are compiled in, trusted by construction.

Explicitly rejected: keeping a **Node sidecar** to run the existing bundled
JS. It would preserve ~7.6k LOC of plugin code at the cost of shipping Node
anyway (footprint goal dead), a second IPC hop on the hot query path, dual
error taxonomies, and a permanent "temporary" architecture. The user intent
is a Rust engine; a sidecar is the Electron main process wearing a hat.

Also rejected: porting logic into the core without registries ("it's all
Rust now, why the indirection"). The ownership boundary in `CLAUDE.md`
(glue never contains dialect/format/provider logic) is what keeps six
drivers honest and the renderer db-agnostic; it costs little in Rust
(trait objects in a map) and keeps the door open for ADR-0003.

## Consequences

- ~7.6k LOC of plugin TS + ~2.8k SDK TS is rewritten, not wrapped. The task
  graph sizes drivers as L tasks each with parity suites.
- Serializable capability descriptors (`errorRules`, `statementSyntax`,
  `nouns`, connection fields…) port as data — v1 already designed them for
  a process boundary, which transfers directly.
- The `db-tools`-is-essential rule, activation order concerns, degraded
  states, and the error budget disappear for bundled code (compile-time
  linkage replaces runtime lifecycle). The lifecycle machinery survives
  only for third-party plugins (ADR-0003).
- The published `@verql/plugin-sdk` (JS) has no v2 host — see ADR-0003.
