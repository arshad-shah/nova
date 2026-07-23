# Test hardening, merged coverage to 90%, and a testing doc

**Date:** 2026-07-23
**Branch:** `test/coverage-storybook-hardening`
**Status:** Approved design

## Problem

The repo has two Vitest projects — `unit` (jsdom, 298 files) and `storybook`
(real Chromium via Playwright, 159 story files). Three things are wrong:

1. **7 tests fail.** 6 in the storybook project (stale assertions + missing
   seed data + portal/positioning), 1 in the unit project (an audit test that
   times out at 5000ms).
2. **The run is polluted by ~45 unhandled rejections**, almost all
   `themes is not iterable` at `stores/themes.ts:86` (a few `stores/ai.ts:535`).
   Root cause: the theme/AI stores call `injectThemes(await invoke(...))` but
   the IPC stub resolves `undefined` for some stories, and the stores' `catch`
   only guards rejections — not an `undefined` resolve. This threatens
   flakiness even where tests currently pass.
3. **Coverage is understated and low.** CI gates on the `unit` project only
   (`test:coverage` runs `--project unit`), so every renderer component that is
   exercised by stories but not by a unit test counts as uncovered. The pinned
   floor is statements 58.4 · branches 53.3 · functions 51.1 · lines 60.1.

## Goal

- All tests green, no unhandled rejections in either project.
- Coverage **collected from both projects and merged**, then raised as close to
  **90%** as *genuine behavioral tests* allow. No coverage-padding — tests must
  fail when the logic breaks, never render-without-assert to move a number.
- Storybook expanded: play/interaction assertions on render-only stories, and
  new stories for un-storied components.
- A new `docs/testing.md` documenting the whole testing model, kept in sync with
  CLAUDE.md and `site/`.

## Non-goals

- No product feature work beyond the small robustness fixes the failing tests
  expose (theme/AI store null-safety).
- No migration off Vitest/Storybook/Playwright; versions stay put
  (vitest 4.1.8, storybook 10.3.5).
- Not chasing 100%; 90% is the aim, the honest reached number is the floor.

## Design

### Phase 0 — Merged-coverage infrastructure (the enabler)

Everything downstream is measured against a merged report, so this comes first.

- Verify `@vitest/coverage-v8@4.1.8` emits coverage from the Chromium browser
  project. Vitest 4 supports v8 browser coverage over CDP; the `storybook`
  project already `extends: true`, so it inherits the root `coverage` block.
- Replace `test:coverage` (`vitest run --project unit --coverage`) with a
  root-level `vitest run --coverage` that runs **both** projects and merges into
  one v8 report. Keep the existing `include`/`exclude`.
- Capture the **true combined baseline** and re-pin the `vitest.config.ts`
  thresholds + rewrite the explanatory comment (it currently says storybook is
  "not counted" — that stops being true).

**Risk / spike:** if v8 browser coverage proves unreliable, fall back to
istanbul for the browser project only, still merged. Resolve this in Phase 0
before building on it. Log the decision in the plan.

### Phase 1 — Fix the 7 failures + eliminate the `themes` noise

Robustness fixes (product code, not just tests):

- `stores/themes.ts` — `fetch()` must treat a non-array/`undefined` IPC resolve
  as `[]`; `injectThemes` must be null-safe. This is the correct product
  behavior, not a test workaround.
- `stores/ai.ts:loadConfiguredProviders` — same null-safety on the provider
  list before `.length`/`.map`.
- Story mock (`.storybook/preview.tsx` and any per-story `electronAPI` mocks in
  AI stories) — `themes:list` must never resolve `undefined`.

Stale-assertion / test fixes:

- `AIStatusSegment › Popover Open` — assert against the real trigger
  (`aria-haspopup="dialog"` element / role `dialog` after open), not
  `getByRole('button')`.
- `ChatPanel › Empty` + `› With Conversation` — seed providers so `ModelPicker`
  renders instead of crashing on `providers.map`.
- `ContextMenu › Default` + `› Nested Targets` — `await` menu positioning;
  query the menuitem via `screen.findByRole` + `waitFor(toBeVisible)` to allow
  floating-ui to place the portal in headless Chromium.
- `ColorInput › Default` — the picker panel portals outside `canvasElement`;
  query `screen`, not `within(canvasElement)`.
- `audit/constants-single-sourced.test.ts` — raise that test's `testTimeout`
  and/or speed the filesystem scan so it doesn't time out at 5000ms.

Exit criterion: both projects green, zero unhandled rejections.

### Phase 2 — Expand storybook (play tests + stories for gaps)

- Inventory renderer components with no `*.stories.tsx`; author stories for the
  meaningful ones (skip pure-glue/trivial wrappers).
- Turn render-only stories into behavioral **play** tests: interact and assert
  observable outcomes (roles, text, callbacks), following existing story
  conventions and the `your-project-sb-mcp` documented props (never invent
  props — verify via the Storybook MCP docs per CLAUDE.md).

### Phase 3 — Combined coverage to ~90% with behavioral tests

- Rank lowest-covered modules from the merged report.
- Pure logic (`lib/`, `stores/`, `shared/`, `src/main/**` subsystems) → behavioral
  unit tests that assert real outcomes and edge cases.
- Interactive UI → play tests (Phase 2 machinery).
- Ratchet `vitest.config.ts` thresholds upward as coverage climbs; pin the final
  floor at the honestly reached number (target ≥90%), never above what green
  tests sustain.

### Phase 4 — Docs

- New `docs/testing.md`: the two projects and when to use each, the merged
  coverage model + how to run it, how to write a behavioral unit test vs a
  storybook play test, the ratchet policy, and the local test-DB story.
- Update CLAUDE.md's **Testing** section to point at it and reflect merged
  coverage; rewrite the `vitest.config.ts` coverage comment.
- Mirror into `site/src/content/docs/` per the repo's "update the doc in the
  same change" rule.

## Execution model

- Phases 0–1 done carefully and serially (correctness-critical, product code).
- Phases 2–3 fan out to parallel agents by **disjoint directory** — Sonnet/Haiku
  for mechanical test authoring, one agent per non-overlapping file set, no agent
  running the full suite in a shared worktree (per project workflow prefs).
- Every new test must fail when the code under test breaks. Reject any test
  written only to move the coverage number.

## Success criteria

- `pnpm test` green; no unhandled rejections in either project.
- Merged coverage collected in CI; floor re-pinned at the reached number,
  targeting ≥90% across statements/branches/functions/lines.
- New stories + play tests added; render-only stories given real assertions.
- `docs/testing.md` written; CLAUDE.md, `vitest.config.ts` comment, and `site/`
  updated in sync.
