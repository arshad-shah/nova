---
"verql": patch
---

Testing: turn coverage into a ratchet that CI enforces.

`@vitest/coverage-v8` was already a dependency but had never been configured, so
coverage had never been measured and nothing stopped a change from lowering it.
The unit project now reports coverage through `pnpm test:coverage`, and CI runs
that instead of a bare `vitest run --project unit`.

`vitest.config.ts` gains a `coverage` block whose `thresholds` are pinned to the
measured floor rather than to an aspiration: statements 33.5, branches 28.9,
functions 28.4, lines 35.3 (measured 2026-07-17 across 1646 passing tests in 180
files). CI fails below the floor, so coverage can only go up; raising it means
raising the floor in the same PR. Verified by temporarily demanding 40% and
confirming a non-zero exit and an explicit threshold error.

Two things the numbers do not say, both noted in the config so the next reader
doesn't misread them. The floor covers the `unit` project only — the `storybook`
project renders components in a real browser and isn't counted, so component
percentages understate reality. And a threshold is a ratchet, not a goal:
percentage is trivially satisfied by tests that render code without asserting
behaviour, so the floor exists to prevent regression, not to be chased.

`src/preload/**` and the renderer bootstrap are excluded — entry points with no
logic worth asserting.
