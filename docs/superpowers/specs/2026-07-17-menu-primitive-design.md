# Menu primitive — one core, three roots

**Status:** approved design, not yet implemented
**Date:** 2026-07-17
**Follow-up to:** PR #145 (`docs/ui-modularity-followups.md`)

## Why

`DropdownMenu` accepts only `{ label, onSelect, disabled }`
(`primitives/surfaces/DropdownMenu.tsx`). It has no icons, separators, sections,
submenus, shortcut hints, check state, danger tone, or scrolling.

That blocks the dedup work. `ui-modularity-followups.md` items 1 and 5 assign
`ConnectionSelector`'s three hand-rolled dropdowns and the AI panel's floating
menus to `DropdownMenu`, and item 1 calls for a `DropdownMenu.Item` that does not
exist. Those call-sites cannot migrate onto the primitive as it stands. **Fixing
the menu unblocks the dedup work rather than competing with it.**

There are three copies of the same floating-menu machinery today:

| Copy | Keyboard nav | flip/shift | Icons | Shortcuts | Submenus |
|---|---|---|---|---|---|
| `primitives/surfaces/DropdownMenu.tsx` | hand-rolled | yes | no | no | no |
| `primitives/surfaces/ContextMenu.tsx` | **none** | **no** | no | no | no |
| `components/shell/MenuBar.tsx` | hand-rolled | yes | yes | yes (`KbdGroup`) | no |

`ContextMenu` is a near-copy of `DropdownMenu` — same `MenuItem` type, same CVA
block — and is *not* listed in the dedup doc. Because it lacks `flip`/`shift`, a
right-click near a screen edge overflows the viewport.

`MenuBar` does **not** use the primitive; it only references it in a comment
("our own dropdowns (DropdownMenu look)") and re-implements the same floating-ui
stack. It is the most capable of the three — the nicest menu in the app is the
one that isn't the primitive.

Meanwhile `shared/menus.ts` declares submenus, separators, and accelerators that
the app-drawn bar flattens because the primitive can't render them.

## Decisions

| Decision | Choice |
|---|---|
| Scope | Rebuild API + visuals; absorb `ContextMenu` **and** `MenuBar` |
| Capabilities | Icons + shortcuts, separators + sections, submenus, check/radio + danger |
| Visual direction | **A · Tightened** — native register, flat `--color-hover` |
| API shape | **Hybrid** — compound base + declarative `<Menu items={tree}/>` |
| Dependencies | **None added** |

### Why no new dependency

`@floating-ui/react` 0.27.19 (`package.json:40`) already ships the menu
machinery the codebase hand-rolls: `FloatingTree` / `FloatingNode` /
`useFloatingNodeId`, `useListNavigation({ nested: true })`, `useTypeahead`,
`FloatingFocusManager`, and `safePolygon()`. Radix/react-aria would add three
packages to buy what we already own.

`DropdownMenu.tsx`'s `handleKeyDown` is a worse `useListNavigation`: it re-runs
`querySelectorAll` on every keypress, has no typeahead, and no focus return.

### Why hybrid, not one API

Both consumers genuinely exist:

- `shared/menus.ts` is **already a declarative tree** → `MenuBar` and the simple
  call-sites (`ConnectionListItem`, `FileContentInput`) want `<Menu items={…}/>`.
- `ConnectionSelector` needs custom row content (`ConnectionDot` swatch,
  secondary text) → wants compound.

Data-driven alone would force a render-prop escape hatch that reinvents compound
badly. The declarative layer is ~40 lines built *on* the compound layer, so there
is one implementation, two entry points.

## Architecture

One headless core owns positioning, keyboard, and focus. Three roots differ only
in how they are triggered.

```
primitives/surfaces/menu/
  menu-core.tsx     headless: context + shared floating config/interactions
  MenuContent.tsx   portal, FloatingFocusManager, transition, surface styling
  MenuItem.tsx      Item / CheckItem / RadioItem / Separator / Section / SubTrigger
  MenuSub.tsx       nested level (FloatingNode + useFloatingNodeId)
  render-nodes.tsx  the declarative <Menu items={tree}/> layer
  types.ts          MenuNode discriminated union
  index.ts
DropdownMenu.tsx    root: useClick trigger, bottom-start   (import path unchanged)
ContextMenu.tsx     root: virtual position reference at cursor, right-start
```

Roots stay small: `DropdownMenu` = `useClick` + core; `ContextMenu` = virtual
position reference + core. `FloatingTree` wraps at the root so submenus can
reach their parents.

`MenuBar` consumes the core and keeps its menubar-specific coordination
(hover-to-switch between open top-level menus, ←/→ across menus) in a local
`useMenubar` hook **beside** it — that logic does not belong in a generic menu
primitive.

### Types

```ts
type MenuLeaf =
  | { kind: 'item';      id, label, icon?, shortcut?: KeyBinding, onSelect, disabled?, tone?: 'default'|'danger' }
  | { kind: 'check';     id, label, checked, onSelect, disabled?, shortcut?: KeyBinding }
  | { kind: 'radio';     id, label, checked, onSelect, disabled?, group: string }
  | { kind: 'submenu';   id, label, icon?, children: MenuNode[], disabled? }
  | { kind: 'separator' }

type MenuNode =
  | MenuLeaf
  | { kind: 'section'; label, children: MenuLeaf[] }   // sections do not nest
```

Each maps to the correct ARIA role (`menuitem`, `menuitemcheckbox`,
`menuitemradio`, `group` + `aria-label`, `separator`). None of the three current
implementations do this.

`radio` covers `ConnectionSelector`'s database/schema pick, which is
single-select; `check` covers the View panel toggles.

**Nesting rule:** a `section` holds leaves only — a section cannot contain
another section. Submenus nest freely. This keeps the ARIA `group` flat, which is
what the role expects, and avoids an ambiguous "section inside a section" render.

**`shortcut` is a `KeyBinding`, not a string.** Accelerators must resolve from the
user's *live* keybindings (`shared/settings`), the same source the native menu
rebuilds from on `settings:set`. A hardcoded string would display a stale
accelerator after a rebind — the exact bug `shared/menus.ts` was built to prevent.

## Visual spec (direction A · Tightened)

Uses existing tokens only — no new tokens, no theme remap.

- **Surface** — `bg-bg-elevated border border-border-default rounded-md p-1 shadow-dropdown`, `min-w-[7rem]`.
- **Long lists** — the core adds floating-ui's `size` middleware alongside `flip`/`shift`, capping the surface at `min(20rem, availableHeight - 8px)` with `overflow-y: auto`. This is what makes the connection/schema pickers (dedup item 1) viable without their current `ScrollArea` wrapper, and it must be in the core, not bolted on per call-site.
- **Items** — `rounded-sm`, inset in the surface padding. CVA `size` by row height: `sm` 22px, `md` 26px (default), `lg` 32px.
- **Hover** — flat `bg-hover` (`--color-hover`, unchanged).
- **Separator** — `h-px bg-border-default my-1 mx-2`.
- **Section label** — 10px, uppercase, `tracking-wider`, `text-text-muted`, `font-semibold`.
- **Danger** — `text-error`, flat hover (no red fill).
- **Disabled** — `opacity-50 pointer-events-none`.
- **Submenu chevron** — 13px, 50% opacity.
- **Shortcuts** — right-aligned `text-text-muted`, rendered with the existing `KbdGroup` primitive (already used by `MenuBar`).

### Icon gutter is reserved per-menu, not per-item

If **any** item in a menu has an icon or a check, **every** item in that menu
reserves the 14px column. Otherwise labels jag left and right depending on their
neighbours. All three current implementations have this bug; it is the most
visible tell that a menu is hand-rolled.

### Motion

Today: `scaleY(0.95)` on `cubic-bezier(0.34, 1.56, 0.64, 1)`
(`DropdownMenu.tsx:70`). That curve overshoots past 1, so the menu springs —
wrong for direction A's native register.

New: opacity + a 2px rise on ease-out, gated behind `prefers-reduced-motion`,
which nothing currently honours.

## Migration

Clean break on the old `MenuItem` type — **no back-compat shim**. Nine call-sites
is small enough for one mechanical pass, and a shim would outlive its usefulness.

1. Core + primitives + stories.
2. `DropdownMenu` (3 sites: `FileContentInput`, `ConnectionListItem`, stories) and
   `ContextMenu` (7 sites: `TabBar`, `TabItem`, `TableNode`, `SchemaNode`,
   `ColumnRow`, `DatabaseNode`, `ViewNode`).
3. `MenuBar` + `useMenubar`.
4. Update `ui-modularity-followups.md` items 1 and 5 to reference the real API.

**Out of scope — follow-up PR:** dedup items 1 (`ConnectionSelector`) and 5 (AI
panel menus). They are the payoff, not the prerequisite.

### Risks

- **`MenuBar` is the riskiest step.** It is Windows/Linux-only (macOS uses the
  native menu), so it needs deliberate cross-platform verification. The
  `shared/menus.ts` header documents that these surfaces have silently drifted
  before.
- Touching a core primitive: `ContextMenu` backs every explorer node and the tab
  bar. Regressions are broad but visible.

## Verification

This work is *defined* by `ui-modularity-followups.md` as "correctness can only
be confirmed by seeing it render". Tests alone do not close it.

1. `pnpm exec tsc -b --noEmit` — `pnpm test` skips typechecking.
2. `pnpm exec vitest run <file>` — note `pnpm test -- --run <file>` runs the
   whole suite. ~45 baseline failures (sqlite native + `ai.ts`) are pre-existing.
3. `run-story-tests` — Storybook a11y, covering every node kind, all three sizes,
   submenus, check/radio, danger, disabled, long-list scroll, and edge flip.
4. `pnpm storybook` — eyeball **dark, light, and midnight**.
5. `pnpm dev` — exercise real surfaces: right-click an explorer node **near a
   screen edge** (the overflow fix), tab-bar context menu, connection list
   overflow menu, and the app-drawn menu bar on Windows/Linux.
6. Follow the `your-project-sb-mcp` MCP workflow before touching any primitive —
   confirm props exist before using them.
7. Changeset (minor).

## Acceptance

- One floating-menu implementation. `DropdownMenu`, `ContextMenu`, and `MenuBar`
  all consume it; no copy of the floating-ui stack remains outside `menu/`.
- Keyboard: ↑/↓/Home/End, ←/→ across submenus, typeahead, Escape, Enter; focus
  returns to the trigger on close.
- Right-click near a viewport edge flips/shifts into view.
- Icon gutter aligns per-menu.
- ARIA roles correct for every node kind.
- `prefers-reduced-motion` honoured.
- No visual regression at the 10 migrated call-sites in all three themes.
