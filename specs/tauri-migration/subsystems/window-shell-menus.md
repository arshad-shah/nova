# Window shell & menus — frameless window, title bar, `shared/menus.ts` pipeline

Ports window creation, the custom title bar's backing channels, and the
declarative menu tree. Renderer-side seams are in
[`renderer-bridge.md`](./renderer-bridge.md); contract rules in
[`../04-ipc-and-events-contract.md`](../04-ipc-and-events-contract.md).
Tasks: T-105, T-106, T-108.

## v1 behavior contract

### Window creation (`src/main/index.ts` `createWindow`)

One `BrowserWindow`: `1400×900`, min `800×600`, `backgroundColor: '#0d0d1a'`,
title `Verql` (`Verql — Dev` when `!app.isPackaged`), icon resolved from
`build/icon.png` at runtime in dev. Per-platform frame stripping:

| Platform | v1 options | Controls |
|---|---|---|
| macOS | `titleBarStyle: 'hiddenInset'`, `trafficLightPosition: { x: TRAFFIC_LIGHT_X (15), y: trafficLightY(45) }` | native traffic lights overlaid on the app bar |
| Windows | `titleBarStyle: 'hidden'` | app-drawn (`WindowControls.tsx`) — WCO deliberately avoided (button height can't match the bar under display scaling; comment in `index.ts`) |
| Linux | `frame: false` | app-drawn (`WindowControls.tsx`) |

Note a stale docstring: `WindowControls.tsx` claims "only rendered on Linux",
but `TitleBar.tsx` renders `{!isMac && <WindowControls />}` — Windows and
Linux both draw app controls; `index.ts`'s comment is authoritative. The
`env(titlebar-area-*)` fallbacks in `TitleBar.tsx` resolve to nothing without
WCO — harmless, keep as-is.

Traffic-light repositioning: the bar height follows UI density, so
`TitleBar.tsx` measures itself (ResizeObserver, border-box) and reports over
`WINDOW_SET_TITLEBAR_HEIGHT`; the handler (`src/main/ipc/window.ts`) calls
`win.setWindowButtonPosition({ x: 15, y: trafficLightY(height) })`, where
`trafficLightY(h) = max(0, round((h − 12) / 2))` (macOS only, no-op elsewhere;
rejects non-finite/≤0 heights).

Maximize sync: `win.on('maximize'/'unmaximize')` emits
`window:maximize-changed` with `win.isMaximized()` — covering OS-driven
changes (snap, double-click drag region), which `WindowControls.tsx` relies on.

Security guards: `setWindowOpenHandler(() => ({ action: 'deny' }))`;
`will-navigate` allows only the dev-server origin (dev) or `file://` (prod).

### The 12 `window:*` channels (`src/main/ipc/window.ts`)

All act on the **requesting** window (`BrowserWindow.fromWebContents`).

| Channel | v1 behavior | v2 mapping (tauri `WebviewWindow`) |
|---|---|---|
| `window:minimize` | `minimize()` | `minimize()` |
| `window:toggle-maximize` | toggle; **returns resulting `isMaximized()`** | `if is_maximized { unmaximize } else { maximize }`; return `is_maximized()` |
| `window:close` | `close()` | `close()` |
| `window:is-maximized` | `isMaximized() ?? false` | `is_maximized()` |
| `window:menu:list` | top-level submenu items | **wontport** (zero renderer call sites; 04 §freeze) |
| `window:menu:popup` | pops native submenu at coords | **wontport** |
| `window:edit-role` | `webContents.undo/redo/cut/copy/paste/selectAll` | renderer-local reimplementation; Rust stub stays `NOT_MIGRATED` → wontport ([renderer-bridge.md](./renderer-bridge.md)) |
| `window:toggle-fullscreen` | toggle; returns new state | `set_fullscreen(!is_fullscreen())`; return new state |
| `window:set-titlebar-height` | macOS traffic-light re-center (formula above) | macOS-only: **`trafficLightPosition` is a first-class Tauri window config since 2.4.0** (requires `titleBarStyle: "Overlay"` + `decorations: true`) — no private-API workaround. First-paint position from `tauri.conf.json`; runtime re-center applies the same `x=15` / `trafficLightY` formula through the positioning mechanism the pinned 2.x minor exposes (T-105 verifies) |
| `window:reload` | `webContents.reload()` | `webview.eval("location.reload()")` (or native reload if exposed by the pinned Tauri minor) |
| `window:toggle-devtools` | `toggleDevTools()` | `open_devtools()`/`close_devtools()` via `is_devtools_open()`; `devtools` cargo feature gated to dev builds like v1's `devOnly` menu gate |
| `window:open-external` | scheme-guarded (`^https?:\/\//i`), WSL special case below | **`tauri-plugin-opener`** (Tauri split `shell.open` into the opener plugin; the shell plugin is only needed for child processes/sidecars, which we don't use), same guard **kept in the Rust handler** |

WSL case: v1 detects `IS_WSL` (`platform === 'linux' &&
/microsoft/i.test(os.release())`) and routes through
`execFile('cmd.exe', ['/c', 'start', '', url])` — no shell, URL as a single
literal arg — falling back to `shell.openExternal` on error. v2 replicates:
same release-string detection, `std::process::Command` with identical argv,
fallback to the opener plugin.

Event: `window:maximize-changed` ← `on_window_event(WindowEvent::Resized)`
querying `is_maximized()` and emitting only on transitions (dedup so resize
storms don't spam; v1 emits only on actual maximize/unmaximize).

### Drag regions

v1 uses `-webkit-app-region` (Chromium-only), in exactly three places:

- `src/renderer/src/styles/globals.css:185-186` — `.drag-region { -webkit-app-region: drag }` / `.no-drag { -webkit-app-region: no-drag }`
- `src/renderer/index.html:26` — `#boot-splash { -webkit-app-region: drag }`
- Class usage: `TitleBar.tsx` root (`drag-region`); `no-drag` on
  `WindowControls.tsx` (container + buttons) and `MenuBar.tsx` (menubar row)

v2 uses `data-tauri-drag-region` (requires the
`core:window:allow-start-dragging` capability). Its semantics differ usefully:
it only drags when the mousedown target **is the attributed element itself**,
so child interactivity (menu buttons, window controls) is excluded
automatically — the `no-drag` opt-outs become redundant under Tauri, but the
classes stay for the Electron build until cutover. Changes: add
`data-tauri-drag-region` to the `TitleBar` root div and to `#boot-splash` in
`index.html`; both mechanisms coexist during the migration. Caveat: because
of target-only semantics, the attribute must also go on the inner full-width
row and spacers in `TitleBar.tsx`, or the effective drag area shrinks vs v1 —
**children never inherit the attribute; every drag-able element needs it
explicitly**. **Double-click-to-maximize is manual under Tauri** (Electron's
drag region gave it for free): a dblclick handler on the drag elements calls
the `window:toggle-maximize` path. Required capabilities: the
`core:window:*` permission set covering start-dragging
(`core:window:allow-start-dragging`), minimize, maximize/unmaximize
(toggle), close, fullscreen, and is-maximized — scoped to the app window.
The Phase-1 shell checklist covers drag + double-click-to-maximize on every
empty bar region.

### Menus (`shared/menus.ts` + `src/main/app-menu.ts`)

One declarative tree: 31 `MENU_ACTION` ids, 7 top-level menus, nodes gated by
`surface` (`both|native|appbar`), `platform` (`mac|other`), `devOnly`;
`menusFor(surface, isMac, isDev)` filters + `trimSeparators`. Items carry
either `nativeRole` (OS behavior; Electron role passthrough) or an `id`
dispatched over the `menu:action` event to the renderer's `menuActions`
registry (`menu-model.tsx` `runMenuAction`). Accelerators resolve **live**
from the user's keybindings: `itemAccelerator` → `resolveAccelerator` picks
the `Cmd`- or `Ctrl`-prefixed variant of the bound keys; fixed shortcuts use
`accelerator` (e.g. `CmdOrCtrl+Shift+T`). The native menu is built on every
platform (it is the accelerator table everywhere; the visible bar only on
macOS); Windows/Linux draw `MenuBar.tsx` from the same tree.
`settings:set` on `keybindings*` rebuilds the native menu
(`rebuildMenuIfKeybindings` in `src/main/ipc/settings.ts`) so a rebind moves
the real accelerator instead of leaving a stale one that swallows the key.

## v2 design

**Pipeline:** a build step (`scripts/export-menus.mjs`, run by the tauri build
hook) imports `shared/menus.ts` and emits `src-tauri/gen/menus.json`: (a) the
raw `APP_MENUS` tree (roles, ids, gates, keybinding refs, fixed accelerators)
and (b) a `labelKey → string` map resolved through `shared/i18n` — keeping TS
the authoring format (02 §what stays TS). The Rust builder
(`verql-core::menu`) ports the pure functions (`keep`, `trimSeparators`,
`resolveAccelerator`/`itemAccelerator`) and builds the menu through the
**stable `tauri::menu` API** (muda 0.19.x underneath — no direct muda dep
needed). muda's accelerator parser accepts the Electron syntax in use (`CmdOrCtrl+…`,
`Shift+Alt+F`, `Cmd+,`); the drift check asserts every exported string parses.

**Role mapping:** `nativeRole` → muda `PredefinedMenuItem` where one exists
(`services`, `hide`, `hideOthers`, `unhide`, `quit`, `close`→CloseWindow,
`undo/redo/cut/copy/paste/selectAll`, `minimize`, `zoom`→Maximize,
`togglefullscreen`→Fullscreen, `front`→BringAllToFront). `reload`/
`toggleDevTools` have no predefined item and become ordinary id-emitting items
— harmless, since those nodes also carry `id`s whose renderer handlers call
`window:reload`/`window:toggle-devtools`. Non-role items set the
`MenuActionId` string as the muda item id; `on_menu_event` does
`app.emit("menu:action", id)` — the same single-implementation dispatch as v1.

**Surface split preserved:** macOS gets the native app menu
(`menusFor('native', true, isDev)`). Windows/Linux set **no** OS menu (a muda
menu on Windows would draw a classic bar over the frameless window);
`MenuBar.tsx` stays the visible surface. That removes v1's native accelerator
table on Win/Linux, so accelerator handling there moves to the renderer: the
existing app-level keybinding dispatch is extended to cover the tree's fixed
accelerators (`CmdOrCtrl+Shift+N/T`, `CmdOrCtrl+F`, `Shift+Alt+F`), resolved
from the same `menusFor('appbar', …)` data — one source of truth, as today.
Rebuild-on-rebind ports as: the `settings:set` dispatch handler watches
`keybindings*` key paths and rebuilds the macOS menu via
`run_on_main_thread` (muda mutation off-main-thread is undefined on macOS).

**Window creation** (`src-tauri/tauri.conf.json` + `main.rs`): same geometry,
min size, background color, dev-title suffix. macOS `titleBarStyle: "Overlay"`
+ `decorations: true` + first-class `trafficLightPosition {x:15, y:16}` (the
45px first-paint guess through `trafficLightY`; Tauri ≥2.4); Windows/Linux
`decorations: false`. **Windows has no window-controls-overlay equivalent in
Tauri** (issue #12930 open), so v1's `env(titlebar-area-*)` CSS variables
simply won't exist — the replacement is what v1 already effectively does:
app-drawn controls (`WindowControls.tsx`) at a fixed inset, no
titlebar-area geometry from the OS (the dead `env()` fallbacks in
`TitleBar.tsx` can be dropped at cutover). Security guards port as
configuration instead of handlers: capability file scoped to the single app
window exposing only `ipc_dispatch`, the event listen surface, and
`core:window:allow-start-dragging`; no `windows.create`/`webview` creation
capability (v1's `window.open` deny); navigation is confined to the app origin
by Tauri default + CSP in `tauri.conf.json` (v1's `will-navigate` pin).

## Parity cases

1. Shell checklist (manual, scripted, committed per Phase-1 gate): min/max/
   restore/close from app controls; snap/aero and double-click drag region
   flip the `window:maximize-changed`-driven icon; fullscreen toggle returns
   the new state; drag works on every empty bar region on all three OSes.
2. Traffic lights: at each UI density (bar heights differ), lights are
   vertically centered within ±1px of v1 (screenshot fixture).
3. Menu tree equivalence: for each (platform, surface, isDev) combination,
   the Rust-built menu serialized back to (label, id/role, accelerator,
   separator) lists byte-matches the TS `menusFor` output — this is the
   menus drift check.
4. Rebind: change `close-tab` binding in Settings → macOS native accelerator
   moves (old key reaches the renderer again, new key closes the tab);
   Win/Linux `KbdGroup` hints and the renderer dispatch move together.
5. `menu:action` dispatch: every non-role id in the tree, fired from the
   native menu, runs the same `menuActions` handler a bar click runs.
6. Open-external: `https?` opens, `file://`/`app:` are dropped silently (as
   v1); WSL fixture (mocked `os.release`) produces the exact `cmd.exe` argv.
7. Devtools/reload items appear only in dev builds (`devOnly` gate parity).

## Open questions

- Runtime traffic-light repositioning: the *config-time* position is solved
  first-class (`trafficLightPosition`, Tauri ≥2.4 — the private-API
  workaround is off the table); the open question is only whether the
  pinned 2.x minor exposes a *runtime* setter for per-density re-centering
  or T-105 falls back to fixed position for the default density (accept
  ±2px at other densities — needs human sign-off).
- Whether WebKitGTK delivers `WindowEvent::Resized` for maximize under all
  common WMs, or a `Moved`/property-notify listener is also needed (T-105).
- Renderer accelerator dispatch on Win/Linux while a native context menu or
  the devtools window has focus — enumerate the gaps in T-108's checklist.
