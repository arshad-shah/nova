# Tab Bar Redesign — Design

**Date:** 2026-07-17
**Branch:** `worktree-tab-bar-redesign` (branched from `origin/main`, independent of `feat/menu-primitive`)
**Scope:** [src/renderer/src/components/shell/tab-bar/](../../../src/renderer/src/components/shell/tab-bar/) — `TabBar.tsx`, `TabItem.tsx`, `tab-bar.css`, `tab-icons.ts` — plus the density token block in [styles/globals.css](../../../src/renderer/src/styles/globals.css) and the close-guard routing in [stores/tabs.ts](../../../src/renderer/src/stores/tabs.ts).

## Goal

Make the editor tab strip read as a deliberate, modern surface: larger and roomier at every UI density, sized by tokens someone actually chose rather than by accident, keyboard-operable, and themed through semantic tokens. The visual language stays **chrome-style** — this is a refinement of the existing direction, not a departure.

Three things ride along because they are defects in the surface being rebuilt, not new features:

1. The strip is **unreachable by keyboard** and invisible to assistive tech.
2. **Close others / close to right silently discard unsaved work.**
3. **Tab icons ignore the theme.**

## What stays the same

- Chrome-style silhouette: rounded-top tabs, active tab welded to the workspace by concave fillets.
- Drag-to-reorder ([useTabDrag.ts](../../../src/renderer/src/components/shell/tab-bar/useTabDrag.ts)) — HTML5 DnD, 3px threshold, `before:` drop indicator.
- Overflow arrow-scroll + wheel mapping + auto-`scrollIntoView` ([useTabScroll.ts](../../../src/renderer/src/components/shell/tab-bar/useTabScroll.ts)).
- Middle-click close, the dirty-dot → red-X hover swap, the context menu and its six items, the new-tab `+` button.
- The `tabs` store shape, its actions, and `requestCloseTab` / `TabCloseGuard`.
- The five `--color-tab-*` theme tokens and their plugin-themeable allowlist.

## Decisions taken

| Decision | Choice | Rationale |
|---|---|---|
| Visual direction | Chrome (refine, not replace) | Chosen against floating-pill and flat-underline alternatives. |
| Brand gradient strip | **Removed** | See "Cost of removing the strip" below. |
| Size increase | **+4px** at every density | Reviewed against today's rendering at all three densities. |
| Bulk close + dirty tabs | **One combined guard** | Prompting per tab for N dirty tabs is hostile. |
| Density plumbing | New `--tab-*` tokens | Mirrors the established `--field-*` pattern. |

## Visual design

### Sizing — new `--tab-*` density tokens

Today's sizes are an **accident**. `TabItem` is `h-7.5` and `TabBar` is `h-10`; Tailwind v4 derives both from `--spacing`, which `[data-density]` already moves (4px / 4.5px / 5px). So the strip does scale with density — but nobody chose the values, and comfortable lands on a fractional **33.75px**.

Replace that with first-class tokens in [globals.css](../../../src/renderer/src/styles/globals.css), declared immediately after the existing `--field-*` block and following its conventions exactly (sizes only — no colors; a `:root` fallback equal to comfortable so the strip sizes correctly before density is wired):

```css
:root {
  --tab-bar-h:48px; --tab-h:38px; --tab-r:10px; --tab-px:13px; --tab-gap:7px; --tab-x:18px;
}
[data-density="compact"] {
  --tab-bar-h:44px; --tab-h:34px; --tab-r:9px;  --tab-px:11px; --tab-gap:6px; --tab-x:16px;
}
[data-density="comfortable"] {
  --tab-bar-h:48px; --tab-h:38px; --tab-r:10px; --tab-px:13px; --tab-gap:7px; --tab-x:18px;
}
[data-density="spacious"] {
  --tab-bar-h:52px; --tab-h:42px; --tab-r:11px; --tab-px:15px; --tab-gap:8px; --tab-x:20px;
}
```

Net effect versus today, per density:

| Density | Bar (was → now) | Tab (was → now) | Label |
|---|---|---|---|
| compact | 40 → **44** | 30 → **34** | 12px |
| comfortable *(default)* | 45 → **48** | 33.75 → **38** | 13px |
| spacious | 50 → **52** | 37.5 → **42** | 14px |

Radius, padding, gap and close-button size step up with each tier, so spacious is not a stretched compact. Label size continues to come from `Text size="xs"` (`--text-xs` = 12/13/14px), which is already density-driven — no change needed.

One `[data-density]` flip on `<html>` rescales the whole strip with no per-component branching, and the fillet geometry stays locked to `--tab-r` for free (today `tab-bar.css` hardcodes a radius that can drift from the tab's own `rounded-t-[10px]`).

### Active state — the gradient strip is removed

Delete the `.tab-accent-strip` element and its `--vq-gradient` rule. Active-ness then rests on three cues that already exist:

1. The tab's background switches to `--color-tab-active-bg`, which equals the workspace surface.
2. The concave fillets weld it to the body below.
3. Text goes `--color-tab-active-fg` at `font-medium`.

**Verified across all 11 bundled themes:** no theme sets `tab-bar-bg` equal to `tab-active-bg`, so every theme retains an active signal without the strip. The direction of the step varies and that is fine — Ion, Nightshift, Midnight and Ink & Paper make the active tab *darker* than the bar; Dracula, Nord, Solarized, Catppuccin, Lab and Light make it *lighter*. In every case the active tab matches `bg-primary`, so the "welded to the workspace" reading holds regardless of direction.

**Ink & Paper is the tightest pair** (`#FBF6EA` bar vs `#F2EBDE` active) and is the specific case to eyeball during implementation. If it proves too faint, the fallback is a 1px `--color-border-subtle` top edge on the active tab — *not* reinstating the gradient.

### Cost of removing the strip

`TabItem.tsx` currently documents the strip as "one of the few surfaces the brand gradient is reserved for." Removing it genuinely costs the brand a surface, and that trade was made knowingly: the strip was doing two jobs at once — brand accent *and* active-tab indicator — and the tab's own geometry already carries the second one. The gradient remains in use elsewhere; if the brand later wants a strip back, `--tab-r`-aligned tokens make it a one-line addition.

### Hover, drag, focus

- Inactive hover: `--color-tab-hover-bg` + text to `--color-tab-active-fg` (unchanged behavior, now on token-driven padding).
- Dragged: `opacity-50` (unchanged). Drop target: 2px `--color-accent` bar (unchanged).
- **New** — focus-visible: a 2px `--color-focus-ring` outline inset within the tab, so it is not clipped by the fillets or `overflow-x-hidden` on the trough.

## Accessibility

The largest change in this spec, and where the risk sits. Today each tab is a `<Flex>` div with `onClick` — no role, no `tabIndex`, no keyboard path. The strip is invisible to assistive tech and unusable without a mouse.

### Semantics

- Trough → `role="tablist"` + `aria-orientation="horizontal"` + `aria-label` (i18n key).
- Each tab → `role="tab"`, `aria-selected`, stable `id={`tab-${tab.id}`}`.
- [ActiveTabView.tsx](../../../src/renderer/src/components/shell/ActiveTabView.tsx) → `role="tabpanel"` + `aria-labelledby={`tab-${activeTabId}`}`, completing the tab↔panel relationship.
- The close control keeps its own accessible name (`closeTab` / `closeTabUnsaved`), already present.

### Roving tabindex

The active tab is the only tab at `tabIndex={0}`; all others are `-1`. One Tab keypress enters the strip and lands on the active tab; another leaves it. Within the strip:

| Key | Action |
|---|---|
| `←` / `→` | Move focus (not selection) to prev/next tab, no wrap |
| `Home` / `End` | Focus first / last tab |
| `Enter` / `Space` | Activate the focused tab |
| `Delete` / `Backspace` | Close the focused tab via `requestCloseTab` |

**Moving focus does not activate.** This is the [APG manual-activation tablist pattern](https://www.w3.org/WAI/ARIA/apg/patterns/tabs/), chosen deliberately: auto-activation would mount a real query editor and open a DB session on every arrow keypress.

Lands as `useTabKeyboardNav.ts`, a hook alongside `useTabDrag` / `useTabScroll`, keeping `TabItem` presentational. It owns the focus index, the key handling, and calls the existing `scrollIntoView` from `useTabScroll` so keyboard focus drags the overflow strip along.

**Explicitly out of scope:** global next/prev-tab and Cmd+1..9 shortcuts. Those are app-level keybindings, not tablist semantics, and belong with the keybinding registry.

## The close-guard bug

`closeOtherTabs` and `closeTabsToRight` are wired straight to the store from `TabBar.tsx:49-51`, bypassing `requestCloseTab`. The X button and Cmd+W honor `settings.general.confirmOnUnsavedClose` via `usePendingClose` → `TabCloseGuard`; these two paths do not. **Today they silently destroy unsaved queries.** `closeAllTabs` has the same hole.

Chaining single-tab guards would prompt N times. Instead:

- Extend `tab-actions.ts` with `requestCloseTabs(ids, commit)`, which collects the dirty subset of `ids` and raises **one** pending-close carrying that list.
- `TabCloseGuard` grows a plural branch: with >1 dirty tab it names them and offers Discard all / Cancel. The existing single-tab copy is untouched.
- Clean tabs close without prompting. Zero dirty tabs → commit immediately, no dialog.
- Respects `confirmOnUnsavedClose` exactly as the single-tab path does.

New i18n keys under `shell.tabBar.*` / the close-guard namespace for the plural copy.

## Tokenizing tab icons

[tab-icons.ts](../../../src/renderer/src/components/shell/tab-bar/tab-icons.ts) hardcodes raw Tailwind palette classes — `text-blue-400`, `text-purple-400`, `text-yellow-400`, `text-sky-400`, `text-emerald-400`, `text-orange-400`, `text-pink-400` — so tab icons stay the same seven colors on all 11 themes. Only `settings` and `welcome` use tokens today.

Map each `Tab['type']` onto an existing semantic token. Any genuinely new color must be derived in base `:root` from existing semantic tokens and registered in the `@theme` block of `globals.css` to get a utility class. Prefer reusing what exists (`--color-data-accent`, `--color-accent`, `--color-agent-accent`, `--color-key-pk`, `--color-key-fk`, `--color-info`, `--color-warning`) over minting new tokens.

**Constraint:** the mapping is keyed off `Tab['type']`, which is a closed union owned by the app — not driver-contributed — so this stays inside the glue's remit and introduces no dialect knowledge.

## Component structure

The directory keeps its shape; no new components.

```
components/shell/tab-bar/
  TabBar.tsx            # composition + tablist semantics; wires the new hook
  TabItem.tsx           # presentational; role="tab", token-driven sizing
  useTabKeyboardNav.ts  # NEW — roving tabindex, arrow/Home/End/Enter/Delete
  useTabDrag.ts         # unchanged
  useTabScroll.ts       # unchanged (scrollIntoView reused by the nav hook)
  tab-icons.ts          # tokenized
  tab-bar.css           # fillets only; accent-strip rule deleted; radius from --tab-r
```

Cleanups in files already being touched (and nothing beyond them):

- `TabItemProps.index` is declared but never destructured — remove it.
- `TabBar.stories.tsx:3` imports `fn` and never uses it — remove it.
- `TabItem.stories.tsx` decorator uses `h-9` while the real bar is `h-10` — align to `--tab-bar-h`.
- `TabBar.tsx:107-119` — the right-arrow block's indentation is broken; fix while editing it.

## Testing

- **Density stories** — the strip at compact / comfortable / spacious. `data-density` is one attribute on a decorator, so this is three thin stories over one render.
- **Theme story** — the strip across all 11 bundled themes, verifying the active tab reads without the gradient strip. This is the check that de-risks the strip removal; **Ink & Paper is the case to inspect.**
- **Keyboard `play` functions** — Tab into the strip lands on the active tab; `→` moves focus without activating; `Enter` activates; `Home`/`End`; `Delete` routes through the guard. These encode the manual-activation contract, which is the part most likely to regress.
- **Unit test** for `requestCloseTabs`: mixed clean/dirty selection raises exactly one pending close carrying only the dirty ids; all-clean commits with no dialog; `confirmOnUnsavedClose=false` bypasses. This is the only new non-presentational logic, and it guards data loss.
- Existing story a11y checks run through the Storybook browser project and must pass — the new roles are exactly what they assert on.

## Verification

Stories and unit tests do not prove a keyboard contract or a visual one. Before claiming done:

- `pnpm exec vitest run <file>` for the touched files, then the full suite via `pnpm test`. (Note `pnpm test -- --run <file>` does *not* filter — it runs the whole suite.)
- `pnpm exec tsc -b --noEmit` — `pnpm test` uses esbuild and does not typecheck.
- Drive the real app (`pnpm dev`): arrow through the strip, confirm focus moves without mounting editors, close a dirty tab with `Delete`, run Close Others with two dirty tabs and confirm **one** dialog, and flip density in Settings → Appearance to watch the strip rescale.

## Out of scope

Pinned tabs · overflow dropdown · Cmd+1..9 and next/prev shortcuts · split view · cross-window tab drag · any change to the `ContextMenu` primitive (owned by `feat/menu-primitive`; this branch keeps the current `items` API and accepts a small merge conflict at the call site if that API changes).

## Risks

| Risk | Mitigation |
|---|---|
| Active tab too faint on Ink & Paper without the strip | All-themes story; fallback is a 1px `border-subtle` top edge, not the gradient |
| Roving tabindex fights the drag handlers on the same element | `useTabDrag` uses pointer events, `useTabKeyboardNav` uses key events; no shared listener. Verify Space does not start a drag |
| `--tab-*` tokens drift from `--field-*` | Declared adjacently with a comment tying them together, matching the existing convention |
| Merge conflict with `feat/menu-primitive` at the `ContextMenu` call site | Accepted deliberately; the call site is ~8 lines |
