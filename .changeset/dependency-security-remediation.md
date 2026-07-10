---
"verql": patch
---

Security: resolve all open Dependabot advisories. Bumped direct deps
(dompurify, vite, vitest) and refreshed the `pnpm-workspace.yaml` transitive
`overrides` to current patched versions — form-data, hono, dompurify, undici,
esbuild, tar, tmp, ws, @babel/core, js-yaml (both the 3.x consumer via
read-yaml-file and the 4.x line). The undici override is bounded to `^7.28.0`
so jsdom's test DOM environment keeps working. The docs `site/` gets astro
6.4.8 plus its own dompurify/esbuild overrides. App and site workspaces both
report zero known vulnerabilities; production build and the test baseline are
unchanged.
