---
title: "SDK: Getting Started"
description: A minimal, end-to-end Verql plugin built with @verql/plugin-sdk — scaffold, manifest, activate, build, and install a tiny exporter, then where to go next.
sidebar:
  order: 1
---

A minimal, end-to-end plugin using [`@verql/plugin-sdk`](/plugins/sdk/). We'll
build a tiny **exporter** (no special permissions needed), then point you at the
full surface catalogue in [`../plugins.md`](/plugins/).

> Prerequisites: Node ≥ 20 and a bundler/compiler that emits CommonJS or ESM
> JavaScript (Verql `require()`s your compiled `main`). This guide uses
> TypeScript + `tsup`, mirroring how the SDK itself is built.

## 1. Scaffold

```
my-verql-plugin/
├─ package.json
├─ plugin-manifest.json
├─ tsconfig.json
└─ src/
   └─ index.ts
```

```bash
npm install @verql/plugin-sdk
npm install -D tsup typescript
```

## 2. Declare the manifest

`plugin-manifest.json` tells Verql who you are and what you contribute. The
`name` must match `^[a-z0-9-]+$` and not collide with a bundled plugin.

```jsonc
{
  "name": "verql-plugin-md-export",
  "version": "1.0.0",
  "displayName": "Markdown Export",
  "description": "Export a result grid as a Markdown table.",
  "main": "dist/index.js",
  "permissions": [],
  "contributes": {
    "exporters": [
      { "id": "markdown", "name": "Markdown Table", "extension": "md" }
    ]
  }
}
```

`permissions` is empty here — an exporter only transforms data the host hands
it, so it needs none of the gated capabilities. The moment you reach for
`ctx.keyring`, `ctx.connections`, or `ctx.ipc`, declare the matching permission
and the user must grant it. See [`../plugin-security.md`](/plugins/security/).

## 3. Implement `activate`

`definePlugin` is a typed identity helper: it pins your `manifest`/`activate`
shape so a typo fails at compile time. Your `activate(ctx)` registers
contributions against the `PluginContext`; everything you register is
auto-disposed when the plugin is disabled.

```ts
import { definePlugin } from '@verql/plugin-sdk'
import type { PluginManifest } from '@verql/plugin-sdk'
import manifestJson from '../plugin-manifest.json'

const manifest = manifestJson as PluginManifest

export default definePlugin({
  manifest,
  activate(ctx) {
    // ctx.exporters.register(id, exporter) — id is namespaced to your plugin.
    ctx.exporters.register('markdown', {
      format: 'markdown',
      extension: 'md',
      displayName: 'Markdown Table',
      // `rows` and `columns` come from the active result grid.
      execute(rows, columns) {
        const header = `| ${columns.map((c) => c.name).join(' | ')} |`
        const sep = `| ${columns.map(() => '---').join(' | ')} |`
        const body = rows
          .map((r) => `| ${columns.map((c) => String(r[c.name] ?? '')).join(' | ')} |`)
          .join('\n')
        return `${header}\n${sep}\n${body}\n`
      },
    })
  },
})
```

> The exporter's exact shape is `RegisteredExporter` (`format`, `extension`,
> `displayName`, `execute`) and `ExporterFn` / `ExporterOptions` (all exported
> as types). Your editor will autocomplete the real fields — lean on the types
> rather than this sketch.

## 4. Build

```jsonc
// package.json (excerpt)
{
  "name": "verql-plugin-md-export",
  "version": "1.0.0",
  "main": "dist/index.js",
  "scripts": { "build": "tsup src/index.ts --format cjs --dts" }
}
```

```bash
npm run build
```

## 5. Install it locally

Copy the plugin folder (manifest + `dist/`) into Verql's plugin directory, or
use the in-app installer:

- **In-app:** Settings → Plugins → *Install*, then pick your folder or a `.zip`.
- **By hand:** drop the folder into `<userData>/plugins/<name>/`
  (`<userData>` is the app's data dir — see the user guide's
  [troubleshooting page](/guide/troubleshooting/)).

Verql validates the manifest, refuses symlinks, and (for a third-party plugin)
starts it with **no** sensitive capabilities until you grant them in the
plugin's **Permissions** tab. Your exporter needs none, so it'll show up in the
export menu immediately.

## When you need a sensitive capability

Drivers and AI providers usually do. Declare it and gate gracefully:

```jsonc
// plugin-manifest.json
{ "permissions": ["connections", "keyring"] }
```

```ts
import { PermissionDeniedError } from '@verql/plugin-sdk'

try {
  const id = ctx.connections.getActiveConnectionId()
  // …
} catch (err) {
  if (err instanceof PermissionDeniedError) {
    ctx.notifications.show({
      kind: 'warning',
      title: 'Grant “Database connections” to use this plugin',
    })
  }
}
```

## Next steps

- Every contribution surface (drivers, importers, formatters, type mappers,
  panels, commands, AI providers, tools, themes) and its exact API:
  [`../plugins.md`](/plugins/).
- The capability model, the trust boundary, and what Verql does/doesn't
  enforce: [`../plugin-security.md`](/plugins/security/).
- Architecture and the glue↔plugin ownership boundary:
  [`../architecture.md`](/develop/architecture/).
