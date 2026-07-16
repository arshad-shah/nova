# Architecture Decision Records

Decisions the migration is built on. Status is one of `proposed`,
`accepted`, `amended`, `superseded`. **Phase 0 task T-001 walks the human
owner through ratifying every `proposed` ADR** — the swarm does not start
Phase 1 against unratified decisions.

Amendment process during the run: if execution reveals an ADR assumption is
wrong (a crate is unmaintained, a Tauri capability doesn't exist, a
platform behaves differently), the discovering agent logs it in its task,
the orchestrator drafts an amendment appended to the ADR (never rewriting
history), and — if the *decision* (not just a detail) changes — escalates
to the human per the playbook.

| ADR | Decision | Status |
|---|---|---|
| [0001](./ADR-0001-tauri-2.md) | Tauri 2.x is the target shell | proposed |
| [0002](./ADR-0002-rust-first-internals.md) | Bundled plugins become Rust workspace crates; no Node/JS sidecar | proposed |
| [0003](./ADR-0003-third-party-plugins.md) | v2 launches with declarative plugins only; programmatic SDK (WASM) post-launch | proposed — **requires explicit human sign-off** (compat break) |
| [0004](./ADR-0004-database-crates.md) | Driver crate selection, incl. Snowflake via SQL REST API | proposed |
| [0005](./ADR-0005-ipc-bridge.md) | Single dispatch command + `electronAPI`-shaped shim; TS contract stays authoritative | proposed |
| [0006](./ADR-0006-mcp-rust.md) | MCP server reimplemented in Rust (rmcp), SSE-compatible | proposed |
| [0007](./ADR-0007-secrets.md) | `keyring` crate for secrets; encrypted-file fallback retained; v1 secret migration | proposed |
| [0008](./ADR-0008-packaging-updater.md) | tauri-bundler packaging; per-platform update channels; MSIX risk owned early | proposed |
