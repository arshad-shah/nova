# UI modularity follow-ups — completed

The duplication/modularity audit deferred from PR #145. **All ten items are
done** (PR #146), together with the menu-primitive rebuild that item 1 depended
on ([`docs/superpowers/specs/2026-07-17-menu-primitive-design.md`](./superpowers/specs/2026-07-17-menu-primitive-design.md)).

This file is kept as the record of what was decided, not as a work list. The
useful part is the **deliberate exceptions** below: each one is a case where
following the item as written would have made the app worse, and without this
record the next reader would simply re-litigate them.

## What landed

| # | Item | Result |
|---|------|--------|
| 1 | `ConnectionSelector` → `DropdownMenu` | Three `useState` booleans, the manual mutual-exclusion, the `fixed inset-0` backdrop, three floating panels and a 4×-repeated class string are gone. Database/schema pickers use `Menu.RadioGroup` + `Menu.RadioItem`, so the active one is `aria-checked` rather than conveyed by colour. |
| 2 | `IconButton` `nav` variant | Added, with an `active` prop as `data-active`. Five of six call-sites migrated — see exceptions. |
| 3 | `StatusDot` primitive | Added (size × tone, `pulse`, `glow`, `label`); eight hand-rolled dots migrated. |
| 4 | `ConnectionDot` | Added, composing `StatusDot`. Both context-dependent fallbacks preserved through `state`. |
| 5 | AI panel floating menus | `ChatPanelHeader`'s menus → `DropdownMenu`; `ModelPicker` → `Popover`. `SchemaAutocomplete` deliberately not moved — see exceptions. |
| 6 | Overlays → `Modal` | Command palette and MCP approval migrated. `Modal` gained a `position` variant for the top-anchored palette. |
| 7 | Focus glow | Centralised as `FOCUS_GLOW`. `Card interactive` not adopted — see exceptions. |
| 8 | Badge / pill spans | Migrated; `Badge` gained a `pill` size. `ActionChip`'s interactive chip not migrated — see exceptions. |
| 9 | Progress bars → `Progress` | Migrated; `Progress` gained a semantic `tone` prop, which the item required be checked for first. |
| 10 | Smaller cleanups | `EmptyState` un-shadowed, `treeIndent()` extracted, white overlays tokenised, conservative typography swaps. |

Primitives extended rather than overridden with `!` classes, per the audit's own
rule: `Modal.position`, `Badge.size="pill"`, `Progress.tone`, `IconButton
variant="nav"`, plus `open`/`onOpenChange` on `DropdownMenu` and `Popover`.

## Deliberate exceptions

Each of these contradicts the item as written. They are not oversights.

- **Item 2 — `ActivityList` keeps its inline cluster.** Its buttons are `Button
  variant="bare"` with a dense `p-1` box, not `IconButton`'s fixed 28×28 square,
  and its active state has no `bg-accent/10` wash. Converting would enlarge the
  hit target in a deliberately dense toolbar. Five of six, on purpose.
- **Item 5 — `SchemaAutocomplete` is not a `Popover`.** `Popover` clones a
  trigger element and wires click-to-open; the autocomplete has no trigger — it
  opens from typing `@` into a textarea its *parent* owns. Fitting it would need
  a synthetic proxy trigger clicked on mount. A combobox is a different ARIA
  pattern from a popover; the item is wrong here. It keeps its own box with
  tokenised chrome.
- **Item 7 — `Card`'s `interactive` variant is not adopted.** Its hover adds
  `shadow-elevated`, which the three sites do not have. Using it would change the
  look, and the item's acceptance is "identical to today". Only the genuinely
  duplicated focus pair was centralised.
- **Item 8 — `ActionChip`'s interactive chip stays a `Button`.** `Badge` and
  `Tag` render a plain `span` with no click, keyboard, focus or disabled
  semantics, and that chip needs all four. Trading accessibility for tidiness is
  not a cleanup.
- **Item 10 — two typography swaps skipped.** `er/TableNode` renders
  `text-white` over a per-connection background colour, which `Text`'s semantic
  colours cannot express; `SaveQueryDialog`'s description needs `tertiary`, which
  `Text`'s colour enum lacks. Both would need a non-semantic escape hatch in
  `Text` for a single call-site.
- **Item 10 — `PlanNode`'s indent is not unified.** It uses `depth * 24` where
  the explorer uses `8 + depth * 16`. It has no chevron gutter, so the difference
  is intentional rather than drift.

## Known visual change for review

`ModelPicker`'s panel used to span the input's width (`left-3 right-3`, relative
to the card). `Popover` positions from its trigger's own rect, so the panel is
now narrower and centred above the model-name button. This is inherent to
`Popover`'s placement model, not something the controlled-open API changes.

## Remaining follow-ups

- **`TreeItem` adoption in the explorer.** `primitives/data-display/TreeItem`
  exists and the explorer still does not use it. Item 10 unified only the indent
  math; adopting the primitive is a real restructuring and was out of scope.
- **Storybook stories are not typechecked.** `tsconfig.web.json` excludes
  `*.stories.tsx`, which is how both menu stories silently rotted to a deleted
  API without `tsc` noticing. Removing the exclusion would have caught it.

## Verifying this work

Unchanged from the original audit, and still the point: **these are visual and
interaction changes whose correctness can only be confirmed by seeing them
render.**

1. `pnpm exec tsc -b --noEmit` — the real typecheck gate; `pnpm test` skips it.
2. `pnpm exec vitest run --project unit` — note `pnpm test -- --run <file>` does
   not scope. If the sqlite suites fail to load a native module, run
   `pnpm rebuild better-sqlite3` (tests run under Node; `postinstall` builds for
   Electron's ABI).
3. `pnpm test` — the Storybook/Playwright project needs a browser.
4. `pnpm storybook` — eyeball the migrated primitives in **dark, light and
   midnight**.
5. `pnpm dev` — exercise the real surfaces: connection/database/schema switching
   (item 1), the shell rails (item 2), the AI panel (items 5 and 9), the command
   palette (item 6), and right-click an explorer node **near a screen edge**.
   Run `pnpm postinstall` first to restore the Electron ABI build.
