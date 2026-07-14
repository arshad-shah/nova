# Dependabot security remediation — design

**Date:** 2026-07-10
**Branch:** `chore/dependency-audit-security` (off `main`)
**Status:** Approved

## Goal

Close all open Dependabot alerts (39 on GitHub; 35 in the app workspace per
`pnpm audit`, the difference being `site/` astro) via version bumps +
`pnpm.overrides`, with a build/test verification gate so a forced transitive
version can't silently break tooling.

This is the **security-first** track. The strategic **blast-radius reduction**
(drop / hand-roll / replace with `@arshad-shah` packages to minimize production
external deps) is a **separate spec** to be brainstormed next.

## Alert taxonomy (traced to source)

- **Dev tooling only, not shipped (~20 alerts):** `undici` (via
  node-gyp→@electron/rebuild→electron-builder), `vite`, `@vitest/browser`,
  `js-yaml`, `tmp`, `tar`, `@babel/core`, `esbuild` (dev), `ws`.
- **Docs site only (`site/`, separate Cloudflare deploy):** `astro`.
- **Production-shipped in the app (~17 alerts):** `dompurify` (direct dep +
  transitive via `monaco-editor`), `hono` (via
  `@modelcontextprotocol/sdk`→`@hono/node-server`), `form-data` (via
  `snowflake-sdk`→`axios`), `esbuild` (runtime).

## Fix table

| Package | Ships | Installed → Patched | Mechanism |
|---|---|---|---|
| dompurify | prod (direct + monaco) | 3.4.5 → ≥3.4.7 | bump `^3.4.7` + override |
| form-data | prod (snowflake→axios) | 4.0.5 → ≥4.0.6 | override |
| hono | prod (MCP SDK) | → ≥4.12.25 | override |
| vite | dev (direct) | 7.3.2 → ≥7.3.5 | bump |
| vitest / @vitest/browser | dev (direct family) | 4.1.6 → ≥4.1.8 | bump family (clears the critical) |
| esbuild | dev | 0.27.7 → ≥0.28.1 | override |
| tar / tmp / ws / @babel/core | dev | patch bumps | override |
| js-yaml | dev | old <3.15 copy → ≥3.15 | override — pin the vulnerable **3.x** consumer to a patched 3.x, NOT force 4.x |
| undici | dev (build tooling) | 6.25.0 → ≥7.28.0 | override (major) — behind build verification |
| astro | site only | → latest | bump in `site/package.json` |

## Two risk items (verified, not blind)

1. **undici 6→7 (major).** Dev-only build tooling. Apply override, then verify
   `pnpm postinstall` (electron-rebuild of better-sqlite3) and `pnpm build`
   succeed. If undici 7 breaks the rebuild: fall back to pinning the parent
   (`@electron/rebuild` / `electron-builder`) to a version that uses undici 7,
   or document undici as an accepted dev-only residual.
2. **js-yaml (breaking 3.x↔4.x).** Identify the consumer pulling the vulnerable
   <3.15 copy; pin it to a patched **3.x** (e.g. `>=3.15`). Do not force 4.x
   onto a 3.x-API consumer.

## Verification gate (definition of done)

1. `pnpm install` succeeds; `pnpm postinstall` rebuilds native modules cleanly.
2. `pnpm exec tsc -b --noEmit` — clean.
3. `pnpm build` (electron-vite production build) — succeeds.
4. `pnpm test` — failure set matches the known pre-existing baseline (45
   failures across the same 7 files: sqlite native-module + `stores/ai.ts`
   `loadConfiguredProviders`); **no new failures** attributable to this change.
5. `pnpm audit` — 0 remaining advisories (or only genuinely-unfixable ones,
   documented in the PR).
6. `site/`: `pnpm --dir site audit` / bump astro; site build succeeds.
7. Changeset added (`verql`: patch — a security/dependency change).

## Out of scope

- Dropping / hand-rolling / replacing any dependency (separate blast-radius
  spec).
- Functional or feature changes.
- Upgrading deps that have no open advisory.

## Execution

One cohesive change with an interactive install/build/test verify loop —
executed directly, not via parallel subagents.
