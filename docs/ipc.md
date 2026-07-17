# IPC channels

All inter-process communication between the renderer and the main process
goes through a typed, centrally-registered set of channels declared in
[`shared/ipc.ts`](../shared/ipc.ts). There are two kinds:

| Kind | Direction | Constant | Usage |
|------|-----------|----------|-------|
| **Invoke** | renderer → main → renderer | `IPC_CHANNELS.X` | one-shot request / response, awaited Promise |
| **Event** | main → renderer (one-way) | `IPC_EVENTS.X` | broadcast push (streaming, lifecycle notifications) |

The renderer talks to both via the preload bridge:

```ts
import { IPC_CHANNELS, IPC_EVENTS } from '@shared/ipc'

// invoke (request / response)
const result = await window.electronAPI.invoke(IPC_CHANNELS.DB_QUERY, id, sql)

// subscribe (one-way push)
const off = window.electronAPI.on(IPC_EVENTS.AI_CHAT_EVENT, (event) => { … })
off() // unsubscribe
```

Never use a string literal at a call site. The CI test
`tests/unit/ipc-channels-coverage.test.ts` scans the source tree for
string-literal `invoke()` / `on()` calls and fails the build if it finds one
that isn't a known channel — and a forgotten constant is a clear regression
signal.

## The single-source model

Each channel is described in two complementary halves, both in `shared/ipc.ts`:

- **`IpcChannelShapes`** — an interface keyed by the channel's **constant name**
  (`DB_EXPLAIN_QUERY`) carrying its `args` tuple and `return` type.
- **`IPC_CHANNELS`** — the const object mapping that same constant name to its
  **wire string** (`'db:explain-query'`).

The wire string is written **exactly once** (in `IPC_CHANNELS`). The
renderer-/main-facing `IpcChannelMap` (keyed by wire string, the shape
`invoke`/`handle`/the preload bridge consume) is **derived** by joining the two
halves — so the channel name can never be duplicated or drift out of sync.
`IPC_CHANNELS` is declared `… as const satisfies Record<keyof IpcChannelShapes,
string>`, which forces its key set to match `IpcChannelShapes` exactly: a
missing or orphan entry is a compile error.

## Adding a new invoke channel

It's a two-step edit, **all in `shared/ipc.ts`**:

1. Add the channel's contract to `IpcChannelShapes`, keyed by its constant
   name. Be precise about the `args` tuple and the `return` type — these are
   what the renderer actually sees through `window.electronAPI.invoke()`.

   ```ts
   export interface IpcChannelShapes {
     // …
     DB_EXPLAIN_QUERY: {
       args: [profileId: string, sql: string]
       return: { plan: string; cost: number }
     }
   }
   ```

2. Add the matching constant + wire string to `IPC_CHANNELS`. Follow the
   existing `SCREAMING_SNAKE_CASE` convention; the section comment groups it
   under the right domain (`DB`, `PLUGINS`, `AI`, …).

   ```ts
   export const IPC_CHANNELS = {
     // …
     DB_EXPLAIN_QUERY: 'db:explain-query',
   } as const satisfies Record<keyof IpcChannelShapes, string>
   ```

   The `satisfies` clause makes TypeScript reject the build unless every
   `IpcChannelShapes` key has exactly one constant here (and vice versa) — so a
   forgotten or mistyped name is a compile-time error, not a runtime mystery.

3. Implement the handler. Pick the right file under `src/main/ipc/` based
   on the domain prefix:

   - `connections:*` → [`ipc/connections.ts`](../src/main/ipc/connections.ts)
   - `db:*` → [`ipc/db.ts`](../src/main/ipc/db.ts)
   - `export:*` / `import:*` → [`ipc/export-import.ts`](../src/main/ipc/export-import.ts)
   - `plugins:*` → [`ipc/plugins.ts`](../src/main/ipc/plugins.ts)
   - `settings:*` → [`ipc/settings.ts`](../src/main/ipc/settings.ts)
   - `dialog:*` → [`ipc/dialog.ts`](../src/main/ipc/dialog.ts)
   - `keyring:*` → [`ipc/keyring.ts`](../src/main/ipc/keyring.ts)
   - `mcp:*` → [`ipc/mcp.ts`](../src/main/ipc/mcp.ts)
   - `migration:*` → [`ipc/migration.ts`](../src/main/ipc/migration.ts)
   - `app:*` → [`ipc/app.ts`](../src/main/ipc/app.ts)
   - `appdata:*` → [`ipc/appdata.ts`](../src/main/ipc/appdata.ts)
   - `themes:*` → [`ipc/themes.ts`](../src/main/ipc/themes.ts)
   - `updater:*` → [`ipc/updater.ts`](../src/main/ipc/updater.ts)
   - `window:*` → [`ipc/window.ts`](../src/main/ipc/window.ts)
   - `activity:*` → registered inline in
     [`ipc-handlers.ts`](../src/main/ipc-handlers.ts) (no dedicated domain file)

   `ai:*` is the exception to this list: the AI assistant is a bundled
   *plugin* (`src/main/plugins/bundled/ai/`), so — per the ownership boundary
   above — it registers its own channels through `ctx.ipc.handle()` (the
   `PluginIpc.handle` method) from inside the plugin, not from a file under
   `src/main/ipc/`. It takes the same `(channel, handler)` pair as the core
   `handle` wrapper, but the two are not interchangeable: `PluginIpc.handle`
   returns a `Disposable` (dispose it to unregister — e.g. on plugin
   deactivation) and throws `PermissionDeniedError` unless the plugin was
   granted the `ipc` capability, whereas the core `handle` returns `void` and
   also traces every call into the activity stream (`ipc/context.ts`). If the
   domain you're adding belongs to a plugin rather than the core app, register
   it through `ctx.ipc.handle()`, not `handle`.

   The handler signature is inferred from `IpcChannelMap`:

   ```ts
   // src/main/ipc/db.ts
   import { IPC_CHANNELS } from '@shared/ipc'

   handle(IPC_CHANNELS.DB_EXPLAIN_QUERY, async (profileId, sql) => {
     const adapter = requireAdapter(profileId)
     const result = await adapter.query(`EXPLAIN ${sql}`)
     return { plan: formatPlan(result.rows), cost: 0 }
   })
   ```

   `handle` is the wrapper defined in [`ipc/context.ts`](../src/main/ipc/context.ts).
   It's typed by `IpcChannelMap` so the handler's `args` and `return` must
   match — if you forget a field or get a type wrong, the build fails.

4. Call it from the renderer:

   ```ts
   import { IPC_CHANNELS } from '@shared/ipc'

   const { plan } = await window.electronAPI.invoke(
     IPC_CHANNELS.DB_EXPLAIN_QUERY,
     profileId,
     sql
   )
   ```

No `preload/index.ts` change is needed: the generic `invoke<K>(channel, …args)`
signature already passes through any channel that's in the map.

## Adding a new broadcast event

Broadcasts go the other way: `main → renderer`. They don't return a value.
They follow the same single-source model as channels — payload tuple in
`IpcEventShapes` (keyed by constant name), wire string once in `IPC_EVENTS`,
and `IpcEventMap` derived from the two.

1. Add the event's payload tuple to `IpcEventShapes` in `shared/ipc.ts`,
   keyed by its constant name:

   ```ts
   export interface IpcEventShapes {
     // …
     DB_LONG_QUERY_PROGRESS: [payload: { profileId: string; pct: number }]
   }
   ```

2. Add the constant + wire string to `IPC_EVENTS`:

   ```ts
   export const IPC_EVENTS = {
     // …
     DB_LONG_QUERY_PROGRESS: 'db:long-query-progress'
   } as const satisfies Record<keyof IpcEventShapes, string>
   ```

3. Emit it from main. Inside a plugin use `ctx.broadcast(...)`; in orchestrator
   code use the typed `broadcast(IPC_EVENTS.X, payload)` helper from
   [`ipc/broadcast.ts`](../src/main/ipc/broadcast.ts) — never hand-roll a
   `BrowserWindow.getAllWindows()` loop (the helper is typed by `IpcEventMap`,
   so a wrong payload is a compile error).

4. Subscribe in the renderer:

   ```ts
   const off = window.electronAPI.on(IPC_EVENTS.DB_LONG_QUERY_PROGRESS, ({ profileId, pct }) => {
     // …
   })
   // off() to unsubscribe
   ```

## Guard rails

| Check | Where | What breaks if you skip a step |
|-------|-------|--------------------------------|
| Single-source key coverage | `IPC_CHANNELS` / `IPC_EVENTS` use `satisfies Record<keyof IpcChannelShapes, string>` | Constant without a shape (or shape without a constant) → build fail |
| Compile-time map coverage | `tests/unit/ipc-channels-coverage.test.ts` re-asserts the shape↔constant key sets match | Drift between the two halves → build fail |
| Call-site single-sourcing | `tests/unit/audit/ipc-channels-single-sourced.test.ts` scans **all** processes for a raw `'domain:action'` literal passed to `invoke`/`on`/`send`/`handle`/`h`/`broadcast`/`emit` | Hand-rolled wire string at any call site (renderer **or** main `handle`/`broadcast`) → test fail. Always pass `IPC_CHANNELS.X` / `IPC_EVENTS.X`, never the literal |
| Renderer typing | `window.electronAPI.invoke<K>()` | Wrong args / wrong return → build fail |
| Handler typing | `handle: Handle` in `ipc/context.ts` | Wrong args / wrong return → build fail |

## Picking a channel name

- Use `domain:verb-noun` (kebab-case after the colon). Multi-level
  domains use additional colons: `plugins:ui:get-contributions`.
- Pick the domain prefix that already exists rather than inventing a new
  one — it determines which file the handler goes in.
- Avoid abbreviations that hide intent. `db:explain-query` is better than
  `db:eq`.
