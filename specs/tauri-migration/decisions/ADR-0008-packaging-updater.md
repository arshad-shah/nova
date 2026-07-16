# ADR-0008: Packaging & updater — tauri-bundler, per-platform channels, MSIX risk owned early

- Status: proposed
- Amended 2026-07-16 from ecosystem research ([versions-baseline.md](./versions-baseline.md));
  T-008 (the packaging spike) validates the amended ladder hands-on

## Context

v1 packaging (electron-builder): macOS dmg (+ Homebrew cask distribution),
Windows **appx/MSIX with a Microsoft Store identity** (identity block in
`package.json#build.appx`), Linux AppImage. v1 updater is custom and
registry-based — **not** electron-updater: first-available channel wins;
only the Homebrew channel is implemented (shells out to `brew`); planned
ids `mas|win-store|snap|apt|dmg-direct`. Progress streams over
`updater:progress`.

## Decision

1. **tauri-bundler** (2.9.x) produces: macOS `.dmg`/`.app` (Homebrew cask
   keeps working — `scripts/render-homebrew.mjs` updates), Linux
   **AppImage** (deb/rpm available cheaply if wanted later), Windows:
   **NSIS `-setup.exe` as the guaranteed artifact** (MSI/WiX as needed;
   pick a WebView2 install mode — `downloadBootstrapper` default, or
   `offlineInstaller` where the Store path demands it). **MSIX is still not
   natively supported by tauri-bundler** (upstream issues remain open), but
   the Store situation improved: Microsoft Store **officially supports
   EXE/MSI-linked listings** and Tauri documents that path (code-signed
   installer, silent-install flags, offline WebView2). Ladder, validated by
   T-008: (a) **EXE/MSI-linked Store listing** — the documented, supported
   path; (b) third-party MSIX packaging over the Tauri build
   (`@choochmeque/tauri-windows-bundle`) if a packaged-identity MSIX is
   required (watch the known WACK S-mode failure, tauri#14935); (c) Store
   submission deferred at cutover with NSIS direct distribution. Moving
   below (a) is a **product decision escalated to the human**, never
   decided silently by the swarm. Note (a)/(b) both require real code
   signing — which v1's appx/Store identity sidestepped — so the signing
   line in §3 becomes load-bearing for the Store path.
2. **The v1 updater architecture ports as-is** (`verql-updater`: registry,
   first-available channel, same `updater:*` IPC + progress phases).
   Homebrew channel ships in v2.0 (`std::process::Command` around `brew`).
   Store/apt/snap channels remain planned ids. `tauri-plugin-updater`
   (direct-download updates) slots in as the `dmg-direct`-analog channel
   **only if** signing infrastructure lands; it is not required for
   cutover (v1 shipped with Homebrew-only, parity permits the same).
3. Signing: macOS identity is currently `null` in v1 config (unsigned dev
   builds; Homebrew handles distribution). v2 matches v1's actual posture
   per platform; raising the signing bar is post-cutover work.

## Consequences

- App identifier changes from `com.electron.verql` — pick
  `com.arshadshah.verql` at scaffold time; the userData path moves, which
  is *why* `verql-migrate-v1` locates the old Electron paths explicitly
  per-platform.
- The Store-identity question is front-loaded (Phase 1 spike) because its
  worst case changes distribution strategy, and finding out at Phase 6
  would waste the schedule.
- CI gains per-platform bundle jobs; artifact size becomes a tracked gate
  metric (00-goals footprint win must be demonstrated, not asserted).
