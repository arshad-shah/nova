---
title: Testing
description: Verql's two Vitest projects (unit jsdom and Storybook Chromium), the merged istanbul coverage report and its ratchet, and how to write behavioral unit tests versus Storybook play tests.
sidebar:
  order: 10
---

Verql runs tests through **Vitest**, split into two projects that share one
config (`vitest.config.ts`) and one **merged** coverage report.

| Project     | Environment              | Tests                         | Purpose |
|-------------|--------------------------|-------------------------------|---------|
| `unit`      | jsdom / Node             | `tests/unit/**/*.test.ts(x)`  | Pure logic, stores, main-process subsystems, IPC contracts |
| `storybook` | real Chromium (Playwright) | `src/**/*.stories.tsx` play fns | Components rendered and driven in a real browser |

`pnpm test` runs both. `pnpm test:coverage` runs both **with coverage** and
merges them into a single report.

## When to use which project

- **`unit`** — anything that isn't a rendered component's behaviour: helpers in
  `lib/`, Zustand `stores/`, `shared/`, and every `src/main/` subsystem
  (adapters, plugin host, SDK registries, AI providers, IPC handler logic,
  config store, keyring). jsdom is fast and gives you `window`/DOM without a
  browser.
- **`storybook`** — a component's behaviour when actually rendered: clicks,
  focus, portals, popovers, form input, keyboard nav. These run in Chromium via
  `@storybook/addon-vitest`. Every `*.stories.tsx` with a `play` function is a
  test.

Rule of thumb: **if the assertion is about DOM a user interacts with, it's a
Storybook play test; otherwise it's a unit test.**

## Running tests

```bash
pnpm test                              # both projects
pnpm exec vitest run <file>            # ONE file (not `pnpm test -- --run`,
                                       # which runs the whole suite)
pnpm exec vitest run --project storybook <file>   # a story file (starts Chromium)
pnpm test:coverage                     # both projects, merged coverage report
pnpm storybook                         # interactive Storybook on :6006
```

## Coverage

Coverage is collected from **both** projects and **merged**, so a component
exercised only by its stories still counts — gating on `unit` alone understated
real coverage badly.

**Provider: istanbul, not v8.** Vitest's v8 provider races on its per-worker
temp files when a browser project and a node project report in the same run;
istanbul instruments the source and merges both cleanly.

### The ratchet

`coverage.thresholds` is a **floor, not a goal**. CI fails if any metric drops
below it. When you add tests that raise coverage, **raise the floor in the same
PR**. A threshold is not a target: percentage is trivially gamed by tests that
render code without asserting anything. Prefer fewer tests that *fail when the
logic breaks*. A padded 90% is worse than an honest 80%.

## Writing a behavioural unit test

Drive the public API and assert the observable outcome — return value, resulting
store state, or the call made to a mocked dependency. One behaviour per `it`;
cover the happy path **and** each meaningful branch. The renderer's
`window.electronAPI.invoke` is stubbed; main-process Node dependencies are mocked
with `vi.mock`/`vi.spyOn` (network providers mock `globalThis.fetch`).

## Writing a Storybook play test

A `play` function runs after the story mounts in Chromium; import utilities from
`storybook/test`. Gotchas learned from real failures:

- **Portals** (menus, popovers, pickers, dialogs) render into `document.body`,
  outside `canvasElement` — query them with `screen`, not `within(canvasElement)`.
- **Animations** — wrap a post-enter `toBeVisible()` in `waitFor(...)` so it
  doesn't race the transition.
- **Accessible queries** — assert by role/label/text, never by className.
- **IPC stub** — Storybook has no preload bridge; contribution-list channels must
  resolve `[]`, never `undefined`.
- **Props** — verify component props against the Storybook docs before using
  them; don't guess prop names.
