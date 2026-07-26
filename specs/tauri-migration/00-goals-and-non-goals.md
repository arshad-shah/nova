# Goals and non-goals

## What this is

Verql v2 replaces the Electron shell and the Node.js main process with
**Tauri 2.x and a Rust backend**. The React renderer survives largely intact;
everything behind the IPC boundary — config, secrets, the database engine and
every driver, import/export, the plugin registries, the AI assistant loop,
the MCP server, activity logging, the updater — is rewritten in Rust. The
main engine runs in Rust. JavaScript remains only where it renders UI.

## Goals (in priority order)

1. **Behavioral parity.** A v1 user upgrading to v2 keeps their connections,
   settings, saved queries, query history, open tabs, conversations, and
   secrets, and observes the same behavior for every workflow: connect,
   query, introspect, export, import, chat, MCP. Parity is enforced by the
   golden-file harness (`orchestration/verification.md`), not by intention.
2. **Rust-first internals.** No Node.js runtime ships in v2. Bundled plugin
   logic (drivers, formats, themes, AI, tools, SSH tunnel, notifications)
   becomes Rust crates behind the same registry/contribution concepts.
3. **Keep the renderer investment.** ~43k LOC of React/Zustand/Monaco/AG Grid
   continues to work against a compatibility bridge that preserves the
   `shared/ipc.ts` channel contract (see `04-ipc-and-events-contract.md`).
4. **Footprint and performance win.** Smaller installers, lower idle RSS,
   faster cold start, and a main engine that never blocks the UI thread
   (fixing the known v1 SQLite-blocks-main-process limitation for free).
   Measured, not assumed — see the performance guardrails in
   `orchestration/verification.md`.
5. **A migration that a swarm can execute.** Every unit of work is a task
   file with checkable criteria; parallel worktrees; adversarial review;
   phase gates. The spec is written for machine execution with human
   escalation points.

## Non-goals (for this migration)

- **No renderer redesign.** No component rewrites, no state-management
  changes, no visual changes beyond what the shell swap forces (title bar
  mechanics). Renderer diffs are confined to the bridge seam and the
  explicitly listed hotspots in `subsystems/renderer-bridge.md`.
- **No feature work.** v2.0 ships v1.5's feature set. Feature ideas
  discovered during the port are logged as Notes, not implemented.
- **No third-party JS plugin compatibility at launch.** The v1
  `@verql/plugin-sdk` (JS, Node-hosted) cannot run without Node. v2 launches
  with all bundled capability native and **declarative** third-party plugins
  (themes, connection fields); a programmatic extension SDK returns
  post-launch per ADR-0003. This is the single deliberate compatibility
  break, and it requires human ratification before Phase 4.
- **No new database engines.** The six v1 drivers (SQLite, PostgreSQL,
  MySQL, MongoDB, Redis, Snowflake) — nothing else.
- **No protocol redesign of `shared/ipc.ts`.** Channel names, argument
  shapes, and event payloads are frozen at v1 for the duration of the
  migration; the contract is the parity anchor. Cleanups happen after
  cutover.
- **v1 stays shippable.** `main` remains the releasable Electron app until
  cutover. The migration lives entirely on `v2-tauri`; nothing in this
  effort may destabilize `main`.

## Success criteria for cutover

All of:

- every task in `tasks/` is `done` and the final phase gate is green;
- the full parity suite passes on all six drivers against the seeded test
  databases, including the error-parity cases;
- data migration from a real v1 install (config.json, credentials.enc,
  app.db) verified on macOS, Windows, and Linux;
- performance guardrails at-or-better vs the recorded v1 baseline;
- packaging produces installable artifacts for macOS (dmg + Homebrew cask),
  Windows (Store-acceptable package per ADR-0008), Linux (AppImage);
- the human owner has signed off on the ADR set and the cutover checklist
  (`tasks/` phase 6).
