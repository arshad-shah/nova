# Tab Bar Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the editor tab strip: chrome silhouette refined and enlarged via new density tokens, gradient strip removed, full keyboard/ARIA support, tokenized icons, and a bulk-close path that stops silently destroying unsaved work.

**Architecture:** Sizing moves from accidental `h-7.5 × --spacing` arithmetic onto explicit `--tab-*` tokens declared beside the existing `--field-*` block in `globals.css`, so one `[data-density]` flip rescales the strip. Keyboard navigation lands as `useTabKeyboardNav.ts` alongside the existing `useTabDrag`/`useTabScroll` hooks, keeping `TabItem` presentational. The close guard's single `pendingId` becomes a `txnQueue` + `dirtyBatch` pair, with `requestCloseTab` reimplemented as the one-element case of `requestCloseTabs`.

**Tech Stack:** React 19, Zustand, Tailwind v4 (CSS-var theme), CVA, Vitest (jsdom + Storybook/Playwright browser project), lucide-react.

**Spec:** [docs/superpowers/specs/2026-07-17-tab-bar-redesign-design.md](../specs/2026-07-17-tab-bar-redesign-design.md)

## Global Constraints

- **Branch:** `worktree-tab-bar-redesign` in the worktree `/Users/ShahA/Documents/practice/dbterm/.claude/worktrees/tab-bar-redesign`. Run every command from there; never `cd` to the main checkout.
- **Never use bare `git stash` / `git stash pop`** — the stash stack is shared across worktrees.
- **No emoji in UI or code.** ASCII + lucide icons only. Build from design-system primitives.
- **DB-agnostic language** in all user-facing strings: no "SQL", "table", "column", "row". The tab strip is generic shell chrome.
- **All user-facing strings go through i18n** (`shared/i18n/locales/en/shell.ts`) and `t()`. Never hardcode a string in JSX.
- **Theme colors only via semantic tokens.** No raw Tailwind palette classes (`text-blue-400`). New colors derive in base `:root` from existing semantic tokens and must be registered in the `@theme` block of `globals.css` to get a utility class.
- **`pnpm test -- --run <file>` does NOT filter — it runs the whole suite.** Use `pnpm exec vitest run <file>`.
- **`pnpm test` does not typecheck** (esbuild). Run `pnpm exec tsc -b --noEmit` separately.
- **Every PR needs a changeset** (`.changeset/*.md`, `minor` pre-1.0). Task 8 covers it.
- **Do not modify the `ContextMenu` primitive** — owned by `feat/menu-primitive`. Keep the current `items` API.
- **Storybook MCP:** never guess a primitive's props. Check `get-documentation` before using any prop not already present in the file you're editing.

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `src/renderer/src/styles/globals.css` | `--tab-*` density tokens (modify) | 1 |
| `src/renderer/src/components/shell/tab-bar/tab-bar.css` | Fillets only; accent-strip rule deleted (modify) | 2 |
| `src/renderer/src/components/shell/tab-bar/TabItem.tsx` | Presentational tab; `role="tab"`, token sizing (modify) | 2, 5 |
| `src/renderer/src/components/shell/tab-bar/TabBar.tsx` | Composition + `role="tablist"` (modify) | 2, 5, 7 |
| `src/renderer/src/components/shell/tab-bar/tab-icons.ts` | Tokenized icon map (modify) | 3 |
| `src/renderer/src/stores/tab-actions.ts` | `requestCloseTabs`, queue + batch state (modify) | 4 |
| `src/renderer/src/components/shell/TabCloseGuard.tsx` | Txn queue head, then combined discard (modify) | 4 |
| `src/renderer/src/components/shell/ActiveTabView.tsx` | `role="tabpanel"` + `aria-labelledby` (modify) | 5 |
| `src/renderer/src/components/shell/tab-bar/useTabKeyboardNav.ts` | **Create** — roving tabindex + key handling | 5 |
| `shared/i18n/locales/en/shell.ts` | New tablist + plural-close keys (modify) | 4, 5 |
| `tests/unit/tab-close-guard.test.ts` | **Create** — partition logic | 4 |
| `tests/unit/tab-keyboard-nav.test.ts` | **Create** — focus index reducer | 5 |
| `.../tab-bar/TabBar.stories.tsx` | Density + theme + keyboard stories (modify) | 6 |
| `.../tab-bar/TabItem.stories.tsx` | Align decorator to `--tab-bar-h` (modify) | 6 |

**Task order rationale:** 1→2→3 are pure presentation and independently shippable. 4 (close guard) is pure logic and touches no file 1–3 touched. 5 (a11y) depends on 2 for the DOM shape. 6 (stories) needs 1–5 landed. 7 is cleanup in files already touched. 8 is the changeset + docs.

---

### Task 1: Tab density tokens

**Files:**
- Modify: `src/renderer/src/styles/globals.css:270-304` (immediately after the `--field-*` blocks)

**Interfaces:**
- Consumes: nothing.
- Produces: CSS custom properties `--tab-bar-h`, `--tab-h`, `--tab-r`, `--tab-px`, `--tab-gap`, `--tab-x`, resolved per `[data-density]`. Tasks 2 and 5 consume these via arbitrary-value Tailwind classes (`h-(--tab-h)`).

**Context:** `ThemeProvider.tsx:84` already stamps `data-density` on `document.documentElement` from `settings.appearance.uiDensity`. There is nothing to wire — declaring the tokens is sufficient.

- [ ] **Step 1: Add the token blocks**

In `src/renderer/src/styles/globals.css`, directly after the closing `}` of the `[data-density="spacious"]` block that ends the `--field-*` section (currently line 304), add:

```css
/* Tab-strip density tokens — the tab bar sizes off these, mirroring the
   --field-* block above. Keep the two in step: they sit next to each other in
   the UI and drifting them apart puts a 38px tab over a 42px field.

   These exist because the strip's sizes used to be an accident: `h-7.5` and
   `h-10` multiply Tailwind's --spacing, which density already moves, so the
   tabs scaled — but nobody chose the values and comfortable landed on a
   fractional 33.75px. Sizes only; no colors (those are --color-tab-* tokens,
   which plugin themes may override). The :root fallback equals comfortable so
   the strip sizes correctly before density is wired. */
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

- [ ] **Step 2: Verify the tokens resolve**

Run: `pnpm exec vitest run tests/unit --reporter=dot`
Expected: PASS — no behavior changed yet; this only proves nothing regressed.

Then run `pnpm dev`, open DevTools, and in the console evaluate:

```js
getComputedStyle(document.documentElement).getPropertyValue('--tab-h')
```

Expected: ` 38px` at the default comfortable density. Flip Settings → Appearance → UI Density to compact and re-evaluate.
Expected: ` 34px`.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/styles/globals.css
git commit -m "feat(tabs): add --tab-* density tokens

Sizes the tab strip off explicit tokens instead of h-7.5/h-10 multiplying
--spacing, which scaled by accident and put comfortable on a fractional
33.75px. Mirrors the --field-* block directly above."
```

---

### Task 2: Chrome refinement — token sizing, no gradient strip

**Files:**
- Modify: `src/renderer/src/components/shell/tab-bar/tab-bar.css` (delete `.tab-accent-strip`, drive fillet size from `--tab-r`)
- Modify: `src/renderer/src/components/shell/tab-bar/TabItem.tsx:52-72` (sizing classes, drop the strip element)
- Modify: `src/renderer/src/components/shell/tab-bar/TabBar.tsx:62-66` (bar height)

**Interfaces:**
- Consumes: `--tab-bar-h`, `--tab-h`, `--tab-r`, `--tab-px`, `--tab-gap` from Task 1.
- Produces: no API change. `TabItemProps` is untouched in this task.

**Context:** The fillet currently hardcodes `--skirt-size: 8px` while the tab hardcodes `rounded-t-[10px]` — they can drift. Binding the fillet to `--tab-r` makes the concave curve match the tab's own corner radius at every density for free.

- [ ] **Step 1: Rewrite `tab-bar.css`**

Replace the entire contents of `src/renderer/src/components/shell/tab-bar/tab-bar.css` with:

```css
/*
 * Browser-style tab "skirt" — the inverse-curved outside corners on the
 * active tab that let it appear to attach to the workspace surface below.
 *
 * Each pseudo-element paints a workspace-coloured square in the tab strip's
 * background and then masks out a quarter-circle so the visible result is a
 * concave fillet. Pure CSS; no extra DOM and no SVG.
 *
 * The fillet radius is --tab-r, the same token the tab's own corner uses, so
 * the concave curve always matches the convex one it continues — at every
 * density, without a second hardcoded number to keep in step.
 *
 * There is deliberately no accent strip here. The active tab used to carry a
 * 2px brand-gradient cap doing two jobs at once: brand surface and active-tab
 * indicator. The tab's own geometry (workspace-coloured fill + these fillets +
 * brighter medium-weight label) already carries the second, and every bundled
 * theme sets tab-bar-bg != tab-active-bg, so the signal survives without it.
 */

.tab-skirt-left,
.tab-skirt-right {
  --skirt-size: var(--tab-r);
  position: absolute;
  bottom: 0;
  width: var(--skirt-size);
  height: var(--skirt-size);
  background: var(--color-tab-active-bg);
  pointer-events: none;
}

.tab-skirt-left {
  left: calc(var(--skirt-size) * -1);
  mask: radial-gradient(circle var(--skirt-size) at top left, transparent 98%, #000 100%);
  -webkit-mask: radial-gradient(circle var(--skirt-size) at top left, transparent 98%, #000 100%);
}

.tab-skirt-right {
  right: calc(var(--skirt-size) * -1);
  mask: radial-gradient(circle var(--skirt-size) at top right, transparent 98%, #000 100%);
  -webkit-mask: radial-gradient(circle var(--skirt-size) at top right, transparent 98%, #000 100%);
}
```

- [ ] **Step 2: Update `TabItem.tsx` sizing and drop the strip**

In `src/renderer/src/components/shell/tab-bar/TabItem.tsx`, replace the `className` on the `<Flex>` (lines 52-60) with:

```tsx
        className={cn(
          'group relative cursor-pointer shrink-0 select-none transition-colors duration-(--transition-fast)',
          'h-(--tab-h) px-(--tab-px) gap-(--tab-gap) rounded-t-(--tab-r)',
          isActive
            ? 'bg-tab-active-bg text-tab-active-fg'
            : 'bg-transparent text-tab-inactive-fg hover:bg-tab-hover-bg',
          isDragged && 'opacity-50',
          isDropTarget && 'before:absolute before:left-0 before:top-1.5 before:bottom-2 before:w-0.5 before:bg-accent before:rounded-full before:z-10',
        )}
```

Remove `gap="xs"` from the `<Flex>` props (line 44) — the gap now comes from `--tab-gap` in the className. Keep `align="center"`.

Then replace the active-tab block (lines 62-72) with:

```tsx
        {/* Active-tab skirt: concave fillets that visually attach the tab to
            the workspace surface (Chrome-style). Rendered only for the active
            tab so inactive tabs stay flat. */}
        {isActive && (
          <>
            <span className="tab-skirt-left" aria-hidden="true" />
            <span className="tab-skirt-right" aria-hidden="true" />
          </>
        )}
```

- [ ] **Step 3: Update the bar height in `TabBar.tsx`**

In `src/renderer/src/components/shell/tab-bar/TabBar.tsx`, change the outer `<Flex>` className (line 64) from:

```tsx
      className="h-10 shrink-0 bg-tab-bar-bg px-2 pt-1.5"
```

to:

```tsx
      className="h-(--tab-bar-h) shrink-0 bg-tab-bar-bg px-2 pt-1.5"
```

- [ ] **Step 4: Verify nothing references the deleted class**

Run: `grep -rn "tab-accent-strip\|vq-gradient" src/renderer/src/components/shell/tab-bar/`
Expected: no output. (`--vq-gradient` itself stays defined in `tokens.css` for other surfaces — only the tab bar's use of it goes.)

- [ ] **Step 5: Verify the build and existing stories**

Run: `pnpm exec tsc -b --noEmit`
Expected: no errors.

Run: `pnpm exec vitest run src/renderer/src/components/shell/tab-bar --reporter=dot`
Expected: PASS — existing TabBar/TabItem stories still render.

- [ ] **Step 6: Visually confirm in the real app**

Run `pnpm dev`. Confirm: the active tab has no gradient cap; it reads as a raised surface welded to the editor below; the fillet curve visually continues the tab's corner (no notch or overhang); tabs are visibly taller than before.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/components/shell/tab-bar/tab-bar.css \
        src/renderer/src/components/shell/tab-bar/TabItem.tsx \
        src/renderer/src/components/shell/tab-bar/TabBar.tsx
git commit -m "feat(tabs): size the strip off --tab-* tokens, drop the gradient strip

The accent strip was doing two jobs — brand surface and active-tab indicator.
The tab's own geometry carries the second, and no bundled theme sets
tab-bar-bg == tab-active-bg, so the signal survives without it.

Fillet radius now derives from --tab-r, the same token as the tab's corner,
so the concave curve matches the convex one at every density."
```

---

### Task 3: Tokenize tab icon colors

**Files:**
- Modify: `src/renderer/src/components/shell/tab-bar/tab-icons.ts:9-19`

**Interfaces:**
- Consumes: existing semantic color tokens.
- Produces: `getTabIcon(type)` — unchanged signature, `{ icon: LucideIcon, className: string }`.

**Context:** Seven of nine entries use raw Tailwind palette classes, so tab icons render identically on all 11 bundled themes. `Tab['type']` is a closed union owned by the app (`shared/types.ts:191`), not driver-contributed, so this mapping stays inside the glue's remit.

Mapping rationale — reuse existing tokens, mint nothing new:

| Type | Was | Now | Why |
|---|---|---|---|
| `query` | `text-blue-400` | `text-data-accent` | Queries are the data surface. |
| `er-diagram` | `text-purple-400` | `text-accent` | Structural/interface view. |
| `connection-form` | `text-yellow-400` | `text-warning` | Yellow's semantic equivalent. |
| `table` | `text-sky-400` | `text-key-fk` | Cyan-family, distinct from `query`. |
| `plugin-detail` | `text-emerald-400` | `text-success` | Green's semantic equivalent. |
| `install-plugin` | `text-orange-400` | `text-info` | No orange token exists; `info` groups it with plugin-detail without inventing one. |
| `release-notes` | `text-pink-400` | `text-agent-accent` | Nearest existing accent. |
| `settings` | `text-text-tertiary` | unchanged | Already tokenized. |
| `welcome` | `text-accent` | unchanged | Already tokenized. |

- [ ] **Step 1: Confirm every target token has a utility class**

Run: `grep -nE "color-(data-accent|accent|warning|key-fk|success|info|agent-accent):" src/renderer/src/styles/globals.css`
Expected: a line for each. Any token missing from the `@theme` block has **no** Tailwind utility and would silently render unstyled — if one is missing, add it to `@theme` in the same commit rather than falling back to a raw palette class.

- [ ] **Step 2: Rewrite the map**

Replace lines 9-19 of `src/renderer/src/components/shell/tab-bar/tab-icons.ts` with:

```ts
/* Semantic tokens only — a raw palette class (text-blue-400) renders the same
   on all 11 bundled themes, which is exactly what the theme system exists to
   prevent. Tab['type'] is a closed, app-owned union, so this map is glue, not
   driver knowledge. */
const tabIconMap: Record<Tab['type'], TabIconConfig> = {
  query: { icon: FileText, className: 'text-data-accent' },
  'er-diagram': { icon: GitFork, className: 'text-accent' },
  'connection-form': { icon: Plug, className: 'text-warning' },
  table: { icon: Table2, className: 'text-key-fk' },
  'plugin-detail': { icon: Puzzle, className: 'text-success' },
  'install-plugin': { icon: Package, className: 'text-info' },
  settings: { icon: Settings, className: 'text-text-tertiary' },
  welcome: { icon: Sparkles, className: 'text-accent' },
  'release-notes': { icon: PartyPopper, className: 'text-agent-accent' },
}
```

- [ ] **Step 3: Verify no raw palette classes remain in the tab bar**

Run: `grep -rnE "text-(blue|purple|yellow|sky|emerald|orange|pink|red|green)-[0-9]{3}" src/renderer/src/components/shell/tab-bar/`
Expected: no output.

- [ ] **Step 4: Verify**

Run: `pnpm exec tsc -b --noEmit`
Expected: no errors. (`Record<Tab['type'], …>` is exhaustive — a missed key fails here.)

Run: `pnpm exec vitest run src/renderer/src/components/shell/tab-bar --reporter=dot`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/shell/tab-bar/tab-icons.ts
git commit -m "fix(tabs): tokenize tab icon colors

Seven of nine icons used raw Tailwind palette classes, so they rendered
identically on all 11 bundled themes regardless of the active one."
```

---

### Task 4: Bulk close must not destroy unsaved work

**Files:**
- Modify: `src/renderer/src/stores/tab-actions.ts:93-128`
- Modify: `src/renderer/src/components/shell/TabCloseGuard.tsx`
- Modify: `src/renderer/src/components/shell/tab-bar/TabBar.tsx:49-51`
- Modify: `src/renderer/src/App.tsx` (the `TabCloseGuard` call site)
- Modify: `shared/i18n/locales/en/shell.ts:148-154`
- Test: `tests/unit/tab-close-guard.test.ts` (**create**)

**Interfaces:**
- Consumes: `tabActions.isDirty(id)`, `tabActions.hasOpenTransaction(id)`, `useSettingsStore`.
- Produces:
  - `requestCloseTabs(ids: string[], actuallyClose: (id: string) => void): void`
  - `requestCloseTab(id: string, actuallyClose: (id: string) => void): void` — **signature unchanged**
  - `usePendingClose` state: `{ txnQueue: string[], dirtyBatch: string[], request, requestMany, resolveHead, clearBatch, clear }`

**Context — read before writing code.** `requestCloseTab` blocks on **two independent** conditions:

| Blocker | Condition | Dialog | Opt-out |
|---|---|---|---|
| Unsaved edits | `tabActions.isDirty(id)` | Discard / Keep editing | Yes — `general.confirmOnUnsavedClose` |
| Open transaction | `tabActions.hasOpenTransaction(id)` | **Commit or Rollback** | **No — always prompts** |

Dirty tabs can share one confirm. **Transactions cannot** — each commits or rolls back against its own DB session. Do not collapse them into one dialog.

Today `TabBar.tsx:49-51` calls `closeOtherTabs`/`closeTabsToRight`/`closeAllTabs` straight on the store, bypassing both guards: **it silently discards unsaved queries and abandons open transactions.**

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/tab-close-guard.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { tabActions, usePendingClose, requestCloseTab, requestCloseTabs } from '@/stores/tab-actions'
import { useSettingsStore } from '@/stores/settings'

/** Registers a tab whose dirty/txn state we control. */
function seedTab(id: string, opts: { dirty?: boolean; txn?: boolean } = {}) {
  tabActions.register(id, {
    isDirty: () => Boolean(opts.dirty),
    txnStatus: () => (opts.txn ? 'active' : 'none'),
    label: id,
  })
}

function setConfirmUnsaved(on: boolean) {
  const s = useSettingsStore.getState()
  useSettingsStore.setState({
    settings: { ...s.settings, general: { ...s.settings.general, confirmOnUnsavedClose: on } },
  })
}

describe('requestCloseTabs', () => {
  beforeEach(() => {
    ;['a', 'b', 'c', 'd'].forEach(id => tabActions.unregister(id))
    usePendingClose.getState().clear()
    setConfirmUnsaved(true)
  })

  it('closes clean tabs immediately and raises no dialog', () => {
    seedTab('a'); seedTab('b')
    const close = vi.fn()
    requestCloseTabs(['a', 'b'], close)

    expect(close.mock.calls.map(c => c[0])).toEqual(['a', 'b'])
    expect(usePendingClose.getState().dirtyBatch).toEqual([])
    expect(usePendingClose.getState().txnQueue).toEqual([])
  })

  it('partitions clean, dirty and transactional tabs', () => {
    seedTab('a')
    seedTab('b', { dirty: true })
    seedTab('c', { txn: true })
    const close = vi.fn()
    requestCloseTabs(['a', 'b', 'c'], close)

    expect(close).toHaveBeenCalledTimes(1)
    expect(close).toHaveBeenCalledWith('a')
    expect(usePendingClose.getState().dirtyBatch).toEqual(['b'])
    expect(usePendingClose.getState().txnQueue).toEqual(['c'])
  })

  it('a dirty AND transactional tab queues as transactional only', () => {
    seedTab('a', { dirty: true, txn: true })
    requestCloseTabs(['a'], vi.fn())

    expect(usePendingClose.getState().txnQueue).toEqual(['a'])
    expect(usePendingClose.getState().dirtyBatch).toEqual([])
  })

  it('confirmOnUnsavedClose=false closes dirty tabs but still queues transactions', () => {
    setConfirmUnsaved(false)
    seedTab('a', { dirty: true })
    seedTab('b', { txn: true })
    const close = vi.fn()
    requestCloseTabs(['a', 'b'], close)

    expect(close).toHaveBeenCalledTimes(1)
    expect(close).toHaveBeenCalledWith('a')
    expect(usePendingClose.getState().dirtyBatch).toEqual([])
    expect(usePendingClose.getState().txnQueue).toEqual(['b'])
  })

  it('resolveHead pops the transaction queue', () => {
    seedTab('a', { txn: true }); seedTab('b', { txn: true })
    requestCloseTabs(['a', 'b'], vi.fn())
    expect(usePendingClose.getState().txnQueue).toEqual(['a', 'b'])

    usePendingClose.getState().resolveHead()
    expect(usePendingClose.getState().txnQueue).toEqual(['b'])
  })
})

describe('requestCloseTab (regression — single-tab behavior is unchanged)', () => {
  beforeEach(() => {
    ;['a'].forEach(id => tabActions.unregister(id))
    usePendingClose.getState().clear()
    setConfirmUnsaved(true)
  })

  it('closes a clean tab directly', () => {
    seedTab('a')
    const close = vi.fn()
    requestCloseTab('a', close)
    expect(close).toHaveBeenCalledWith('a')
    expect(usePendingClose.getState().dirtyBatch).toEqual([])
  })

  it('blocks a dirty tab', () => {
    seedTab('a', { dirty: true })
    const close = vi.fn()
    requestCloseTab('a', close)
    expect(close).not.toHaveBeenCalled()
    expect(usePendingClose.getState().dirtyBatch).toEqual(['a'])
  })

  it('blocks a transactional tab regardless of the confirm setting', () => {
    setConfirmUnsaved(false)
    seedTab('a', { txn: true })
    const close = vi.fn()
    requestCloseTab('a', close)
    expect(close).not.toHaveBeenCalled()
    expect(usePendingClose.getState().txnQueue).toEqual(['a'])
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run tests/unit/tab-close-guard.test.ts`
Expected: FAIL — `requestCloseTabs is not a function` / `dirtyBatch` undefined.

- [ ] **Step 3: Implement the store change**

In `src/renderer/src/stores/tab-actions.ts`, replace lines 93-128 (from `interface PendingCloseState` to the end of `requestCloseTab`) with:

```ts
interface PendingCloseState {
  /** Tabs with an open transaction, resolved one at a time, head first.
   *  Each needs its own commit/rollback against its own session — there is
   *  no coherent bulk answer, so these queue rather than batch. */
  txnQueue: string[]
  /** Dirty tabs sharing one combined discard confirm. */
  dirtyBatch: string[]
  request: (tabId: string) => void
  requestMany: (ids: { dirty: string[]; txn: string[] }) => void
  /** Pops the transaction queue after a commit/rollback resolves. */
  resolveHead: () => void
  clearBatch: () => void
  clear: () => void
}

/**
 * Holds tabs the user asked to close but which are awaiting confirmation.
 * App.tsx watches this and mounts the dialog; every close site routes through
 * `requestCloseTab`/`requestCloseTabs` so they all share the same guards.
 */
export const usePendingClose = create<PendingCloseState>((set) => ({
  txnQueue: [],
  dirtyBatch: [],
  request: (tabId) => set({ dirtyBatch: [tabId] }),
  requestMany: ({ dirty, txn }) => set({ dirtyBatch: dirty, txnQueue: txn }),
  resolveHead: () => set((s) => ({ txnQueue: s.txnQueue.slice(1) })),
  clearBatch: () => set({ dirtyBatch: [] }),
  clear: () => set({ txnQueue: [], dirtyBatch: [] }),
}))

/**
 * Partitions `ids` three ways and closes what it can:
 *   - neither dirty nor transactional -> closed now, no dialog
 *   - dirty (and the confirm is on)   -> one combined discard confirm
 *   - open transaction               -> queued for a per-tab commit/rollback
 *
 * The transaction check comes first and wins: a tab that is both dirty and
 * transactional must not also appear in the discard batch, or the user would
 * answer for it twice.
 *
 * The unsaved-changes confirm is opt-out via Settings -> General. An open
 * transaction always prompts regardless: discarding it loses committed-looking
 * work and isn't covered by the "unsaved edits" toggle.
 */
export function requestCloseTabs(ids: string[], actuallyClose: (id: string) => void): void {
  const confirmUnsaved = useSettingsStore.getState().settings.general.confirmOnUnsavedClose
  const dirty: string[] = []
  const txn: string[] = []

  for (const id of ids) {
    if (tabActions.hasOpenTransaction(id)) txn.push(id)
    else if (confirmUnsaved && tabActions.isDirty(id)) dirty.push(id)
    else actuallyClose(id)
  }

  if (dirty.length > 0 || txn.length > 0) {
    usePendingClose.getState().requestMany({ dirty, txn })
  }
}

/**
 * Single-tab close. The one-element case of `requestCloseTabs` — kept as a
 * named export because it's the common path and every existing call site uses
 * it, but deliberately not a second implementation of the same guards.
 */
export function requestCloseTab(tabId: string, actuallyClose: (id: string) => void): void {
  requestCloseTabs([tabId], actuallyClose)
}
```

- [ ] **Step 4: Run the tests**

Run: `pnpm exec vitest run tests/unit/tab-close-guard.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Add the plural i18n copy**

In `shared/i18n/locales/en/shell.ts`, replace the `confirmClose` block (lines 148-154) with:

```ts
  confirmClose: {
    unsavedTitle: 'Unsaved changes',
    unsavedMessage: '{label} has unsaved changes. Close anyway?',
    unsavedTitleMany: 'Unsaved changes in {count, plural, one {# tab} other {# tabs}}',
    unsavedMessageMany: '{labels} have unsaved changes. Close anyway?',
    discardChanges: 'Discard changes',
    discardChangesMany: 'Discard all',
    keepEditing: 'Keep editing',
    thisTab: 'this tab',
  },
```

- [ ] **Step 6: Update `TabCloseGuard.tsx`**

Replace the entire contents of `src/renderer/src/components/shell/TabCloseGuard.tsx` with the following. The transaction `Modal` JSX is the existing markup unchanged except that it now reads `txnId` (the queue head) and calls `resolveHead()` instead of `clearPendingClose()`:

```tsx
import { Modal, Button, Text, Stack, Flex } from '@/primitives'
import { ConfirmDialog } from './ConfirmDialog'
import { tabActions } from '@/stores/tab-actions'
import { notifyError } from '@/lib/notify-error'
import { useTranslation } from '@/i18n/I18nProvider'

interface Props {
  txnQueue: string[]
  dirtyBatch: string[]
  resolveHead: () => void
  clearBatch: () => void
  closeTab: (id: string) => void
}

/** Guards tab closing. Transactions come first and resolve one at a time —
 *  each needs its own Commit or Rollback against its own session, so there's
 *  no bulk answer (a failed op keeps the dialog open to avoid an orphaned
 *  server transaction). Dirty tabs then share a single discard confirm. */
export function TabCloseGuard({ txnQueue, dirtyBatch, resolveHead, clearBatch, closeTab }: Props) {
  const { t } = useTranslation()
  const txnId = txnQueue[0] ?? null

  if (txnId !== null) {
    return (
      <Modal open onClose={resolveHead} className="w-[400px] max-w-[90vw]">
        <Stack gap="md" className="p-4">
          <Text size="sm" weight="semibold">{t('shell.confirmTransaction.title')}</Text>
          <Text size="sm" color="secondary">
            {t('shell.confirmTransaction.message', {
              label: tabActions.get(txnId)?.label ?? t('shell.confirmTransaction.thisTab'),
            })}
          </Text>
        </Stack>
        <Flex direction="row" justify="end" gap="sm" className="px-4 py-3 border-t border-border">
          {/* Cancel pops the head too: this tab stays open, the queue advances
              to the next transactional tab. */}
          <Button variant="outline" size="sm" onClick={resolveHead}>{t('common.cancel')}</Button>
          <Button
            variant="error"
            size="sm"
            onClick={async () => {
              try {
                await tabActions.rollbackTransaction(txnId)
                resolveHead()
                closeTab(txnId)
              } catch (err) {
                notifyError(err, {
                  source: { type: 'tab', id: txnId, label: tabActions.get(txnId)?.label ?? txnId },
                })
                // leave dialog open so the user can retry or cancel
              }
            }}
          >
            {t('shell.confirmTransaction.rollbackAndClose')}
          </Button>
          <Button
            variant="solid"
            size="sm"
            onClick={async () => {
              try {
                await tabActions.commitTransaction(txnId)
                resolveHead()
                closeTab(txnId)
              } catch (err) {
                notifyError(err, {
                  source: { type: 'tab', id: txnId, label: tabActions.get(txnId)?.label ?? txnId },
                })
                // leave dialog open so the user can retry or cancel
              }
            }}
          >
            {t('shell.confirmTransaction.commitAndClose')}
          </Button>
        </Flex>
      </Modal>
    )
  }

  if (dirtyBatch.length === 0) return null

  // With one dirty tab this is today's exact singular copy, so the common
  // path is visually unchanged by the batching.
  const many = dirtyBatch.length > 1
  const labels = dirtyBatch.map(id => tabActions.get(id)?.label ?? id).join(', ')

  return (
    <ConfirmDialog
      open
      title={many
        ? t('shell.confirmClose.unsavedTitleMany', { count: dirtyBatch.length })
        : t('shell.confirmClose.unsavedTitle')}
      message={many
        ? t('shell.confirmClose.unsavedMessageMany', { labels })
        : t('shell.confirmClose.unsavedMessage', {
            label: tabActions.get(dirtyBatch[0])?.label ?? t('shell.confirmClose.thisTab'),
          })}
      confirmLabel={many
        ? t('shell.confirmClose.discardChangesMany')
        : t('shell.confirmClose.discardChanges')}
      cancelLabel={t('shell.confirmClose.keepEditing')}
      variant="danger"
      onCancel={clearBatch}
      onConfirm={() => {
        const ids = dirtyBatch
        clearBatch()
        ids.forEach(closeTab)
      }}
    />
  )
}
```

- [ ] **Step 7: Update the `App.tsx` call site**

Find the `<TabCloseGuard .../>` usage in `src/renderer/src/App.tsx` and replace its props to match the new interface, reading `txnQueue`, `dirtyBatch`, `resolveHead` and `clearBatch` from `usePendingClose`.

- [ ] **Step 8: Route bulk close through the guard**

In `src/renderer/src/components/shell/tab-bar/TabBar.tsx`, import `requestCloseTabs` alongside `requestCloseTab`, and replace the three bulk entries in `getContextMenuItems` (lines 49-51):

```tsx
      {
        label: t('shell.tabBar.closeOthers'),
        onSelect: () => requestCloseTabs(tabs.filter(x => x.id !== tabId).map(x => x.id), closeTab),
        disabled: tabs.length <= 1,
      },
      {
        label: t('shell.tabBar.closeToRight'),
        onSelect: () => requestCloseTabs(tabs.slice(index + 1).map(x => x.id), closeTab),
        disabled: index >= tabs.length - 1,
      },
      {
        label: t('shell.tabBar.closeAll'),
        onSelect: () => requestCloseTabs(tabs.map(x => x.id), closeTab),
      },
```

This closes each tab via the store's single-tab `closeTab`, so `closeOtherTabs`/`closeTabsToRight`/`closeAllTabs` are no longer called from the tab bar. **Leave those store actions in place** — `detachConnection` and other callers may use them. Verify with `grep -rn "closeOtherTabs\|closeTabsToRight\|closeAllTabs" src/` and report any remaining callers in the task summary.

- [ ] **Step 9: Verify**

Run: `pnpm exec vitest run tests/unit/tab-close-guard.test.ts`
Expected: PASS.

Run: `pnpm exec tsc -b --noEmit`
Expected: no errors.

- [ ] **Step 10: Drive the real app**

Run `pnpm dev`. Then:
1. Open three query tabs, type in two of them (dirty), right-click the third → Close Others. Expected: **one** dialog naming both dirty tabs; Discard all closes both.
2. Repeat, but click Keep editing. Expected: both dirty tabs stay open; clean tabs already closed stay closed.
3. Open a tab, begin a transaction, open a second clean tab, Close All. Expected: the clean tab closes, the transactional tab shows Commit/Rollback.

- [ ] **Step 11: Commit**

```bash
git add src/renderer/src/stores/tab-actions.ts \
        src/renderer/src/components/shell/TabCloseGuard.tsx \
        src/renderer/src/components/shell/tab-bar/TabBar.tsx \
        src/renderer/src/App.tsx \
        shared/i18n/locales/en/shell.ts \
        tests/unit/tab-close-guard.test.ts
git commit -m "fix(tabs): bulk close no longer discards unsaved work silently

Close Others / Close to Right / Close All called the store directly, bypassing
both the unsaved-changes confirm and the open-transaction guard that the X
button and Cmd+W honor. They destroyed dirty queries and abandoned open
transactions without a prompt.

Bulk close now closes clean tabs immediately, batches dirty tabs into one
discard confirm, and queues transactional tabs for the existing per-tab
commit/rollback dialog. requestCloseTab becomes the one-element case of
requestCloseTabs rather than a second copy of the guards."
```

---

### Task 5: Keyboard navigation and ARIA

**Files:**
- Create: `src/renderer/src/components/shell/tab-bar/useTabKeyboardNav.ts`
- Modify: `src/renderer/src/components/shell/tab-bar/TabBar.tsx`
- Modify: `src/renderer/src/components/shell/tab-bar/TabItem.tsx`
- Modify: `src/renderer/src/components/shell/ActiveTabView.tsx`
- Modify: `shared/i18n/locales/en/shell.ts` (tabBar block)
- Test: `tests/unit/tab-keyboard-nav.test.ts` (**create**)

**Interfaces:**
- Consumes: `scrollIntoView(tabId)` from `useTabScroll`; `requestCloseTab` from Task 4.
- Produces:
  - `nextFocusIndex(current: number, key: string, count: number): number | null` — pure, exported for test
  - `useTabKeyboardNav({ tabs, activeTabId, onActivate, onClose, scrollIntoView }) => { onKeyDown: (e: KeyboardEvent) => void, tabIndexFor: (id: string) => 0 | -1, onTabFocus: (id: string) => void }`

**Context:** Tabs are currently `<Flex>` divs with `onClick` — no role, no `tabIndex`, no keyboard path. The strip is invisible to assistive tech and unusable without a mouse. This is the largest change in the plan.

**Manual activation, not automatic.** Arrow keys move *focus* only; Enter/Space activates. This is the [APG manual-activation tablist pattern](https://www.w3.org/WAI/ARIA/apg/patterns/tabs/) and it is a deliberate choice: auto-activation would mount a real editor and open a DB session on every arrow keypress.

- [ ] **Step 1: Write the failing test for the pure reducer**

Create `tests/unit/tab-keyboard-nav.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { nextFocusIndex } from '@/components/shell/tab-bar/useTabKeyboardNav'

describe('nextFocusIndex', () => {
  it('moves right and left', () => {
    expect(nextFocusIndex(0, 'ArrowRight', 3)).toBe(1)
    expect(nextFocusIndex(2, 'ArrowLeft', 3)).toBe(1)
  })

  it('does not wrap at either end', () => {
    expect(nextFocusIndex(2, 'ArrowRight', 3)).toBe(2)
    expect(nextFocusIndex(0, 'ArrowLeft', 3)).toBe(0)
  })

  it('jumps to the ends', () => {
    expect(nextFocusIndex(1, 'Home', 3)).toBe(0)
    expect(nextFocusIndex(1, 'End', 3)).toBe(2)
  })

  it('returns null for keys it does not handle', () => {
    expect(nextFocusIndex(1, 'Enter', 3)).toBeNull()
    expect(nextFocusIndex(1, 'a', 3)).toBeNull()
  })

  it('handles an empty strip without throwing', () => {
    expect(nextFocusIndex(0, 'ArrowRight', 0)).toBeNull()
    expect(nextFocusIndex(0, 'End', 0)).toBeNull()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run tests/unit/tab-keyboard-nav.test.ts`
Expected: FAIL — cannot resolve `useTabKeyboardNav`.

- [ ] **Step 3: Create the hook**

Create `src/renderer/src/components/shell/tab-bar/useTabKeyboardNav.ts`:

```ts
import { useCallback, useState, type KeyboardEvent } from 'react'
import type { Tab } from '@shared/types'

/**
 * Which tab index a navigation key moves focus to. Pure and exported so the
 * arrow/Home/End contract is testable without a DOM.
 *
 * Returns null when the key isn't a navigation key (the caller handles
 * activation and close separately) or when there are no tabs.
 *
 * Deliberately does not wrap: a tab strip is a finite list, and wrapping from
 * the last tab to the first reads as a jump rather than a step.
 */
export function nextFocusIndex(current: number, key: string, count: number): number | null {
  if (count === 0) return null
  switch (key) {
    case 'ArrowRight': return Math.min(current + 1, count - 1)
    case 'ArrowLeft':  return Math.max(current - 1, 0)
    case 'Home':       return 0
    case 'End':        return count - 1
    default:           return null
  }
}

interface Options {
  tabs: Tab[]
  activeTabId: string | null
  onActivate: (id: string) => void
  onClose: (id: string) => void
  scrollIntoView: (id: string) => void
}

/**
 * Roving-tabindex keyboard navigation for the tab strip.
 *
 * Manual activation (APG tablist pattern): arrows move focus, Enter/Space
 * activates. Auto-activation would mount a real editor and open a DB session
 * on every arrow keypress, so focus and selection are deliberately separate.
 *
 * One Tab keypress enters the strip and lands on the active tab; another
 * leaves it — the strip is one tab stop, not N.
 */
export function useTabKeyboardNav({ tabs, activeTabId, onActivate, onClose, scrollIntoView }: Options) {
  const [focusedId, setFocusedId] = useState<string | null>(null)

  // The roving tab stop: whatever the user last focused, else the active tab.
  // Falling back to active is what makes one Tab keypress land somewhere sane.
  const rovingId = focusedId ?? activeTabId

  const onKeyDown = useCallback((e: KeyboardEvent) => {
    const current = tabs.findIndex(t => t.id === rovingId)
    if (current === -1) return

    const next = nextFocusIndex(current, e.key, tabs.length)
    if (next !== null) {
      e.preventDefault()
      const id = tabs[next].id
      setFocusedId(id)
      scrollIntoView(id)
      // Move real DOM focus so the focus ring and screen readers follow.
      document.querySelector<HTMLElement>(`[data-tab-id="${id}"]`)?.focus()
      return
    }

    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()   // Space would otherwise scroll the strip
      onActivate(tabs[current].id)
      return
    }

    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault()
      onClose(tabs[current].id)
    }
  }, [tabs, rovingId, onActivate, onClose, scrollIntoView])

  const tabIndexFor = useCallback(
    (id: string): 0 | -1 => (id === rovingId ? 0 : -1),
    [rovingId],
  )

  const onTabFocus = useCallback((id: string) => setFocusedId(id), [])

  return { onKeyDown, tabIndexFor, onTabFocus }
}
```

- [ ] **Step 4: Run the tests**

Run: `pnpm exec vitest run tests/unit/tab-keyboard-nav.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Add the i18n key**

In `shared/i18n/locales/en/shell.ts`, add to the `tabBar` block (after `newTab`):

```ts
    tablistLabel: 'Open tabs',
```

- [ ] **Step 6: Wire the hook into `TabBar.tsx`**

Add the import:

```tsx
import { useTabKeyboardNav } from './useTabKeyboardNav'
```

After the `useTabDrag` call, add:

```tsx
  const { onKeyDown, tabIndexFor, onTabFocus } = useTabKeyboardNav({
    tabs,
    activeTabId,
    onActivate: setActiveTab,
    onClose: (id) => requestCloseTab(id, closeTab),
    scrollIntoView,
  })
```

Add the tablist role and key handler to the scrollable trough `<Flex>` (the one with `ref={scrollRef}`):

```tsx
      <Flex
        ref={scrollRef}
        onWheel={onWheel}
        onKeyDown={onKeyDown}
        role="tablist"
        aria-orientation="horizontal"
        aria-label={t('shell.tabBar.tablistLabel')}
        align="end"
        className="flex-1 h-full overflow-x-hidden gap-0.5"
      >
```

Pass the two new props to each `<TabItem>`:

```tsx
            tabIndex={tabIndexFor(tab.id)}
            onFocus={() => onTabFocus(tab.id)}
```

- [ ] **Step 7: Add the tab role to `TabItem.tsx`**

Extend `TabItemProps` with:

```tsx
  tabIndex: 0 | -1
  onFocus: () => void
```

Destructure `tabIndex` and `onFocus` in the signature, and add to the `<Flex>`:

```tsx
        id={`tab-${tab.id}`}
        role="tab"
        aria-selected={isActive}
        tabIndex={tabIndex}
        onFocus={onFocus}
```

Add the focus ring to the className list (the outline is inset so the fillets and the trough's `overflow-x-hidden` can't clip it):

```tsx
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-inset',
```

- [ ] **Step 8: Add the tabpanel relationship**

In `src/renderer/src/components/shell/ActiveTabView.tsx`, add `role="tabpanel"` and `aria-labelledby={`tab-${activeTab.id}`}` to the component's root element, matching the `id` set on `TabItem` in step 7. If the root is a fragment, wrap it in a `<Box className="h-full">` carrying the attributes rather than adding a bare div.

- [ ] **Step 9: Verify**

Run: `pnpm exec vitest run tests/unit/tab-keyboard-nav.test.ts`
Expected: PASS.

Run: `pnpm exec tsc -b --noEmit`
Expected: no errors.

Run: `pnpm exec vitest run src/renderer/src/components/shell/tab-bar --reporter=dot`
Expected: PASS — the Storybook a11y checks now assert against the new roles.

- [ ] **Step 10: Drive the real app — this is the step that matters**

Run `pnpm dev` with three or more tabs open, then verify each:

1. Press Tab repeatedly. Expected: focus enters the strip **once**, landing on the active tab — not once per tab.
2. Press `→`. Expected: the focus ring moves; **the editor below does not change**. This is the manual-activation contract.
3. Press `Enter`. Expected: the focused tab activates.
4. Press `Delete` on a dirty tab. Expected: the discard confirm appears (not a silent close).
5. Press `Space` on a tab. Expected: it activates and **does not start a drag** — `useTabDrag` uses pointer events, but confirm they don't collide.
6. Arrow past the visible edge with many tabs open. Expected: the strip scrolls to follow focus.

- [ ] **Step 11: Commit**

```bash
git add src/renderer/src/components/shell/tab-bar/useTabKeyboardNav.ts \
        src/renderer/src/components/shell/tab-bar/TabBar.tsx \
        src/renderer/src/components/shell/tab-bar/TabItem.tsx \
        src/renderer/src/components/shell/ActiveTabView.tsx \
        shared/i18n/locales/en/shell.ts \
        tests/unit/tab-keyboard-nav.test.ts
git commit -m "feat(tabs): keyboard navigation and tablist semantics

Tabs were plain divs with onClick: no role, no tabIndex, no keyboard path.
The strip was invisible to assistive tech and unusable without a mouse.

Roving tabindex with manual activation (APG tablist pattern) — arrows move
focus, Enter/Space activates. Auto-activation would mount an editor and open
a DB session on every arrow keypress."
```

---

### Task 6: Stories

**Files:**
- Modify: `src/renderer/src/components/shell/tab-bar/TabBar.stories.tsx`
- Modify: `src/renderer/src/components/shell/tab-bar/TabItem.stories.tsx`

**Interfaces:**
- Consumes: everything from Tasks 1-5.
- Produces: nothing consumed downstream.

- [ ] **Step 1: Fetch the current story conventions**

Call the Storybook MCP tool `get-storybook-story-instructions` and follow its output — it is the source of truth for imports, `play` patterns, and testing conventions. Do not pattern-match off the existing file alone.

- [ ] **Step 2: Add the density stories**

`data-density` is one attribute on `<html>`, so each story is a decorator that sets it. Add to `TabBar.stories.tsx`:

```tsx
function withDensity(density: 'compact' | 'comfortable' | 'spacious') {
  return (Story: () => React.ReactElement) => {
    document.documentElement.setAttribute('data-density', density)
    return <Story />
  }
}

export const DensityCompact: Story = {
  decorators: [withDensity('compact')],
  render: () => { seedStores(); return <TabBar /> },
}
export const DensityComfortable: Story = {
  decorators: [withDensity('comfortable')],
  render: () => { seedStores(); return <TabBar /> },
}
export const DensitySpacious: Story = {
  decorators: [withDensity('spacious')],
  render: () => { seedStores(); return <TabBar /> },
}
```

**Reuse the existing `seedStores()` helper** already in the file — do not write new tab factories.

- [ ] **Step 3: Add the all-themes story**

This is the check that de-risks removing the gradient strip. Render the strip once per bundled theme by setting `data-theme` on a wrapper:

```tsx
const THEMES = ['ion', 'nightshift', 'lab', 'inkpaper', 'dark', 'light',
                'midnight', 'dracula', 'nord', 'solarized', 'catppuccin'] as const

/** The active tab has no gradient strip; its only cues are the workspace-
 *  coloured fill, the fillets and brighter text. Every bundled theme sets
 *  tab-bar-bg != tab-active-bg, so the signal survives — but the margin
 *  varies. Ink & Paper is the tightest pair (#FBF6EA vs #F2EBDE): if the
 *  active tab is going to disappear anywhere, it's there. */
export const AllThemes: Story = {
  render: () => {
    seedStores()
    return (
      <Stack gap="md">
        {THEMES.map(theme => (
          <div key={theme} data-theme={theme}>
            <Text size="xs" color="tertiary" className="mb-1">{theme}</Text>
            <TabBar />
          </div>
        ))}
      </Stack>
    )
  },
}
```

- [ ] **Step 4: Add the keyboard `play` function**

This encodes the manual-activation contract — the part most likely to regress:

```tsx
export const KeyboardNavigation: Story = {
  render: () => { seedStores(); return <TabBar /> },
  play: async ({ canvasElement, step }) => {
    const canvas = within(canvasElement)
    const tabs = canvas.getAllByRole('tab')

    await step('the strip is a single tab stop', async () => {
      await userEvent.tab()
      expect(tabs.find(t => t.getAttribute('aria-selected') === 'true')).toHaveFocus()
    })

    await step('arrows move focus without activating', async () => {
      const selectedBefore = tabs.find(t => t.getAttribute('aria-selected') === 'true')
      await userEvent.keyboard('{ArrowRight}')
      expect(tabs[1]).toHaveFocus()
      // The contract: focus moved, selection did not.
      expect(selectedBefore?.getAttribute('aria-selected')).toBe('true')
    })

    await step('Enter activates the focused tab', async () => {
      await userEvent.keyboard('{Enter}')
      expect(tabs[1]).toHaveAttribute('aria-selected', 'true')
    })
  },
}
```

- [ ] **Step 5: Fix the TabItem decorator**

In `TabItem.stories.tsx`, change the decorator's `h-9` to `h-(--tab-bar-h)` so it matches the real bar. Add the two new required props (`tabIndex={0}`, `onFocus={() => {}}`) to every story's args, or `tsc` will fail.

- [ ] **Step 6: Verify**

Run: `pnpm exec tsc -b --noEmit`
Expected: no errors.

Then call the Storybook MCP tool `run-story-tests` scoped to the tab-bar stories.
Expected: all pass, including a11y checks.

Then call `preview-stories` and **include every returned URL in the task summary** so the reviewer can see the density and theme renders.

- [ ] **Step 7: Inspect the Ink & Paper render**

Open the `AllThemes` preview URL. Confirm the active tab is distinguishable on every theme, **especially Ink & Paper**. If it is not, add a 1px `border-subtle` top edge to the active tab — **do not reinstate the gradient strip** — and note the change in the task summary.

- [ ] **Step 8: Commit**

```bash
git add src/renderer/src/components/shell/tab-bar/TabBar.stories.tsx \
        src/renderer/src/components/shell/tab-bar/TabItem.stories.tsx
git commit -m "test(tabs): density, all-themes and keyboard stories

AllThemes is the check that de-risks removing the gradient strip: the active
tab's only remaining cues are the fill, the fillets and brighter text."
```

---

### Task 7: Cleanups in the files already touched

**Files:**
- Modify: `src/renderer/src/components/shell/tab-bar/TabItem.tsx`
- Modify: `src/renderer/src/components/shell/tab-bar/TabBar.tsx`
- Modify: `src/renderer/src/components/shell/tab-bar/TabBar.stories.tsx`

**Interfaces:** none — dead code and formatting only.

**Scope discipline:** only these four items. Do not refactor anything else in these files.

- [ ] **Step 1: Remove the unused `index` prop**

In `TabItem.tsx`, delete `index: number` from `TabItemProps`. It is declared but never destructured. Then remove `index={index}` from the `<TabItem>` call in `TabBar.tsx`.

**Careful:** `index` is still needed *inside* `TabBar.tsx` for `getContextMenuItems(tab.id, index)` and the drag handlers — only the prop passed *into* `TabItem` goes.

- [ ] **Step 2: Remove the unused `fn` import**

In `TabBar.stories.tsx:3`, remove `fn` from the import — it is imported and never used.

- [ ] **Step 3: Fix the broken indentation**

In `TabBar.tsx`, the scroll-right `IconButton` block (originally lines 107-119) has indentation inconsistent with the rest of the file — the `{ canScrollRight && (` line and its children sit at the wrong depth. Reformat it to match the scroll-left block directly above it.

- [ ] **Step 4: Verify**

Run: `pnpm exec tsc -b --noEmit`
Expected: no errors — an unused prop that's still passed would fail here.

Run: `pnpm exec vitest run src/renderer/src/components/shell/tab-bar --reporter=dot`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/shell/tab-bar/
git commit -m "chore(tabs): drop dead code, fix indentation

TabItemProps.index was declared but never destructured; the stories imported
fn without using it; the scroll-right block's indentation had drifted."
```

---

### Task 8: Changeset, docs, and full verification

**Files:**
- Create: `.changeset/tab-bar-redesign.md`
- Modify: `docs/architecture.md` (tab-bar/density mention, if one exists)

**Interfaces:** none.

- [ ] **Step 1: Write the changeset**

Create `.changeset/tab-bar-redesign.md`:

```markdown
---
'verql': minor
---

Redesigned the tab bar. Tabs are larger and roomier at every UI density, sized
by new `--tab-*` tokens that follow Settings → Appearance → UI Density instead
of scaling by accident. The active tab now reads as a raised surface welded to
the workspace rather than relying on an accent strip.

Tabs are now fully keyboard-operable and exposed to assistive tech: arrow keys
move focus along the strip, Enter activates, Delete closes, and the strip is a
single tab stop with proper tablist semantics.

Fixed: Close Others, Close to the Right and Close All bypassed the
unsaved-changes confirm and the open-transaction guard, silently discarding
unsaved queries and abandoning open transactions. Bulk close now closes clean
tabs immediately, asks once before discarding several unsaved tabs, and
prompts per tab to commit or roll back an open transaction.

Fixed: tab icons ignored the active theme.
```

- [ ] **Step 2: Check whether the docs mention the tab bar**

Run: `grep -rn "tab-bar\|tab bar\|TabBar" docs/*.md`

If `docs/architecture.md` describes the tab bar or the density system, update it to mention the `--tab-*` tokens and the tablist semantics. Per `CLAUDE.md`, a subsystem change updates its doc in the same change. If no doc describes it, skip — do not invent a new doc.

- [ ] **Step 3: Full typecheck**

Run: `pnpm exec tsc -b --noEmit`
Expected: no errors. **`pnpm test` uses esbuild and does not typecheck — this step is not optional.**

- [ ] **Step 4: Full test suite**

Run: `pnpm test`
Expected: all pass. The baseline is green (1646/1646), so **any** failure is yours.

If `better-sqlite3` fails with a `NODE_MODULE_VERSION` / dlopen error, that's the Electron/Node dual-ABI trap and is unrelated to this work: run `pnpm rebuild better-sqlite3` and re-run.

- [ ] **Step 5: Final pass in the real app**

Run `pnpm dev` and walk the whole surface once more: flip all three densities, switch to Ink & Paper and one dark theme, arrow through the tabs, close a dirty tab with Delete, and run Close Others with two dirty tabs.

- [ ] **Step 6: Commit and push**

```bash
git add .changeset/tab-bar-redesign.md docs/
git commit -m "chore: changeset for tab bar redesign"
git push -u origin worktree-tab-bar-redesign
```

**Note:** pushing to `arshad-shah/verql` requires `gh auth switch` to the `arshad-shah` account — the default account gets a 403.

- [ ] **Step 7: Open the PR**

Use `gh pr create` targeting `main`. Body should summarize: the visual change, the density tokens, the a11y work, and — called out explicitly, since it's a behavior change reviewers must know about — the bulk-close guard fix.

---

## Notes for the implementer

- **The `AllThemes` story is load-bearing**, not decoration. Removing the gradient strip is the one decision in this plan that could look wrong on a theme nobody tests. Ink & Paper (`#FBF6EA` bar vs `#F2EBDE` active) is the tightest pair.
- **Manual activation is deliberate.** If a reviewer asks why arrows don't switch tabs: auto-activation mounts a real editor and opens a DB session per keypress.
- **Do not touch `ContextMenu`.** It's owned by `feat/menu-primitive`. This branch keeps the current `items` API and accepts a small conflict at the call site.
- **Out of scope, do not add:** pinned tabs, an overflow dropdown, Cmd+1..9 or next/prev shortcuts, split view, cross-window drag.
