# Test Hardening + Merged Coverage to 90% Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make both Vitest projects green with zero unhandled rejections, collect and merge coverage across the `unit` (jsdom) and `storybook` (Chromium) projects, raise combined coverage as close to 90% as genuine behavioral tests allow, expand Storybook (play tests + new stories), and document the whole testing model in `docs/testing.md`.

**Architecture:** Fix the 7 current failures and the systemic `themes is not iterable` noise first (Phases 0–1, serial, correctness-critical — two are real product null-safety fixes). Then enable merged coverage as the measurement substrate, and fan out behavioral test authoring by disjoint directory (Phases 2–3). Finish with docs (Phase 4).

**Tech Stack:** Vitest 4.1.8, `@vitest/coverage-v8` 4.1.8, `@vitest/browser-playwright` 4.1.8, Storybook 10.3.5 (`@storybook/addon-vitest`), React 19, Zustand, `@floating-ui/react`, `storybook/test` (`userEvent`, `screen`, `within`, `expect`, `fn`, `waitFor`).

## Global Constraints

- **DB-agnostic user-facing language** — no "SQL"/"table"/"column"/"row" in strings; use driver capabilities. (Not expected to bite in test code, but new stories must not introduce such copy.)
- **No emoji in UI**; ASCII + lucide icons only; build from design-system primitives.
- **Never invent component props** — verify against Storybook MCP docs (`your-project-sb-mcp`: `list-all-documentation` → `get-documentation`) before using any prop in a new/edited story.
- **Run typecheck before done** — `pnpm test` (esbuild) skips typechecking; also run `pnpm exec tsc -b --noEmit`.
- **Add a changeset** — every feature/fix PR needs `.changeset/*.md` (this is a `patch` — test/infra only, no user-facing behavior change beyond store null-safety).
- **Run single files with `pnpm exec vitest run <file>`** — `pnpm test -- --run <file>` runs the WHOLE suite.
- **Coverage is a ratchet** — raise the `vitest.config.ts` floor in the same change that raises coverage; never pin above what green tests sustain. No coverage-padding: every test must fail when the code under test breaks.
- **Docs move with code** — update CLAUDE.md's Testing section, the `vitest.config.ts` coverage comment, and the `site/` counterpart in the same change as `docs/testing.md`.
- **Commit format** ends with: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

---

## Phase 0 — Merged-coverage infrastructure (the enabler)

### Task 0.1: Prove v8 coverage collects from the browser (storybook) project

**Files:**
- Modify: `package.json` (scripts.`test:coverage`)
- Modify: `vitest.config.ts:26-50` (coverage block comment + thresholds, later)

**Interfaces:**
- Produces: a working `pnpm test:coverage` that runs BOTH projects and emits a single merged `coverage/coverage-summary.json`.

- [ ] **Step 1: Change the coverage script to run both projects.**

In `package.json`, replace:
```json
"test:coverage": "vitest run --project unit --coverage",
```
with:
```json
"test:coverage": "vitest run --coverage",
```
Dropping `--project unit` makes Vitest run both projects; `--coverage` enables the root `coverage` block, which the `storybook` project inherits via `extends: true`.

- [ ] **Step 2: Run it and confirm the browser project contributes.**

Run: `pnpm test:coverage 2>&1 | tail -40`
Expected: the run executes both `unit` and `storybook (chromium)` projects and prints a `% Coverage report from v8` summary. Note the four numbers (statements/branches/functions/lines) — the **combined baseline**. Record them.

- [ ] **Step 3: Verify component files are now counted.**

Run: `python3 -c "import json; d=json.load(open('coverage/coverage-summary.json')); k=[p for p in d if 'ContextMenu.tsx' in p]; print(k[0] if k else 'MISSING', d[k[0]]['lines'] if k else '')"`
Expected: a renderer component that has stories (e.g. `ContextMenu.tsx`) shows non-trivial line coverage — proof the browser project's execution is merged in.

**Decision gate / fallback:** If Step 2 shows the browser project emits **no** coverage (v8 browser instrumentation not wired), fall back to istanbul for the browser project only:
```bash
pnpm add -D @vitest/coverage-istanbul
```
and set `coverage.provider` per-project (v8 for unit, istanbul for storybook) or globally to `istanbul`, then re-run. Record which provider won in the plan's execution notes and in `docs/testing.md`. Do not proceed to Task 0.2 until a combined number prints.

- [ ] **Step 4: Commit.**
```bash
git add package.json
git commit -m "test(coverage): merge browser + unit coverage into one report

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

### Task 0.2: Re-pin the threshold floor + rewrite the coverage comment

Do this LAST in the whole effort as well (ratchet up), but pin the *merged baseline* now so CI reflects reality immediately.

**Files:**
- Modify: `vitest.config.ts:14-49`

- [ ] **Step 1: Rewrite the comment block** (lines 14-25 area) to state that coverage is now collected from BOTH projects and merged, so component numbers are real, not understated. Keep the ratchet philosophy sentences.

- [ ] **Step 2: Set `thresholds` to the merged baseline from Task 0.1 Step 2**, rounded DOWN to one decimal (so the same run passes). Replace the four numbers and the "Floor measured" provenance line with today's date (2026-07-23) and the new counts.

- [ ] **Step 3: Verify the threshold passes.**

Run: `pnpm test:coverage 2>&1 | tail -6`
Expected: no `ERROR: Coverage for X does not meet threshold` line.

- [ ] **Step 4: Commit.**
```bash
git add vitest.config.ts
git commit -m "test(coverage): re-pin threshold floor to merged baseline

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Phase 1 — Fix the 7 failures + eliminate the `themes` noise

### Task 1.1: Null-safe theme store (product fix — root of ~40 rejections)

**Files:**
- Modify: `src/renderer/src/stores/themes.ts:77,105-122`
- Test: `tests/unit/theme-validation.test.ts` (or a new `tests/unit/themes-store.test.ts` if the store isn't already unit-tested — check first)

**Interfaces:**
- Produces: `useThemesStore.fetch()` never calls `injectThemes` with a non-array; `injectThemes` tolerates `undefined`/non-array by treating it as empty.

- [ ] **Step 1: Write the failing test** in a new `tests/unit/themes-store.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useThemesStore } from '@/stores/themes'
import { IPC_CHANNELS } from '@shared/ipc'

function stubInvoke(resolve: unknown) {
  ;(window as unknown as { electronAPI: unknown }).electronAPI = {
    invoke: vi.fn(async (ch: string) => (ch === IPC_CHANNELS.THEMES_LIST ? resolve : [])),
    on: () => () => {},
  }
}

describe('useThemesStore.fetch', () => {
  beforeEach(() => useThemesStore.setState({ themes: [], loaded: false }))

  it('treats an undefined IPC resolve as no plugin themes (does not throw)', async () => {
    stubInvoke(undefined)
    await expect(useThemesStore.getState().fetch()).resolves.toBeUndefined()
    // Baseline Ion is always present even when plugins contribute nothing.
    const { themes, loaded } = useThemesStore.getState()
    expect(loaded).toBe(true)
    expect(themes.length).toBeGreaterThanOrEqual(1)
  })

  it('keeps plugin themes when the IPC resolve is a valid array', async () => {
    stubInvoke([{ id: 'x', name: 'X', type: 'dark' }])
    await useThemesStore.getState().fetch()
    expect(useThemesStore.getState().themes.some((t) => t.id === 'x')).toBe(true)
  })
})
```

- [ ] **Step 2: Run it to verify it fails.**

Run: `pnpm exec vitest run tests/unit/themes-store.test.ts`
Expected: FAIL — first test throws `themes is not iterable`.

- [ ] **Step 3: Implement the fix.**

In `src/renderer/src/stores/themes.ts`, harden `injectThemes` signature body:
```ts
function injectThemes(themes: RegisteredThemeView[]): void {
  const list = Array.isArray(themes) ? themes : []
  const head = document.head
  // ...unchanged, but iterate `list` instead of `themes`...
  for (const t of list) {
```
And in `fetch`, coerce the resolve:
```ts
    let list: RegisteredThemeView[] = []
    try {
      const res = await window.electronAPI.invoke(IPC_CHANNELS.THEMES_LIST)
      list = Array.isArray(res) ? (res as RegisteredThemeView[]) : []
    } catch {
      list = []
    }
```

- [ ] **Step 4: Run to verify it passes.**

Run: `pnpm exec vitest run tests/unit/themes-store.test.ts`
Expected: PASS (both tests).

- [ ] **Step 5: Commit.**
```bash
git add src/renderer/src/stores/themes.ts tests/unit/themes-store.test.ts
git commit -m "fix(themes): treat non-array themes:list resolve as empty

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

### Task 1.2: Null-safe AI provider loading (product fix)

**Files:**
- Modify: `src/renderer/src/stores/ai.ts:524-546`
- Test: `tests/unit/ai-store.test.ts` (extend existing)

**Interfaces:**
- Produces: `loadProviders`/`loadConfiguredProviders` set `providers: []` (never `undefined`) and guard `.length`.

- [ ] **Step 1: Write the failing test** — add to `tests/unit/ai-store.test.ts` (match its existing electronAPI-stub pattern):
```ts
it('loadConfiguredProviders tolerates an undefined IPC resolve', async () => {
  ;(window as unknown as { electronAPI: unknown }).electronAPI = {
    invoke: async () => undefined,
    on: () => () => {},
  }
  useAIStore.setState({ providers: [], activeProvider: null })
  await expect(useAIStore.getState().loadConfiguredProviders()).resolves.toBeUndefined()
  expect(useAIStore.getState().providers).toEqual([])
})
```

- [ ] **Step 2: Run to verify it fails.**

Run: `pnpm exec vitest run tests/unit/ai-store.test.ts`
Expected: FAIL — `Cannot read properties of undefined (reading 'length')`.

- [ ] **Step 3: Implement.** In `loadProviders` and `loadConfiguredProviders`, coerce:
```ts
  loadProviders: async () => {
    const res = await window.electronAPI.invoke(IPC_CHANNELS.AI_PROVIDERS_LIST)
    set({ providers: Array.isArray(res) ? (res as AIProviderInfo[]) : [] })
  },

  loadConfiguredProviders: async () => {
    const res = await window.electronAPI.invoke(IPC_CHANNELS.AI_PROVIDERS_LIST_CONFIGURED)
    const providers = Array.isArray(res) ? (res as AIProviderInfo[]) : []
    set({ providers })
    const { activeProvider } = get()
    if (providers.length === 1 && activeProvider?.id !== providers[0].id) {
      // ...rest unchanged...
```
(`loadModels` similarly — coerce to `[]`.)

- [ ] **Step 4: Run to verify it passes.**

Run: `pnpm exec vitest run tests/unit/ai-store.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit.**
```bash
git add src/renderer/src/stores/ai.ts tests/unit/ai-store.test.ts
git commit -m "fix(ai): default provider/model lists to empty on undefined IPC resolve

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

### Task 1.3: Fix `AIStatusSegment › Popover Open` story

**Files:**
- Modify: `src/renderer/src/components/ai/AIStatusSegment.stories.tsx:8-13,62-69`

The trigger is a `StatusBarSegment` rendered as a `<div aria-haspopup="dialog" aria-label="AI status">`, not a `<button>`. Also the story's `stubElectronAPI` returns `undefined` for every channel — after Task 1.1 that no longer throws, but seed a real array to be explicit.

- [ ] **Step 1: Fix the stub** to return `[]` for arrays:
```ts
function stubElectronAPI() {
  ;(window as unknown as { electronAPI: unknown }).electronAPI = {
    invoke: async () => [],
    on: () => () => {},
  }
}
```

- [ ] **Step 2: Fix the play function** to query the trigger by its accessible name and assert the popover opens:
```ts
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const trigger = canvas.getByLabelText('AI status')
    await userEvent.click(trigger)
    // Popover content portals to document.body — assert it opened.
    await expect(await screen.findByText('AI Assistant')).toBeVisible()
  },
```
Add `screen` and `expect` to the `storybook/test` import; confirm the popover title string via `t('aiui.status.title')`'s default message (check `shared/i18n` catalogue — replace `'AI Assistant'` with the actual default if different).

- [ ] **Step 3: Run the story.**

Run: `pnpm exec vitest run --project storybook src/renderer/src/components/ai/AIStatusSegment.stories.tsx`
Expected: PASS (all 4 stories, no rejections).

- [ ] **Step 4: Commit.**
```bash
git add src/renderer/src/components/ai/AIStatusSegment.stories.tsx
git commit -m "test(story): query AIStatusSegment trigger by label, assert popover opens

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

### Task 1.4: Fix `ChatPanel › Empty` + `› With Conversation` stories

**Files:**
- Modify: `src/renderer/src/components/ai/ChatPanel.stories.tsx:8-47`

`ModelPicker` crashes on `providers.map` because the seed never sets `providers`. Seed it (belt-and-suspenders alongside the Task 1.2 store fix).

- [ ] **Step 1: Add `providers` to the seed's `setState`:**
```ts
      useAIStore.setState({
        activeModel: 'claude-opus',
        activeProvider: provider,
        providers: [provider],
        models,
        // ...rest unchanged...
```
And make the stub return `[]`:
```ts
    invoke: async () => [],
```

- [ ] **Step 2: Add a play assertion** to at least the `WithConversation` story so it's behavioral, not render-only:
```ts
export const WithConversation: Story = {
  render: seed(conversation, 42_000),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(await canvas.findByText(/12 tables/)).toBeVisible()
  },
}
```
Add `within`, `expect` to the `storybook/test` import.

- [ ] **Step 3: Run.**

Run: `pnpm exec vitest run --project storybook src/renderer/src/components/ai/ChatPanel.stories.tsx`
Expected: PASS (both stories).

- [ ] **Step 4: Commit.**
```bash
git add src/renderer/src/components/ai/ChatPanel.stories.tsx
git commit -m "test(story): seed providers for ChatPanel, assert rendered conversation

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

### Task 1.5: Fix `ContextMenu › Default` + `› Nested Targets` visibility timing

**Files:**
- Modify: `src/renderer/src/primitives/surfaces/ContextMenu.stories.tsx:2,61-72,150-157`

The menuitem is found (`findByRole` resolves) but `toBeVisible()` fails — the floating menu animates in (opacity/transform), so the assertion races the enter transition. Wrap the visibility check in `waitFor`.

- [ ] **Step 1: Import `waitFor`** — change line 2 to include it:
```ts
import { expect, fn, userEvent, screen, waitFor } from 'storybook/test'
```

- [ ] **Step 2: `Default` play** — replace the visibility assert:
```ts
    const item = await screen.findByRole('menuitem', { name: 'Open in new tab' })
    await waitFor(() => expect(item).toBeVisible())
    await userEvent.click(item)
    await expect(onOpenInNewTab).toHaveBeenCalledTimes(1)
```

- [ ] **Step 3: `NestedTargets` play** — same treatment:
```ts
    const item = await screen.findByRole('menuitem', { name: 'Column action' })
    await waitFor(() => expect(item).toBeVisible())
    await expect(screen.queryByRole('menuitem', { name: 'Table action' })).toBeNull()
```

- [ ] **Step 4: Run.**

Run: `pnpm exec vitest run --project storybook src/renderer/src/primitives/surfaces/ContextMenu.stories.tsx`
Expected: PASS (all stories).

**If still failing:** the item is genuinely hidden (not merely animating). Inspect `ContextMenu.tsx` / `menu/` core for an `opacity-0`/`data-state` enter class that never flips in headless; if so, the fix moves to the component (ensure the open state applies the visible class synchronously). Record which it was.

- [ ] **Step 5: Commit.**
```bash
git add src/renderer/src/primitives/surfaces/ContextMenu.stories.tsx
git commit -m "test(story): wait for ContextMenu enter animation before visibility assert

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

### Task 1.6: Fix `ColorInput › Default` portal query

**Files:**
- Modify: `src/renderer/src/primitives/forms/ColorInput.stories.tsx:3,29-40`

The picker renders in a `FloatingPortal` (document.body), so the `hex`/`rgb`/`hsl` buttons are outside `canvasElement`. Query `screen`, not `canvas`.

- [ ] **Step 1: Import `screen`** — change line 3:
```ts
import { fn, expect, userEvent, screen } from 'storybook/test'
```

- [ ] **Step 2: Fix the play function:**
```ts
  play: async ({ canvas }) => {
    const input = canvas.getByRole('textbox')
    await expect(input).toHaveValue('#7c6ff7')
    const swatch = canvas.getByLabelText('Pick color')
    await userEvent.click(swatch)
    // Picker panel portals to document.body — query via screen.
    await expect(await screen.findByRole('button', { name: 'hex' })).toBeVisible()
    await expect(screen.getByRole('button', { name: 'rgb' })).toBeVisible()
    await expect(screen.getByRole('button', { name: 'hsl' })).toBeVisible()
  },
```

- [ ] **Step 3: Run.**

Run: `pnpm exec vitest run --project storybook src/renderer/src/primitives/forms/ColorInput.stories.tsx`
Expected: PASS.

- [ ] **Step 4: Commit.**
```bash
git add src/renderer/src/primitives/forms/ColorInput.stories.tsx
git commit -m "test(story): query ColorInput picker portal via screen, not canvas

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

### Task 1.7: Fix `constants-single-sourced` timeout

**Files:**
- Modify: `tests/unit/audit/constants-single-sourced.test.ts:381-403`

Each `it` re-walks the whole repo tree; under full-suite CPU load it exceeds the 5000ms default. Compute the violations once and raise the timeout.

- [ ] **Step 1: Hoist the walk into `beforeAll`** so the FS scan runs once for the describe:
```ts
describe('internal id constants are single-sourced', () => {
  let hits: Hit[]
  beforeAll(async () => {
    const rules = await loadRules()
    hits = findViolations(rules)
  }, 30_000)

  it('has no raw literals at known call sites for a guarded constant set', () => {
    const fresh = hits.filter((h) => !BASELINE_ALLOWLIST.has(h.key))
    expect(fresh, /* message unchanged */).toEqual([])
  })

  it('the baseline allowlist has no stale entries', () => {
    const found = new Set(hits.map((h) => h.key))
    const stale = [...BASELINE_ALLOWLIST].filter((key) => !found.has(key))
    expect(stale, /* message unchanged */).toEqual([])
  })
  // ...regex-sanity test unchanged...
})
```
Import `beforeAll` from `vitest` if not already imported.

- [ ] **Step 2: Run under load** (whole audit dir) to confirm it holds:

Run: `pnpm exec vitest run tests/unit/audit/`
Expected: PASS, no timeout.

- [ ] **Step 3: Commit.**
```bash
git add tests/unit/audit/constants-single-sourced.test.ts
git commit -m "test(audit): compute single-sourced violations once, raise scan timeout

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

### Task 1.8: Green gate — whole suite, no rejections

- [ ] **Step 1: Run both projects.**

Run: `pnpm test 2>&1 | tail -30`
Expected: all tests pass; **zero** `Unhandled Rejection` / `themes is not iterable` blocks. If any remain, trace the story's `electronAPI` stub and apply the Task 1.1/1.3 pattern (return `[]`, not `undefined`).

- [ ] **Step 2: Typecheck.**

Run: `pnpm exec tsc -b --noEmit`
Expected: no errors.

- [ ] **Step 3: Add a changeset.**
```bash
mkdir -p .changeset
```
Create `.changeset/test-hardening.md`:
```markdown
---
"verql": patch
---

Harden theme/AI stores against non-array IPC resolves, fix 7 failing tests, and merge browser + unit coverage into one gated report.
```

- [ ] **Step 4: Commit.**
```bash
git add .changeset/test-hardening.md
git commit -m "chore(changeset): test hardening + merged coverage

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Phase 2 — Expand Storybook (play tests + stories for gaps)

This phase is **discovery-driven** — the exact files come from a live inventory, not guesswork. Follow the recipe; do not fabricate targets.

### Task 2.1: Inventory story gaps and render-only stories

**Files:**
- Create: `scratchpad/story-gaps.md` (working list, not committed)

- [ ] **Step 1: List components with no story.**

Run:
```bash
comm -23 \
  <(find src/renderer/src/components src/renderer/src/primitives -name '*.tsx' ! -name '*.stories.tsx' ! -name '*.test.tsx' | sed 's/\.tsx$//' | sort) \
  <(find src/renderer/src -name '*.stories.tsx' | sed 's/\.stories\.tsx$//' | sort)
```
Record the list. Exclude pure-glue/trivial wrappers, index barrels, and context/provider-only files — story the ones a user visibly interacts with.

- [ ] **Step 2: List render-only stories** (stories with no `play:`):
```bash
for f in $(find src/renderer/src -name '*.stories.tsx'); do grep -Lq 'play:' "$f" && echo "$f"; done
```
Record. These are Phase 2's play-test targets.

- [ ] **Step 3: Rank both lists** by component importance (interactive surfaces first: forms, menus, dialogs, panels). Write the ranked worklist to `scratchpad/story-gaps.md`.

### Task 2.2 (repeatable recipe): Add a play test to a render-only story

For EACH render-only story chosen from the worklist, in its own commit:

- [ ] **Step 1: Read the component** to find its accessible affordances (roles, labels, callbacks). **Verify every prop via Storybook MCP** (`get-documentation` for that component) before using it.

- [ ] **Step 2: Add a `play` that interacts and asserts an observable outcome.** Exemplar (button that fires a callback):
```ts
import { expect, fn, userEvent, within } from 'storybook/test'

export const Clickable: Story = {
  args: { onClick: fn(), children: 'Save' },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Save' }))
    await expect(args.onClick).toHaveBeenCalledTimes(1)
  },
}
```
Rules: assert roles/text/callbacks, never internal classNames. For portalled UI (menus, popovers, pickers) query `screen`, not `canvas`. Wrap post-animation visibility in `waitFor`. Any component reading themes/AI must have `electronAPI.invoke` returning `[]` (never `undefined`).

- [ ] **Step 3: Run just that story.**

Run: `pnpm exec vitest run --project storybook <path-to-stories>`
Expected: PASS.

- [ ] **Step 4: Commit** `test(story): add interaction test for <Component>`.

### Task 2.3 (repeatable recipe): Author a story for an un-storied component

For EACH gap component chosen from the worklist, in its own commit:

- [ ] **Step 1: Verify props via Storybook MCP** (`list-all-documentation` → `get-documentation`). Read the component for required props and callbacks.

- [ ] **Step 2: Write `<Component>.stories.tsx`** next to the component, following an existing sibling story's structure (Meta with `title: 'Components/…'`/`'Primitives/…'`, a default render, meaningful variant stories, and at least one `play`). Reuse the app `ThemeProvider` (supplied by `.storybook/preview.tsx` — don't re-wrap). Provide any store/IPC seed the component needs (stub `electronAPI.invoke` → `[]`).

- [ ] **Step 3: Run it** (`pnpm exec vitest run --project storybook <path>`), then `run-story-tests` MCP for a11y.
Expected: PASS.

- [ ] **Step 4: Commit** `test(story): add stories for <Component>`.

### Task 2.4: Fan-out execution note

Dispatch Task 2.2/2.3 instances to parallel subagents **by disjoint directory** (e.g. one agent per `components/<subdir>`), Sonnet/Haiku tier for mechanical authoring. Each agent touches a non-overlapping file set and runs ONLY its own story files (`pnpm exec vitest run --project storybook <its files>`), never the full suite in a shared worktree. The orchestrator runs the full storybook project once at the end.

---

## Phase 3 — Combined coverage to ~90% with behavioral tests

Also discovery-driven. Targets come from the merged report, ranked by uncovered lines × module importance.

### Task 3.1: Rank the coverage gap

**Files:**
- Create: `scratchpad/coverage-gaps.md` (working list)

- [ ] **Step 1: Regenerate the merged report** (`pnpm test:coverage`), then rank the lowest-covered files that carry real logic:
```bash
python3 -c "
import json
d = json.load(open('coverage/coverage-summary.json'))
rows = []
for p, m in d.items():
    if p == 'total': continue
    ls = m['lines']
    uncovered = ls['total'] - ls['covered']
    rows.append((uncovered, round(ls['pct'],1), p))
rows.sort(reverse=True)
for u, pct, p in rows[:60]:
    print(f'{u:5d} uncovered  {pct:5}%  {p}')
"
```
Write the ranked list to `scratchpad/coverage-gaps.md`. Split into **pure logic** (`lib/`, `stores/`, `shared/`, `src/main/**` — unit-test targets) vs **interactive UI** (`components/`, `primitives/` — story/play targets, feed back into Phase 2).

- [ ] **Step 2: Skip the un-assertable.** Do NOT chase coverage on entry points already excluded (`main.tsx`, `src/preload/**`), generated barrels, or type-only files. If a file is genuinely not worth asserting, leave it — honest 88% beats padded 90%.

### Task 3.2 (repeatable recipe): Behavioral unit test for a logic module

For EACH pure-logic target, in its own commit:

- [ ] **Step 1: Read the module.** Identify its public functions, branches, and edge cases (empty input, error path, boundary values).

- [ ] **Step 2: Write behavioral tests** asserting real outcomes for the happy path AND each meaningful branch. Exemplar (a pure helper):
```ts
import { describe, it, expect } from 'vitest'
import { formatCompactNumber } from '@/lib/format'

describe('formatCompactNumber', () => {
  it('leaves small numbers untouched', () => {
    expect(formatCompactNumber(42)).toBe('42')
  })
  it('abbreviates thousands', () => {
    expect(formatCompactNumber(12_400)).toBe('12.4K')
  })
  it('abbreviates millions', () => {
    expect(formatCompactNumber(3_500_000)).toBe('3.5M')
  })
})
```
Rules: one behavior per `it`; assert the return value / observable effect, not that a function "ran". Each test must FAIL if you break the branch it covers — verify by mentally (or actually) mutating the source. Stores: drive through public actions and assert resulting state (see `tests/unit/ai-store.test.ts`, `tests/unit/tabs-store.test.ts` for the setState/getState pattern). Main subsystems: follow the existing `tests/unit/*.test.ts` mocking conventions.

- [ ] **Step 3: Run the file.**

Run: `pnpm exec vitest run <test-file>`
Expected: PASS.

- [ ] **Step 4: Commit** `test(<area>): cover <module> behavior`.

### Task 3.3: Ratchet the floor upward

- [ ] **Step 1: After each batch**, regenerate merged coverage and raise the four `vitest.config.ts` thresholds to the new (rounded-down) floor. Never let them sit far below actual — that re-opens the ratchet.

- [ ] **Step 2: Final pin.** When behavioral tests plateau, pin the floor at the honestly reached number. If that's ≥90%, great; if it's e.g. 88.x with the remaining gap being genuinely un-assertable UI/entry code, pin there and note *why* in the `vitest.config.ts` comment and `docs/testing.md` (no padding to hit a round number).

- [ ] **Step 3: Commit** `test(coverage): ratchet floor to <n>%`.

### Task 3.4: Fan-out execution note

Same discipline as Task 2.4: parallel subagents by disjoint directory, mechanical tier, each running only its own new test files. Orchestrator runs `pnpm test:coverage` once per batch to re-rank and re-pin. Reject any subagent output whose tests render/call without asserting.

---

## Phase 4 — Docs

### Task 4.1: Write `docs/testing.md`

**Files:**
- Create: `docs/testing.md`
- Modify: `CLAUDE.md` (Testing section)
- Modify: `vitest.config.ts` (comment — already touched in 0.2; ensure it points at the doc)

- [ ] **Step 1: Write `docs/testing.md`** covering: the two Vitest projects (`unit` jsdom vs `storybook` Chromium) and when to use each; the **merged coverage** model + `pnpm test:coverage` + which provider (from Task 0.1); how to write a behavioral unit test (assert outcomes, one behavior per `it`, must-fail-when-broken); how to write a Storybook **play** test (`storybook/test`, `screen` for portals, `waitFor` for animations, `electronAPI` stub → `[]`); the **ratchet** policy; running single files (`pnpm exec vitest run <file>`); and the local test-DB harness (`scripts/test-dbs.sh`). Match the tone/structure of existing `docs/*.md`.

- [ ] **Step 2: Update CLAUDE.md's Testing section** to summarize the merged-coverage change and link to `docs/testing.md`. Add a bullet to the docs index list near the top if that's the repo convention.

- [ ] **Step 3: Commit.**
```bash
git add docs/testing.md CLAUDE.md vitest.config.ts
git commit -m "docs(testing): document two projects, merged coverage, and test-writing guide

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

### Task 4.2: Mirror into the docs site

**Files:**
- Create: `site/src/content/docs/<section>/testing.md` (match the site's existing dev-docs structure — inspect `site/src/content/docs/` first)

- [ ] **Step 1: Add the site counterpart** of `docs/testing.md`, adapted to Starlight frontmatter (title/description) like its siblings.

- [ ] **Step 2: Verify the site builds** (if quick): `pnpm --dir site build` or the repo's documented site build; otherwise at minimum confirm frontmatter matches a sibling page.

- [ ] **Step 3: Commit.**
```bash
git add site/
git commit -m "docs(site): add testing guide counterpart

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review notes (author)

- **Spec coverage:** Phase 0 ↔ merged-coverage enabler; Phase 1 ↔ 7 failures + themes noise (Tasks 1.1–1.8 map 1:1 to the spec's failure list); Phase 2 ↔ "expand storybook, both"; Phase 3 ↔ "combined coverage ~90% genuine tests"; Phase 4 ↔ new `docs/testing.md` + CLAUDE.md + site. All spec sections have tasks.
- **Discovery phases (2, 3)** are intentionally recipe-shaped with real exemplar code, not fabricated per-file tasks — the actual targets come from the live inventory/coverage report per the "no made-up tests" constraint. Every recipe carries runnable exemplar code and a run/commit cycle.
- **Type consistency:** store fields referenced (`providers`, `activeProvider`, `models`, `sessionStats`, `permissionProfile`) match `stores/ai.ts`; `RegisteredThemeView`, `injectThemes`, `fetch`, `THEMES_LIST` match `stores/themes.ts`. Story imports (`screen`, `waitFor`, `within`, `expect`, `fn`, `userEvent`) are all from `storybook/test`.
- **Verify-at-execution flags:** popover title string (Task 1.3 Step 2) and the ContextMenu animation-vs-hidden branch (Task 1.5) are marked to confirm against source during execution.
