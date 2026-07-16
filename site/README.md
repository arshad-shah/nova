# Verql docs site

The documentation site for [Verql](https://github.com/arshad-shah/verql),
deployed at **[verql.arshadshah.com](https://verql.arshadshah.com)**.

Built with [Astro](https://astro.build) + [Starlight](https://starlight.astro.build).
It serves two audiences from one place:

- **User Guide** (`/guide/`) — for people using the app.
- **Developer Docs** (`/develop/`) and **Plugins & SDK** (`/plugins/`) — for
  people extending or contributing to Verql.

Page content is curated from the repository's [`docs/`](../docs/) and
[`docs/guide/`](../docs/guide/) folders into Starlight content collections under
`src/content/docs/`. When you change a subsystem doc in `docs/`, update its
counterpart here in the same change.

## Local development

This site is a **standalone package** — it is intentionally *not* part of the
root pnpm workspace (note the local `pnpm-workspace.yaml`), so installing it
never pulls in the Electron app's native modules.

Requires Node ≥ 20 and [pnpm](https://pnpm.io/) 10.

```bash
cd site
pnpm install     # installs only the site's deps (Astro, Starlight, mermaid, sharp)
pnpm dev         # http://localhost:4321
pnpm build       # static output to ./dist
pnpm preview     # preview the production build
```

## Mermaid diagrams

` ```mermaid ` fenced code blocks are rendered **client-side** (see
`src/plugins/remark-mermaid.mjs` and the `src/components/Footer.astro` override).
This keeps a headless browser (Playwright/Chromium, which build-time
`rehype-mermaid` would require) out of the toolchain. Diagrams re-render when the
light/dark theme is toggled.

## Branding

The brand palette follows the ribbon-V mark — **ribbon blue**
(`#25a2f8` / `#41c0ff`, with the mark's violet `#7c42fb → #4157e9` stroke) on
deep **midnight ink** (`#0b0f16` / `#0e121b`) with **frost** neutrals. See
`src/styles/theme.css`. Logos live in `src/assets/`
(copied from the app's `build/icon.svg` and `src/renderer/src/assets/brand/`).

## Deploying to Cloudflare Pages

The site builds to a fully static `dist/` directory — host it anywhere. For
Cloudflare Pages with the Git integration, use these settings:

| Setting | Value |
|---|---|
| **Production branch** | `main` |
| **Framework preset** | Astro (or *None*) |
| **Root directory** | `site` |
| **Build command** | `pnpm install --frozen-lockfile && pnpm build` |
| **Build output directory** | `dist` |
| **Environment variable** | `NODE_VERSION` = `22` |

The output directory is relative to the root directory, so the built site is at
`site/dist`. Cloudflare auto-detects pnpm from the committed `pnpm-lock.yaml`
and the `packageManager` field in `package.json`.

### Bundled Storybook (`/storybook`)

`pnpm build` here runs `astro build` and then `build:storybook`, which climbs to
the **repo root**, installs the app's deps (`pnpm install --frozen-lockfile
--ignore-scripts` — Storybook's browser bundle needs no Electron binary or
native modules, so the install scripts are skipped) and runs `storybook build`
straight into `site/dist/storybook`. The result ships in the same `dist/`, so
Cloudflare serves it at **`/storybook/`** with no extra config. It is **not**
linked from any nav and is excluded from the sitemap, so it's reachable only by
typing the URL; `public/_headers` marks `/storybook/*` `noindex` and relaxes
`X-Frame-Options` to `SAMEORIGIN` so Storybook's preview iframe renders. This
relies on Cloudflare checking out the whole repo (it does — "root directory"
only changes the working dir, not the checkout). No built Storybook assets are
committed to the repo.

After the first deploy, add the **custom domain** `verql.arshadshah.com` to the
Pages project (Cloudflare manages the DNS `CNAME` and TLS automatically).

### CLI deploy (optional)

To deploy from your machine with [Wrangler](https://developers.cloudflare.com/workers/wrangler/)
instead of the Git integration:

```bash
cd site
pnpm install
pnpm build
npx wrangler pages deploy dist --project-name verql
```
