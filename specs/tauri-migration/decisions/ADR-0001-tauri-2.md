# ADR-0001: Tauri 2.x is the target shell

- Status: proposed
- Deciders: repo owner + orchestrator
- Versions verified 2026-07-16 against [versions-baseline.md](./versions-baseline.md);
  T-002 re-checks that baseline for drift at execution time

## Context

v1 ships Electron 39: bundled Chromium + a Node.js main process. The goals
(00-goals) demand a Rust engine, smaller footprint, and no JS internals.

## Decision

Target **Tauri 2.x** — currently 2.11.5 (2026-07-01), MSRV 1.77.2: tao/wry
shell over the OS WebView, Rust core process, capability-scoped IPC,
first-party plugins for dialog/opener/notification/os/updater/window-state/
single-instance (versions in the baseline). **Tauri 3 is unreleased** (no
pre-release tags; its milestone exists mainly for the Linux GTK3→GTK4
migration) — do not wait for it, and expect the Linux layer to be the part
Tauri 3 later churns.

## Alternatives considered

- **Stay on Electron, move logic to a Rust node-addon or sidecar** — keeps
  Chromium + Node footprint, violates "no JS internals", two runtimes to
  babysit. Rejected.
- **wry/tao directly (no Tauri)** — maximal control, but we'd rebuild
  Tauri's IPC, bundler, updater, menu, and capability layer by hand.
  Rejected: the migration is large enough.
- **Flutter/egui/native rewrite** — discards the 43k-LOC renderer, violates
  goal 3. Rejected.

## Consequences

- The renderer runs on three different WebViews (WebView2/WKWebView/
  WebKitGTK) instead of one pinned Chromium. Monaco/AG Grid/xyflow are the
  compatibility risk surface; Phase 1 includes a WebView smoke pass of the
  heavy views, and WebKitGTK (Linux, `webkit2gtk-4.1`) is the weakest link
  to test first — heavy-DOM perf/stability complaints and NVIDIA/DMABUF
  blank-window issues are documented upstream (T-009 exists because of
  this; the experimental Servo/verso runtime is noted as a watch item, not
  an option).
- Multi-window is not currently used (v1 = single BrowserWindow); the
  design keeps Tauri's multi-window door open but ports single-window.
- Tauri's capability/permission config (`tauri.conf.json` + capabilities
  files) becomes part of the security review surface — the shell no longer
  grants the webview arbitrary IPC by default, which is an upgrade over v1.
