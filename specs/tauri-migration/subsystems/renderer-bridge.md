# Renderer bridge — the `electronAPI` shim and the renderer hotspots

Ports the preload bridge and the renderer-side seams that touch it. Companion
to [`../04-ipc-and-events-contract.md`](../04-ipc-and-events-contract.md) and
[ADR-0005](../decisions/ADR-0005-ipc-bridge.md); the window/menu backend it
talks to is specified in [`window-shell-menus.md`](./window-shell-menus.md).
Tasks: T-104, T-107, T-109.

## v1 behavior contract

`src/preload/index.ts` (25 lines) exposes exactly three members as
`window.electronAPI` via `contextBridge.exposeInMainWorld`:

| Member | v1 semantics |
|---|---|
| `platform` | `process.platform` captured at preload time; **synchronously readable before first paint** |
| `invoke(channel, ...args)` | `ipcRenderer.invoke` — promise; typed off `IpcChannelMap` |
| `on(channel, cb)` | `ipcRenderer.on`; returns an unsubscribe that calls `removeListener` |

Consumers of the shape, all of which must keep working unmodified:

- `src/renderer/src/lib/platform.ts` — reads
  `window.electronAPI?.platform || 'web'` **at module-evaluation time** into
  module-level consts (`platform`, `isMac`, `isWindows`, `isLinux`).
- **12 unit-test files** stubbing `window.electronAPI` (e.g.
  `tests/unit/stores/connections-active-sync.test.ts` assigns
  `{ invoke: vi.fn(), on: () => () => {} }` in `beforeEach`); full list via
  `grep -l electronAPI tests/unit -r`.
- Storybook stub (`.storybook/preview.tsx`): assigns
  `{ invoke: async (channel) => channel === 'themes:list' ? STUB_THEMES : [], on: () => () => {} }`
  **only if `window.electronAPI` is absent**.
- 166 `invoke` call sites / ~20 `on` subscriptions (inventory §IPC boundary),
  many using optional chaining (`window.electronAPI?.invoke`).

## v2 design: `backend-bridge.ts`

Per ADR-0005, `src/renderer/src/lib/backend-bridge.ts` defines `BackendBridge`
(`platform`, `invoke`, `on`) with two implementations, and **assigns the
selected one to `window.electronAPI`**:

- **Electron impl**: pass-through to the real preload object (v1 keeps working
  from the same renderer source until cutover).
- **Tauri impl**: `invoke` → `invoke('ipc_dispatch', { channel, args })`;
  `on` → `listen(channel, e => cb(...e.payload))` returning the unlisten fn
  (note: Tauri's `listen` resolves the unlisten asynchronously — the shim wraps
  it so `on` stays synchronous and the returned function queues the unlisten);
  `platform` from `@tauri-apps/plugin-os`, **mapped to Node names**
  (`macos → darwin`, `windows → win32`, `linux → linux`) because the renderer
  compares against `NodeJS.Platform` strings (`lib/platform.ts`).
- Selection: feature-detect `'__TAURI_INTERNALS__' in window`; if neither host
  is detected, assign nothing — v1's "undefined outside Electron" contract is
  what the test/Storybook stubs and `?.` call sites rely on.

### Platform hydration before first paint

`lib/platform.ts` captures the platform when its module evaluates, and
`TitleBar`/`menu-model` branch on it during the first render. Therefore the
bridge must be installed **before the app module graph loads**, not merely
before `render()`: `src/renderer/src/main.tsx` becomes a two-stage bootstrap —
a tiny synchronous prologue that detects the host, installs the bridge
(resolving `platform` synchronously; the Tauri OS plugin API is sync in v2),
then dynamically imports the current entry body. No flash of wrong-platform UI
(macOS traffic-light inset rendered on Windows, or vice versa) is acceptable —
that is a parity case, not a nicety.

### `NOT_MIGRATED` error shape

Unported channels reject from `ipc_dispatch` with
`IpcError { code: "NOT_MIGRATED", message: "ipc: channel '<wire>' is not migrated", details: { channel } }`.
The shim converts every `IpcError` into a thrown `Error` whose `message` is the
wire message and which carries `code` (and `details`) as own properties — v1
handlers reject with plain `Error`s, so `message` is the only field existing
renderer code reads; `code` exists for the burndown grep and dev overlay, and
the literal string `NOT_MIGRATED` must appear in the message so failures are
identifiable in screenshots and logs (03-migration-strategy §principles).

## The file-drop port

`src/renderer/src/hooks/useFileDropForwarding.ts` today reads the
Electron-only `File.path` from `DragEvent.dataTransfer.files` and invokes
`IPC_CHANNELS.PLUGINS_DRAG_DROP` (`plugins:drag-drop`) once **per path**,
swallowing rejections (`.catch(() => {})`). WebViews expose no `File.path`.

v2: the hook keeps its DOM `dragover` handler (to `preventDefault` and keep
the webview from navigating) but sources paths from Tauri's drag-drop event —
`getCurrentWebview().onDragDropEvent()` (`type === 'drop'`, `payload.paths:
string[]`) with `dragDropEnabled` left at its default `true` in
`tauri.conf.json`. Behavior preserved exactly: one `plugins:drag-drop` invoke
per dropped path, order as delivered, errors swallowed, no renderer knowledge
of claimed extensions. Under Electron the v1 `File.path` branch remains; the
hook selects on the same feature-detect as the bridge.

## Edit-role reimplementation (`WINDOW_EDIT_ROLE`)

v1: `menu-model.tsx`'s `editRole(role)` invokes `window:edit-role`, which runs
Electron `webContents.undo()/redo()/cut()/copy()/paste()/selectAll()` on the
focused web contents (`src/main/ipc/window.ts`). Tauri has no equivalent —
this is the one place the renderer takes over backend behavior.

Exactly six menu actions call it (`menu-model.tsx` `menuActions` table):
`MENU_ACTION.UNDO`, `REDO`, `CUT`, `COPY`, `PASTE`, `SELECT_ALL`. On macOS the
**native** menu never round-trips these (they carry `nativeRole` in
`shared/menus.ts` and become OS roles / Tauri predefined items — see
[`window-shell-menus.md`](./window-shell-menus.md)); the reimplementation is
needed by the app-drawn bar on Windows/Linux and by any future macOS path that
bypasses the native menu.

v2 `editRole` becomes renderer-local. Dispatch: if the focused editor is a
registered Monaco instance (`editorRegistry.get()` and focus inside it), use
Monaco; otherwise fall back to the DOM path for `<input>`/`<textarea>`/
contentEditable:

| Role | Monaco path | DOM fallback | Notes |
|---|---|---|---|
| undo | `trigger('menu', 'undo')` | `document.execCommand('undo')` | execCommand is deprecated but functional in WebView2/WKWebView/WebKitGTK for editing commands |
| redo | `trigger('menu', 'redo')` | `document.execCommand('redo')` | |
| cut | `editor.action.clipboardCutAction` | `document.execCommand('cut')` | Monaco's clipboard actions use `navigator.clipboard` internally |
| copy | `editor.action.clipboardCopyAction` | `document.execCommand('copy')` | |
| paste | `navigator.clipboard.readText()` → `executeEdits` at selection | `navigator.clipboard.readText()` → insert at caret | `execCommand('paste')` is permission-blocked in all three WebViews; clipboard-read must be granted in the webview (Tauri exposes it; no user prompt in a trusted app window) |
| selectAll | `editor.action.selectAll` | `document.execCommand('selectAll')` | |

The `window:edit-role` channel itself stays in `shared/ipc.ts` (freeze
discipline) but the Tauri dispatch table pins it `NOT_MIGRATED` → recorded as
`wontport` at cutover alongside `window:menu:list`/`window:menu:popup`,
because the renderer stops calling it under Tauri.

## Parity cases

1. Bridge shape: `Object.keys(window.electronAPI)` = `platform`, `invoke`,
   `on` under both hosts; `on` returns a function; unsubscribe actually stops
   delivery (event fired after unsubscribe not observed).
2. `pnpm test` (all 12 stub files) and Storybook run green with zero test-file
   diffs; the Storybook stub still wins (bridge assigns nothing in a browser).
3. Platform hydration: first-paint DOM snapshot on each OS shows the correct
   title-bar variant (no post-paint flip).
4. `NOT_MIGRATED`: invoking an unported channel rejects with an `Error` whose
   message contains `NOT_MIGRATED` and the wire channel name.
5. File drop: dropping two files fires `plugins:drag-drop` twice with absolute
   paths (fixture: seeded `docker/testdb.sqlite` opens via the sqlite plugin's
   drag-drop claim, same as v1).
6. Edit roles: in a Monaco tab and in a plain `<input>`, each of the six
   commands driven from the Edit menu produces the same end state as v1
   (fixture script per role; paste case includes non-ASCII text).
7. Error-shape parity: a channel that rejects in v1 (e.g. `settings:set` with
   a forbidden key path) rejects through the shim with the identical `message`.

## Open questions

- Whether the Tauri `listen` async-unlisten wrapper needs a delivered-while-
  unsubscribing guard (v1 `removeListener` is synchronous). Resolve in T-104
  with a race test.
- Clipboard-read behavior in WebKitGTK when the window is unfocused (paste via
  accelerator during palette overlay). Resolve in T-107; fall back to
  `tauri-plugin-clipboard-manager` through a dispatch channel if
  `navigator.clipboard` proves unreliable there.
