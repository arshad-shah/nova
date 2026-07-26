# Subsystem specs

One deep specification per subsystem being ported — the detail layer under
`../02-target-architecture.md`. Each spec follows the same skeleton:
**v1 behavior contract** (what the Electron code observably does, with file
references) → **v2 design** (crate, types, approach) → **parity cases**
(what the golden fixtures must pin) → **open questions** (resolved by the
implementing task, logged in its file).

| Spec | Ports | Primary tasks |
|---|---|---|
| [`renderer-bridge.md`](./renderer-bridge.md) | preload bridge, platform seam, the 8 renderer hotspots | T-104, T-107, T-109 |
| [`window-shell-menus.md`](./window-shell-menus.md) | window creation, frameless/overlay title bars, controls, `shared/menus.ts` → native menu, accelerators | T-105, T-106, T-108 |
| [`config-store.md`](./config-store.md) | config.json store, settings pipeline, change broadcast | T-202, T-204 |
| [`keyring.md`](./keyring.md) | secret storage, profile-secret extraction, v1 secret migration | T-203, T-006 |
| [`appdata-store.md`](./appdata-store.md) | app.db (conversations, saved queries, history, open tabs) | T-205 |
| [`db-engine.md`](./db-engine.md) | Driver trait, registry, sessions/txns, cancellation, timeouts, capabilities, error taxonomy | T-301, T-302 |
| [`drivers.md`](./drivers.md) | all six drivers, per-engine parity surfaces | T-303..T-308 |
| [`ssh-tunnel.md`](./ssh-tunnel.md) | connection middleware, port-forwarding | T-309 |
| [`import-export.md`](./import-export.md) | export/import glue, formats, type-map/DDL | T-310, T-311, T-402 |
| [`plugin-system.md`](./plugin-system.md) | manifest/lifecycle/install/permissions, declarative plugins, registry traits | T-401, T-404..T-407 |
| [`ai-assistant.md`](./ai-assistant.md) | providers, conversation manager, permissions, app-actions | T-501..T-505 |
| [`mcp-server.md`](./mcp-server.md) | MCP transport, auth, tool gating, approvals | T-506, T-507 |
| [`activity-attention-notifications.md`](./activity-attention-notifications.md) | activity log/batcher, attention hub, os-notifications | T-206, T-207, T-508 |
| [`updater-packaging.md`](./updater-packaging.md) | updater registry/channels, bundling, data migration UX | T-601..T-605, T-209 |
