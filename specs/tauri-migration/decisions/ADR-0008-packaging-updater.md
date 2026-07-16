# ADR-0008: Packaging & updater — tauri-bundler, per-platform channels, MSIX risk owned early

- Status: proposed
- Verify-first: T-002 + the Phase-1 packaging spike validate current
  tauri-bundler target support (MSIX in particular)

## Context

v1 packaging (electron-builder): macOS dmg (+ Homebrew cask distribution),
Windows **appx/MSIX with a Microsoft Store identity** (identity block in
`package.json#build.appx`), Linux AppImage. v1 updater is custom and
registry-based — **not** electron-updater: first-available channel wins;
only the Homebrew channel is implemented (shells out to `brew`); planned
ids `mas|win-store|snap|apt|dmg-direct`. Progress streams over
`updater:progress`.

## Decision

1. **tauri-bundler** produces: macOS `.dmg`/`.app` (Homebrew cask keeps
   working — `scripts/render-homebrew.mjs` updates), Linux **AppImage**,
   Windows: **NSIS `.exe` as the guaranteed artifact**, with MSIX/Store as
   a tracked risk item — if tauri-bundler (or an msix packaging step over
   the built binaries) cannot produce a Store-acceptable MSIX with the
   existing identity, the fallback ladder is: (a) external MSIX packaging
   tooling wrapping the Tauri build, (b) Store listing via MSI/EXE where
   policy allows, (c) Store submission deferred at cutover with NSIS direct
   distribution — a **product decision escalated to the human**, never
   decided silently by the swarm.
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
