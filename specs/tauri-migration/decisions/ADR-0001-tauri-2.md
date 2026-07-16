# ADR-0001: Tauri 2.x is the target shell

- Status: proposed
- Deciders: repo owner + orchestrator
- Verify-first: T-002 re-validates every claim here against current releases

## Context

v1 ships Electron 39: bundled Chromium + a Node.js main process. The goals
(00-goals) demand a Rust engine, smaller footprint, and no JS internals.

## Decision

Target **Tauri 2.x** (stable since late 2024): tao/wry shell over the OS
WebView, Rust core process, capability-scoped IPC, first-party plugins for
dialog/opener/notification/os/updater/window-state/single-instance.

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
  heavy views, and WebKitGTK (Linux) is the weakest link to test first.
- Multi-window is not currently used (v1 = single BrowserWindow); the
  design keeps Tauri's multi-window door open but ports single-window.
- Tauri's capability/permission config (`tauri.conf.json` + capabilities
  files) becomes part of the security review surface — the shell no longer
  grants the webview arbitrary IPC by default, which is an upgrade over v1.
