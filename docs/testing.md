# Testing

Verql runs tests through **Vitest**, split into two projects that share one
config (`vitest.config.ts`) and one **merged** coverage report:

| Project     | Environment                         | Tests                              | Purpose |
|-------------|-------------------------------------|------------------------------------|---------|
| `unit`      | jsdom / Node                        | `tests/unit/**/*.test.ts(x)`       | Pure logic, stores, main-process subsystems, IPC contracts |
| `storybook` | real Chromium (Playwright)          | `src/**/*.stories.tsx` (play fns)  | Components rendered and driven in a real browser |

`pnpm test` runs both. `pnpm test:coverage` runs both **with coverage** and
merges them into a single report (see [Coverage](#coverage)).

## When to use which project

- **`unit`** — anything that isn't a React component's rendered behaviour:
  helpers in `lib/`, Zustand `stores/`, `shared/`, and every `src/main/`
  subsystem (adapters, plugin host, SDK registries, AI providers, IPC handler
  logic, config store, keyring). jsdom gives you `window`/DOM without a browser,
  so it's fast.
- **`storybook`** — a component's behaviour when actually rendered: clicks,
  focus, portals, popovers, form input, keyboard nav. These run in Chromium via
  the `@storybook/addon-vitest` integration, so what you assert is what a user
  would see. Every `*.stories.tsx` with a `play` function is a test.

Rule of thumb: **if the assertion is about DOM a user interacts with, it's a
Storybook play test; otherwise it's a unit test.**

## Running tests

```bash
pnpm test                              # both projects
pnpm exec vitest run <file>            # ONE file (unit or story). Do NOT use
                                       # `pnpm test -- --run <file>` — that runs
                                       # the WHOLE suite.
pnpm exec vitest run --project unit <file>        # a unit file
pnpm exec vitest run --project storybook <file>   # a story file (starts Chromium)
pnpm test:coverage                     # both projects, merged coverage report
pnpm storybook                         # interactive Storybook on :6006
```

## Coverage

Coverage is collected from **both** projects and **merged** into one report, so
a component exercised only by its stories still counts. This matters: roughly
half the renderer is behavioural UI covered by Storybook, not unit tests —
gating on `unit` alone understated real coverage badly.

**Provider: istanbul, not v8.** Vitest's v8 coverage provider races on its
per-worker `.tmp/coverage-*.json` files when a browser project and a node
project report in the same run (an `ENOENT` crash during the merge). istanbul
instruments the source and merges the two projects cleanly, so we use it
globally (`coverage.provider: 'istanbul'` in `vitest.config.ts`).

```bash
pnpm test:coverage        # writes ./coverage (html + json-summary + text-summary)
open coverage/index.html  # browse the merged report
```

### The ratchet

`coverage.thresholds` in `vitest.config.ts` is a **floor, not a goal**. CI fails
if any metric drops below it. When you add tests that raise coverage, **raise
the floor in the same PR** so it can never silently slide back. Pin the floor a
touch below the measured number to absorb browser-timing variance run-to-run;
never pin above what a green run sustains.

**A threshold is not a target.** Percentage is trivially gamed by tests that
render code without asserting anything. Prefer fewer tests that *fail when the
logic breaks* over many that only execute lines. A padded 90% is worse than an
honest 80%.

## Writing a behavioural unit test

Drive the public API and assert the observable outcome — the return value, the
resulting store state, or the call made to a mocked dependency. One behaviour
per `it`; cover the happy path **and** each meaningful branch (empty input,
error path, boundary).

```ts
import { describe, it, expect, vi } from 'vitest'
import { useAIStore } from '@/stores/ai'

it('loadConfiguredProviders tolerates an undefined IPC resolve', async () => {
  ;(window as unknown as { electronAPI: unknown }).electronAPI = {
    invoke: async () => undefined,
    on: () => () => {},
  }
  useAIStore.setState({ providers: [], activeProvider: null })
  await useAIStore.getState().loadConfiguredProviders()
  expect(useAIStore.getState().providers).toEqual([]) // fails if the guard regresses
})
```

The renderer talks to the main process over `window.electronAPI.invoke`; unit
tests stub it (assign `window.electronAPI` or `vi.stubGlobal('window', …)` — see
`tests/unit/ai-store.test.ts`). Main-process code is imported directly and its
Node dependencies mocked with `vi.mock`/`vi.spyOn` (network providers mock
`globalThis.fetch` — see `tests/unit/ai-provider-openai.test.ts`).

## Writing a Storybook play test

A `play` function runs after the story mounts in Chromium. Import test utilities
from `storybook/test`.

```ts
import { expect, fn, userEvent, within, screen, waitFor } from 'storybook/test'

export const Clickable: Story = {
  args: { onClick: fn(), children: 'Save' },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Save' }))
    await expect(args.onClick).toHaveBeenCalledTimes(1)
  },
}
```

Gotchas, all learned from real failures:

- **Portals** — menus, popovers, pickers, dialogs render into `document.body`
  via a `FloatingPortal`, *outside* `canvasElement`. Query them with `screen`,
  not `within(canvasElement)`.
- **Animations** — a floating element animates in (opacity/transform), so a
  `toBeVisible()` assertion can race the enter transition. Wrap it:
  `await waitFor(() => expect(item).toBeVisible())`.
- **Accessible queries** — assert by role/label/text, never by className. A
  trigger might be a `<div aria-haspopup>` rather than a `<button>`; query it by
  its accessible name (`getByLabelText`), not `getByRole('button')`.
- **IPC stub** — Storybook has no preload bridge. `.storybook/preview.tsx` stubs
  `window.electronAPI`; if a story installs its own stub, return `[]` (never
  `undefined`) for contribution-list channels so stores that iterate the result
  don't throw.
- **Props** — verify a component's props against the Storybook MCP docs
  (`your-project-sb-mcp`: `list-all-documentation` → `get-documentation`) before
  using them. Do not guess prop names.

## Local test databases

To validate connections against every native + bundled driver, spin up seeded
databases:

```bash
scripts/test-dbs.sh up      # Postgres/MySQL/Mongo/Redis containers, seeded
scripts/test-dbs.sh sqlite  # build docker/testdb.sqlite
scripts/test-dbs.sh status  # what's running
scripts/test-dbs.sh down    # stop
```

Hosts, ports, and credentials live in [`docker/README.md`](../docker/README.md).

## Typecheck

`pnpm test` uses esbuild and does **not** typecheck. Before claiming done, run:

```bash
pnpm exec tsc -b --noEmit
```
