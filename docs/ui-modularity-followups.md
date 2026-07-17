# UI modularity follow-ups

Deferred work from the duplication/modularity audit (PR #145). Everything here
is a **visual or interaction change whose correctness can only be confirmed by
seeing it render** — the Storybook + Playwright test project must run and the
changed surfaces should be eyeballed in the app (light *and* dark themes). They
were split out of the audit PR because that PR was verified by `tsc` + the
runnable unit tests only; these need a human/CI visual pass.

Each item lists the current sites, the target primitive/pattern, the approach,
and acceptance criteria. Line numbers are approximate (they drift) — anchor on
the component/class pattern. All target primitives already exist under
`src/renderer/src/primitives/`.

Ordering is by value × blast-radius, highest first.

---

## 1. `ConnectionSelector` — replace three hand-rolled dropdowns with `DropdownMenu`

**Priority: high.** The single biggest UI cleanup.

**Current** — `src/renderer/src/components/query/ConnectionSelector.tsx`
- Three separate `useState` booleans (`showConnDropdown`, `showDbDropdown`,
  `showSchemaDropdown`, ~L25-27) with manual mutual-exclusion in each trigger's
  `onClick` (L122, L146, L163).
- A hand-rolled `fixed inset-0 z-40` backdrop (L175) and three
  `absolute … z-50 … shadow-xl` floating panels (L179+), each wrapping a
  `ScrollArea` + `Button variant="ghost"` rows. The menu-item class string
  (`w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-hover … rounded-none border-0 h-auto`)
  is repeated 4×.

**Target** — `primitives/surfaces/DropdownMenu` (+ `DropdownMenu.Item`), or
`Popover` where the content isn't a simple item list.

**Approach**
- Replace each trigger+panel with a `DropdownMenu`; delete the three booleans and
  the shared backdrop (the primitive owns open state, outside-click, Escape, and
  focus management).
- Map connection / database / schema rows to `DropdownMenu.Item`.
- Reuse the `ConnectionDot` from item 6 for the per-connection color swatch.

**Acceptance**
- Open/close, keyboard nav (↑/↓/Enter/Esc), and outside-click all work for each
  of the three menus; only one open at a time.
- No visual regression vs. current in dark **and** light themes.
- The three `showXDropdown` states and the `fixed inset-0` backdrop are gone.

---

## 2. `IconButton` — add a `nav` variant for the shell rails

**Priority: high** (removes the most-repeated class cluster).

**Current** — the cluster
`text-text-muted hover:text-text-primary hover:bg-hover` (plus an
`isActive && 'bg-accent/10 text-accent'` branch) is re-supplied to `IconButton`
`className` across:
`shell/ActivityBar.tsx`, `shell/SecondaryActivityBar.tsx`,
`shell/BottomDockTabs.tsx`, `shell/NotificationBell.tsx`,
`shell/ActivityList.tsx` (and `ai/AIToggleButton.tsx`).

**Target** — a new CVA variant on `primitives/forms/Button.tsx` (`IconButton`),
e.g. `variant="nav"` with an `active` state, so the muted→primary hover and the
`bg-accent/10 text-accent` active state live in one place.

**Approach**
- Add the `nav` variant (and an `active` boolean or `data-active` style) to the
  IconButton CVA.
- Replace the per-call `className` clusters with `variant="nav"` +
  the active prop.
- Add/extend the IconButton story to cover the new variant.

**Acceptance**
- Storybook renders the `nav` variant (idle / hover / active) correctly in both
  themes; `run-story-tests` passes.
- All six shell call-sites drop the inline cluster.

**Risk** — modifies a core primitive; verify no other `IconButton` usage
regresses.

---

## 3. Inline status dots — introduce a `StatusDot` primitive

**Priority: medium.** ~12 sites, mechanical once the primitive exists.

**Current** — standalone colored dots hand-rolled as
`<span/Box className="h-1.5 w-1.5 rounded-full bg-…">` (sizes vary:
`h-1.5`, `h-1.75`, `w-2`, `w-2.5`) across `shell/status-bar/*`,
`shell/ConnectionSwitcher`, `shell/NotificationItem`, `shell/ActivityList`,
`shell/tab-bar/TabItem` (dirty dot), `plugins/PluginsPanel`,
`plugin-ui/widgets/StatusIndicatorWidget`, `connections/ConnectionListItem`,
`ai/AIStatusSegment`.

> **Note:** `BadgeIndicator` is **not** the right target here — it's a
> *corner-anchor wrapper* that positions a badge on the corner of wrapped
> children, not a standalone inline dot. Create a dedicated `StatusDot` instead.

**Target** — new `primitives/feedback/StatusDot.tsx` (CVA) with `size`
(`xs`/`sm`/`md`) and `tone` (`success`/`warning`/`error`/`muted`/`accent`/…)
variants, plus an optional `pulse` and `glow`/`ring` prop (see item 6 —
`ConnectionDot` can compose `StatusDot`).

**Acceptance**
- Story covers every size/tone; `run-story-tests` passes.
- Each migrated site is visually unchanged; dynamic-color dots (connection
  colors) go through `ConnectionDot`, not `StatusDot`.

---

## 4. `ConnectionDot` — the connection color swatch

**Priority: medium.** 3-4 sites, but the fallback logic is **context-dependent**
(don't blindly unify — this is by design, not a bug).

**Current**
- `query/ConnectionSelector.tsx` L127, L195 — `w-2 h-2 rounded-full`,
  `backgroundColor: conn.color ?? 'var(--color-accent)'`; L218 a disconnected
  `bg-text-muted` variant.
- `connections/ConnectionListItem.tsx` L80/L108 — `w-2.5 h-2.5`, fallback
  `conn.color ?? (connected ? var(--color-success) : var(--color-text-disabled))`,
  **plus** a connected `box-shadow` glow ring.

**Target** — `ConnectionDot` component taking `color?`, `size`
(`sm` = 8px / `md` = 10px), and a `state` (`connected` | `disconnected` |
`neutral`) that drives the fallback + optional glow. Preserve **both** fallback
behaviours via the `state` prop (selector uses `neutral`→accent; list uses
connection state→success/disabled + glow).

**Acceptance** — both call-sites render identically to today (including the
list-item glow); the fallback difference is expressed through `state`, not lost.

---

## 5. Hand-rolled floating menus in the AI panel

**Priority: medium.**

**Current**
- `ai/ChatPanelHeader.tsx` — history menu (L146-147) and settings/"more" menu
  (L197) are `absolute … top-full z-50 … shadow-dropdown` panels driven by manual
  `historyOpen` / `moreOpen` state (already uses `useClickOutside`, so half-way
  there).
- `ai/SchemaAutocomplete.tsx` — `absolute bottom-full … z-50` completion list.
- `ai/ModelPicker.tsx` L25 — `absolute bottom-full … z-50` popover wrapper.

**Target** — `DropdownMenu` for the header menus; `Popover` for the
autocomplete/model surfaces (they anchor upward and aren't plain item lists).

**Acceptance** — positioning (including the upward `bottom-full` cases), open
state, and dismissal match today; `shadow-dropdown` token retained.

---

## 6. Overlay surfaces → `Modal`

**Priority: medium.**

**Current**
- `command-palette/CommandPalette.tsx` L219 — `fixed inset-0 bg-black/30 z-50`
  backdrop + `fixed top-[15%] … shadow-2xl` panel.
- `ai/MCPApprovalDialog.tsx` L13 — `fixed inset-0 z-50 … bg-black/50` centering
  wrapper.

**Target** — `primitives/surfaces/Modal` (owns backdrop, centering, focus trap,
Escape, scroll lock). Replace the raw `shadow-2xl`/`shadow-xl` with the
`shadow-elevated` token.

> **Do not** touch `shell/ToastContainer.tsx` or `PluginRestartBanner.tsx` —
> those are intentional always-on infra overlays, not modals.

**Acceptance** — focus trap + Escape + backdrop-click close work; command
palette keyboard flow unaffected.

---

## 7. Interactive tile / focus-glow primitive

**Priority: low-medium.**

**Current** — a near-identical interactive-card cluster
(`rounded-… border border-border-default bg-bg-secondary … hover:border-border-strong hover:bg-hover focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-glow)]`)
in `welcome/WelcomeView.tsx` (L46, L69) and
`release-notes/ReleaseNotesContent.tsx` (L107).

**Target** — either an interactive `Card`/`ListButton` variant, or at minimum a
shared `focus-visible` ring utility so the
`focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-glow)]` pair
is centralized rather than copy-pasted.

**Acceptance** — hover-border + focus-glow identical to today at all three sites.

---

## 8. Badge / pill spans → `Badge` / `Tag`

**Priority: low.**

**Current**
- `explorer/TableNode.tsx` L160, L165 — `px-2 py-0.5 rounded-full text-[10px] bg-bg-elevated`
  metadata pills (row count etc.).
- `ai/AIStatusSegment.tsx` L81 — `rounded-full px-2 py-0.5 text-[10px]` status
  pill (pair with `StatusDot` from item 3).
- `ai/ActionChip.tsx` L77 — `rounded-md border px-2 py-0.5 text-xs font-medium`
  chip → `Tag`/`Badge`.

**Target** — `primitives/data-display/Badge` (and `Tag`). Verify the size/tone
variants cover `text-[10px]` scale before migrating; extend the primitive rather
than overriding with `!` classes.

---

## 9. Hand-rolled progress bars → `Progress`

**Priority: low.**

**Current**
- `ai/ChatPanelHeader.tsx` L128-129 — context-window usage bar
  (`h-1.5 rounded-full bg-bg-tertiary` track + inner `style={{width}}` fill).
- `query-plan/PlanNode.tsx` L49 — cost-ratio bar (inner
  `style={{ width, backgroundColor }}`).

**Target** — `primitives/feedback/Progress` (value/max). PlanNode needs a
per-node fill color, so confirm `Progress` supports a color override (or extend
it) before migrating.

---

## 10. Smaller cleanups

- **`ai/MessageThread.tsx` L23** — a local `function EmptyState()` shadows the
  real `primitives/data-display/EmptyState`. Compose the primitive instead.
- **Typography on `Box`** — a handful of `Box … text-xs font-medium/semibold`
  labels should be `Heading`/`Text` (`explorer/*Node.tsx`, `er/TableNode.tsx`,
  `ai/MCPApprovalDialog` title, `ai/ToolCallCard`, `query/SaveQueryDialog`
  title). Low value; do opportunistically.
- **Tree indent** — `paddingLeft`/depth math is duplicated across
  `explorer/*Node.tsx`, `schema-group/*`, `query-plan/PlanNode.tsx`. Consider a
  shared `treeIndent(depth)` helper or adopting `primitives/data-display/TreeItem`
  (which exists and isn't used by the explorer).
- **Residual white overlays** — `shell/status-bar/ConnectionSegment.tsx` L60/L68
  (`bg-white/18`, `bg-white/8`) and `shell/NotificationsSidebar.tsx` L78
  (`bg-white/[0.02]`) have no exact token; left in the audit. Either add matching
  tokens or accept a slight intensity shift when tokenizing.

---

## Verifying this work

1. `pnpm test` — the Storybook/Playwright project must pass (needs a browser;
   it could not run in the audit environment).
2. `pnpm storybook` — eyeball each migrated primitive in **dark, light, and
   midnight** themes.
3. `pnpm dev` — exercise the real surfaces: connection/db/schema switching
   (item 1), the shell rails (item 2), the AI panel menus (item 5), and the
   command palette (item 6).
4. Follow the `your-project-sb-mcp` MCP workflow in `CLAUDE.md` before touching
   any primitive — confirm props exist before using them.
