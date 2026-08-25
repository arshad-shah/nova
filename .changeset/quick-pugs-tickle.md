---
"verql": patch
---

Fix the app hanging forever on the splash screen at launch.

The preload script — the only file that touches `ipcRenderer`, and the one that
publishes `window.electronAPI` — runs with `sandbox: true`, where `require`
resolves `electron` and a handful of shims and nothing else. Since 1.8.0 it
imported `randomUUID` from `node:crypto` to mint IPC trace ids, so it threw
`module not found` while loading and never reached
`contextBridge.exposeInMainWorld`. The renderer then came up with no bridge at
all: every IPC call rejected, the settings hydrate that dismisses the splash
never resolved, and the app sat on the splash screen indefinitely with nothing
anywhere explaining why.

Trace ids are now minted by a single `newTraceId()` in `shared/trace.ts` built
on the Web Crypto global (available in all three processes, with a fallback), and
the main-process trace context re-exports it rather than keeping a second
implementation.

Two changes make this class of failure visible instead of silent:

- **A failed boot is now shown, not swallowed.** The renderer's startup is split
  into a fatal phase (settings hydrate — nothing can render without it) and a
  best-effort phase (tab restore, diagnostics, onboarding — the app is already
  usable, so these degrade a feature rather than the window). A fatal failure is
  raised into the app's error boundary, which renders the message with a retry;
  it used to disappear into an unhandled rejection behind the splash.
- **The static boot splash can no longer get stuck.** It was dismissed only from
  a `requestAnimationFrame` callback, which Chromium does not run for an
  occluded or minimised window — leaving a full-window, drag-region overlay
  covering a perfectly healthy app. A timer now backs the animation frame up.

A new fitness function (`tests/unit/audit/preload-sandbox-safe.test.ts`) walks
the preload's entire static import graph — through `@shared/`, not just the entry
file — and fails the build on any Node builtin the sandbox cannot resolve,
naming the file, the line, and the import chain that pulled it in. Nothing
existing could have caught this: TypeScript resolves Node builtins fine, the
bundler externalises them happily, and the unit suite runs on Node where
`node:crypto` imports without complaint.
