# Primitive Full-Adoption + Anti-Drift Guardrail Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Drive out the remaining manual styling in `src/renderer/src/components/**`, add the few derived tokens/helpers the recurring raw patterns need, and lock it in with a Vitest guardrail so appearance stays fully theme-owned.

**Architecture:** Keep the existing (mature, ~85%-adopted) primitive set. Add a *derived* decorative-color token ramp + a single `themeColor()` helper (both in `primitives/theme/`), migrate the concentrated set of offender files to tokens/primitives, then add a source-scanning Vitest test (modeled on `tests/unit/audit/main-orchestrator-purity.test.ts`) that fails CI on raw hex, raw Tailwind palette classes, and static-appearance inline styles — with a justified allowlist for sanctioned escapes.

**Tech Stack:** React 19, TypeScript, Tailwind (token-driven), CVA primitives, CSS custom properties (three-layer theming in `primitives/theme/tokens.css`), `@arshad-shah/swift-chart` (charts), `@xyflow/react` (ER), Vitest.

## Global Constraints

- **Themes must all keep working** — built-in (`lab, inkpaper, dark, light, midnight, dracula, nord, solarized, catppuccin`) *and* any user-added theme. New color tokens MUST be **derived** in the base `:root` of `tokens.css` from tokens every theme already defines (`--color-accent`, `--color-accent-emphasis`, `--color-success`, `--color-warning`, `--color-error`), never hand-authored per theme.
- **DB-agnostic language** — no "SQL"/relational nouns in user-facing strings (not expected to arise here, but holds).
- **No new lint toolchain** — the guardrail is a Vitest test, not ESLint.
- **Allowed inline styles:** dynamic/runtime values (`width: size`, `transform`, `marginLeft: depth*24`). **Banned:** static color/appearance literals.
- **User-data colors** (a connection's chosen color) may use a concrete hex **default constant**, but that constant lives in one place and is on the guardrail allowlist.
- **Changeset required** — add a `.changeset/*.md` (minor, pre-1.0) for this work.
- **Typecheck** — run `pnpm exec tsc -b --noEmit` before done; `pnpm test` (esbuild) skips typechecking.
- **Verify commands:** single test file → `pnpm test -- --run tests/unit/<file>`; full suite → `pnpm test`.
- Work happens on branch `feat/primitive-adoption-guardrail` (already created; design doc + swift-chart bump already committed there).

---

## File Structure

**Create:**
- `src/renderer/src/primitives/theme/theme-color.ts` — the shared `themeColor()` / `readThemeColors()` helper for canvas/SVG contexts.
- `src/renderer/src/primitives/theme/theme-color.stories.tsx` — story documenting the decorative ramp + helper.
- `src/renderer/src/lib/connection-color.ts` — `DEFAULT_CONNECTION_COLOR` constant (user-data default).
- `tests/unit/theme/decorative-tokens.test.ts` — asserts every theme resolves the core source tokens the ramp derives from.
- `tests/unit/audit/no-manual-styling.test.ts` — the guardrail scanner.
- `.changeset/primitive-adoption-guardrail.md` — changeset.

**Modify:**
- `src/renderer/src/primitives/theme/tokens.css` — add derived `--color-decorative-1..8` in base `:root`.
- `src/renderer/src/components/charts/ChartView.tsx` — use shared helper.
- `src/renderer/src/components/er/ERDiagram.tsx` — use shared helper.
- `src/renderer/src/components/query-plan/PlanNode.tsx` — contrast text → token.
- `src/renderer/src/components/plugins/PluginIcon.tsx` — gradients → decorative tokens.
- `src/renderer/src/components/query/ConnectionSelector.tsx` — dot default → `var(--color-accent)`.
- `src/renderer/src/components/connections/ConnectionFormView.tsx` — default hex → `DEFAULT_CONNECTION_COLOR`.
- `src/renderer/src/components/ai/MCPApprovalDialog.tsx`, `plugins/PluginsPanel.tsx`, `shell/ActivityBar.tsx`, `ai/SchemaAutocomplete.tsx`, `shell/ConnectionSwitcher.tsx`, `shell/WindowControls.tsx`, `settings/categories/AppearanceSettings.tsx` — palette classes / raw hex → tokens.
- `CLAUDE.md`, `docs/architecture.md`, `docs/diagrams.md`, `docs/guide/exploring-schema.md`, `site/src/content/docs/guide/exploring-schema.md` — Recharts → swift-chart.

---

## Task 1: Derived decorative token ramp (W1a)

**Files:**
- Modify: `src/renderer/src/primitives/theme/tokens.css` (base `:root`, after `--color-info` at line ~154)
- Test: `tests/unit/theme/decorative-tokens.test.ts`

**Interfaces:**
- Produces: CSS custom properties `--color-decorative-1` … `--color-decorative-8` on `:root`, each resolving to a `var()`/`color-mix()` expression over guaranteed semantic tokens.

- [ ] **Step 1: Write the failing test**

The theme CSS blocks live in `src/main/plugins/bundled/core-themes/themes-data.ts` as `*_CSS` string constants and a `THEMES` array (`{ id, name, type, css, ... }`). This test asserts (a) the base `tokens.css` declares all 8 decorative tokens, and (b) every theme defines the 5 source tokens the ramp derives from, so no theme can silently break the ramp.

Create `tests/unit/theme/decorative-tokens.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const ROOT = path.join(__dirname, '..', '..', '..')
const TOKENS = path.join(ROOT, 'src', 'renderer', 'src', 'primitives', 'theme', 'tokens.css')
const THEMES = path.join(ROOT, 'src', 'main', 'plugins', 'bundled', 'core-themes', 'themes-data.ts')

// Tokens every theme must define; the decorative ramp derives from these.
const SOURCE_TOKENS = [
  '--color-accent',
  '--color-accent-emphasis',
  '--color-success',
  '--color-warning',
  '--color-error',
]

describe('decorative token ramp', () => {
  it('declares 8 decorative tokens in base tokens.css', () => {
    const css = fs.readFileSync(TOKENS, 'utf-8')
    for (let i = 1; i <= 8; i++) {
      expect(css, `missing --color-decorative-${i}`).toContain(`--color-decorative-${i}:`)
    }
  })

  it('every *_CSS theme block defines all source tokens', () => {
    const src = fs.readFileSync(THEMES, 'utf-8')
    // Each theme is a `const XXX_CSS = \`...\`` template literal.
    const blocks = [...src.matchAll(/const\s+(\w+_CSS)\s*=\s*`([\s\S]*?)`/g)]
    expect(blocks.length, 'found no *_CSS theme blocks').toBeGreaterThan(5)
    for (const [, name, body] of blocks) {
      for (const token of SOURCE_TOKENS) {
        expect(body.includes(`${token}:`), `${name} is missing ${token}`).toBe(true)
      }
    }
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- --run tests/unit/theme/decorative-tokens.test.ts`
Expected: FAIL on "declares 8 decorative tokens" (`--color-decorative-1:` not found). The second test may already pass — that is fine; the first proves the token work is needed.

- [ ] **Step 3: Add the derived ramp to tokens.css**

In `src/renderer/src/primitives/theme/tokens.css`, immediately after the `--color-info: var(--raw-blue-500);` line (~line 154) inside the base `:root`, add:

```css
  /* Decorative — derived, theme-agnostic ramp for deterministic/generated
     coloring (plugin icons, avatars, charts). Built from tokens every theme
     already defines, so all built-in AND user-added themes get a coherent
     ramp for free. A theme MAY override these for bespoke hues, but never
     has to. Do not hand-author per theme. */
  --color-decorative-1: var(--color-accent);
  --color-decorative-2: var(--color-accent-emphasis);
  --color-decorative-3: var(--color-success);
  --color-decorative-4: var(--color-warning);
  --color-decorative-5: var(--color-error);
  --color-decorative-6: color-mix(in oklab, var(--color-accent), var(--color-success) 50%);
  --color-decorative-7: color-mix(in oklab, var(--color-accent-emphasis), var(--color-warning) 50%);
  --color-decorative-8: color-mix(in oklab, var(--color-accent), var(--color-error) 45%);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- --run tests/unit/theme/decorative-tokens.test.ts`
Expected: PASS (both tests).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/primitives/theme/tokens.css tests/unit/theme/decorative-tokens.test.ts
git commit -m "feat(theme): derived decorative color token ramp

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Shared `themeColor()` helper (W1b)

**Files:**
- Create: `src/renderer/src/primitives/theme/theme-color.ts`
- Test: `tests/unit/theme/theme-color.test.ts`

**Interfaces:**
- Produces:
  - `themeColor(name: string): string` — reads a CSS custom property off `document.documentElement`, returns the trimmed value (empty string if unset).
  - `readThemeColors<T extends Record<string, string>>(map: T): { [K in keyof T]: string }` — resolves a map of `{ key: cssVarName }` to `{ key: resolvedColor }`.
  - `decorativeColor(index: number): string` — resolves `--color-decorative-N`, 1-based, wrapping with modulo over 8.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/theme/theme-color.test.ts` (jsdom project — `document` is available):

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { themeColor, readThemeColors, decorativeColor } from '@/primitives/theme/theme-color'

beforeEach(() => {
  document.documentElement.style.setProperty('--color-accent', '#123456')
  document.documentElement.style.setProperty('--color-decorative-1', '#aabbcc')
})

describe('themeColor', () => {
  it('reads a CSS custom property value', () => {
    expect(themeColor('--color-accent')).toBe('#123456')
  })

  it('returns empty string for an unset property', () => {
    expect(themeColor('--nope-not-set')).toBe('')
  })

  it('resolves a map of vars', () => {
    expect(readThemeColors({ a: '--color-accent' })).toEqual({ a: '#123456' })
  })

  it('resolves decorative colors 1-based with wraparound', () => {
    expect(decorativeColor(1)).toBe('#aabbcc')
    expect(decorativeColor(9)).toBe('#aabbcc') // wraps to 1
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- --run tests/unit/theme/theme-color.test.ts`
Expected: FAIL — cannot resolve `@/primitives/theme/theme-color`.

- [ ] **Step 3: Implement the helper**

Create `src/renderer/src/primitives/theme/theme-color.ts`:

```ts
// Single source of truth for reading theme colors as *strings*, for
// canvas/SVG contexts (swift-chart, @xyflow/react) that cannot consume a
// Tailwind className. Reads live CSS custom properties, so callers that
// re-read on theme change automatically re-theme. This is the sanctioned
// escape hatch from "use a token class" — it is on the guardrail allowlist.

/** Read a single CSS custom property off the document root. */
export function themeColor(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

/** Resolve a map of `{ key: '--css-var' }` to `{ key: 'resolved color' }`. */
export function readThemeColors<T extends Record<string, string>>(map: T): { [K in keyof T]: string } {
  const out = {} as { [K in keyof T]: string }
  for (const key in map) out[key] = themeColor(map[key])
  return out
}

/** Number of derived decorative tokens declared in tokens.css. */
export const DECORATIVE_COUNT = 8

/** Resolve `--color-decorative-N` (1-based, wraps with modulo). */
export function decorativeColor(index: number): string {
  const n = ((index - 1) % DECORATIVE_COUNT + DECORATIVE_COUNT) % DECORATIVE_COUNT + 1
  return themeColor(`--color-decorative-${n}`)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- --run tests/unit/theme/theme-color.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/primitives/theme/theme-color.ts tests/unit/theme/theme-color.test.ts
git commit -m "feat(theme): shared themeColor helper for canvas contexts

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Decorative ramp story (W1c)

**Files:**
- Create: `src/renderer/src/primitives/theme/theme-color.stories.tsx`

**Interfaces:**
- Consumes: `decorativeColor`, `DECORATIVE_COUNT` from Task 2.

- [ ] **Step 1: Write the story**

Create `src/renderer/src/primitives/theme/theme-color.stories.tsx`. It renders swatches straight from the CSS vars (no hardcoded colors), so it visually documents the ramp and re-themes with the Storybook theme control:

```tsx
import type { Meta, StoryObj } from '@storybook/react'
import { Flex, Stack, Text } from '@/primitives'
import { DECORATIVE_COUNT } from './theme-color'

const meta: Meta = {
  title: 'Theme/Decorative Tokens',
}
export default meta
type Story = StoryObj

export const Ramp: Story = {
  render: () => (
    <Stack gap="sm">
      <Text size="sm" color="muted">
        Derived from accent/status tokens — themeable, no per-theme upkeep.
      </Text>
      <Flex gap="sm" wrap="wrap">
        {Array.from({ length: DECORATIVE_COUNT }, (_, i) => i + 1).map((n) => (
          <Stack key={n} gap="xs" align="center">
            <div
              style={{ width: 48, height: 48, borderRadius: 8, background: `var(--color-decorative-${n})` }}
            />
            <Text size="xs" color="muted">{n}</Text>
          </Stack>
        ))}
      </Flex>
    </Stack>
  ),
}
```

- [ ] **Step 2: Verify the story renders**

Run: `pnpm test -- --run` is not for stories. Instead run the Storybook test project:
Run: `pnpm test` (runs both projects) — the Storybook project must render `Theme/Decorative Tokens` with no a11y/render error.
Expected: PASS. (If iterating fast, `pnpm storybook` and open the story visually.)

Note: `Flex` supports `wrap` and `Stack` supports `gap`/`align`. If a prop is rejected, check the primitive's story/docs via the Storybook MCP (`get-documentation`) rather than guessing — do not invent props.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/primitives/theme/theme-color.stories.tsx
git commit -m "docs(theme): story for decorative token ramp

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Migrate canvas contexts to the shared helper (W2)

**Files:**
- Modify: `src/renderer/src/components/charts/ChartView.tsx:11-38`
- Modify: `src/renderer/src/components/er/ERDiagram.tsx:24-48`

**Interfaces:**
- Consumes: `themeColor` from Task 2.

- [ ] **Step 1: Update ChartView**

In `src/renderer/src/components/charts/ChartView.tsx`: add the import and delete the local `readVar`, replacing every `readVar('--x', 'fallback')` with `themeColor('--x')` (drop the drift-prone hex fallbacks — the tokens are always defined).

Add to imports (after line 6):

```ts
import { themeColor } from '@/primitives/theme/theme-color'
```

Delete lines 11-14 (the local `readVar`). Replace the `registerVerqlTheme` body so it reads:

```ts
function registerVerqlTheme(): void {
  addTheme(THEME_NAME, {
    bg: themeColor('--color-bg-primary'),
    surface: themeColor('--color-bg-secondary'),
    grid: themeColor('--color-border-subtle'),
    text: themeColor('--color-text-primary'),
    textMuted: themeColor('--color-text-tertiary'),
    axis: themeColor('--color-border-default'),
    positive: themeColor('--color-success'),
    negative: themeColor('--color-error'),
    onAccent: themeColor('--color-text-inverse'),
    colors: [
      themeColor('--color-accent'),
      themeColor('--color-accent-emphasis'),
      themeColor('--color-success'),
      themeColor('--color-warning'),
      themeColor('--color-error'),
      themeColor('--color-accent-hover'),
    ],
    tooltipBg: themeColor('--color-bg-elevated'),
    tooltipBorder: themeColor('--color-border-strong'),
    tooltipText: themeColor('--color-text-primary'),
  })
}
```

- [ ] **Step 2: Update ERDiagram**

In `src/renderer/src/components/er/ERDiagram.tsx`: add the import (after line 22), delete the local `readVar` (lines 24-27), and update the memo (lines 45-48):

Add import:

```ts
import { themeColor } from '@/primitives/theme/theme-color'
```

Replace the memo:

```ts
  const { gridColor, accentColor } = useMemo(() => ({
    gridColor: themeColor('--color-border-default'),
    accentColor: themeColor('--color-accent'),
  }), [theme])
```

- [ ] **Step 3: Typecheck + run existing chart/ER tests/stories**

Run: `pnpm exec tsc -b --noEmit`
Expected: no new errors in ChartView/ERDiagram.
Run: `pnpm test -- --run tests/unit` (fast unit pass) and confirm no regression referencing these files.

- [ ] **Step 4: Visually confirm re-theming (verification)**

Run: `pnpm storybook`, open `ChartView` and `ERDiagram` stories, switch theme (e.g. light ↔ dracula) and confirm colors update. (This is the design's manual verification step.)

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/charts/ChartView.tsx src/renderer/src/components/er/ERDiagram.tsx
git commit -m "refactor(charts,er): read theme colors via shared helper

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: PlanNode contrast text → token (W3a)

**Files:**
- Modify: `src/renderer/src/components/query-plan/PlanNode.tsx:38`

**Interfaces:** none new.

- [ ] **Step 1: Replace the raw contrast literals**

In `src/renderer/src/components/query-plan/PlanNode.tsx` line 38, the chip background is already a `var(--color-*)` (from `costColor`). Only the text color is raw. The status backgrounds are saturated across themes, so use the theme's inverse text token:

Change:

```tsx
        <Text size="xs" weight="semibold" className="px-2 py-0.5 rounded" style={{ backgroundColor: color, color: costRatio > 0.3 ? '#000' : '#fff' }}>
```

to:

```tsx
        <Text size="xs" weight="semibold" className="px-2 py-0.5 rounded" style={{ backgroundColor: color, color: 'var(--color-text-inverse)' }}>
```

- [ ] **Step 2: Typecheck**

Run: `pnpm exec tsc -b --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/query-plan/PlanNode.tsx
git commit -m "refactor(query-plan): chip text uses inverse token

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: PluginIcon gradients → decorative tokens (W3b)

**Files:**
- Modify: `src/renderer/src/components/plugins/PluginIcon.tsx`

**Interfaces:**
- Consumes: `decorativeColor`, `DECORATIVE_COUNT` from Task 2.

- [ ] **Step 1: Replace the raw Tailwind gradient palette**

The 8 raw `from-*-500 to-*-600` gradients become a token-driven gradient via the decorative ramp, keeping the deterministic hash. Rewrite `src/renderer/src/components/plugins/PluginIcon.tsx`:

```tsx
import { Flex } from '@/primitives'
import { decorativeColor, DECORATIVE_COUNT } from '@/primitives/theme/theme-color'
import type { PluginInfo } from './PluginsPanel'

export function hashToIndex(str: string, max: number): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) | 0
  }
  return Math.abs(hash) % max
}

export function PluginIcon({ plugin, size = 28 }: { plugin: PluginInfo; size?: number }) {
  if (plugin.icon) {
    return (
      <img
        src={plugin.icon}
        alt={plugin.displayName}
        className="rounded-lg object-cover shrink-0"
        style={{ width: size, height: size }}
      />
    )
  }
  // Deterministic hue from the theme's decorative ramp (1-based).
  const hue = decorativeColor(hashToIndex(plugin.name, DECORATIVE_COUNT) + 1)
  return (
    <Flex
      align="center"
      justify="center"
      className="rounded-lg text-text-inverse font-bold shrink-0"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.43,
        background: `linear-gradient(135deg, ${hue}, color-mix(in oklab, ${hue}, black 18%))`,
      }}
    >
      {plugin.displayName.charAt(0).toUpperCase()}
    </Flex>
  )
}
```

Notes: `text-white` → `text-text-inverse` (token class). The gradient is a *dynamic runtime value* built from theme colors, so its inline `background` is on the allowed side of the guardrail. The exported `ICON_GRADIENTS` constant is removed.

- [ ] **Step 2: Check for `ICON_GRADIENTS` importers**

Run: `rg -n "ICON_GRADIENTS" src/renderer`
Expected: no other importers. If any exist, update them to use `decorativeColor` the same way. (Do not leave a dangling import.)

- [ ] **Step 3: Typecheck + story**

Run: `pnpm exec tsc -b --noEmit`
Expected: no new errors.
If a `PluginIcon` story exists, run: `pnpm test` (Storybook project) and confirm it renders; else confirm via `pnpm storybook` visually.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/components/plugins/PluginIcon.tsx
git commit -m "refactor(plugins): generated icon uses decorative tokens

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Connection color default constant (W3c)

**Files:**
- Create: `src/renderer/src/lib/connection-color.ts`
- Modify: `src/renderer/src/components/query/ConnectionSelector.tsx:127,195`
- Modify: `src/renderer/src/components/connections/ConnectionFormView.tsx:54,161`

**Interfaces:**
- Produces: `export const DEFAULT_CONNECTION_COLOR = '#7c6ff7'`.

- [ ] **Step 1: Create the shared constant**

Create `src/renderer/src/lib/connection-color.ts`:

```ts
// The default color for a connection profile the user has not colored.
// This is USER DATA (a hex the color picker edits), not a theme token, so it
// is a concrete hex and is on the no-manual-styling guardrail allowlist.
// Do not inline this literal elsewhere — import the constant.
export const DEFAULT_CONNECTION_COLOR = '#7c6ff7'
```

- [ ] **Step 2: Update ConnectionSelector — status dots default to accent token**

In `src/renderer/src/components/query/ConnectionSelector.tsx`, the two dots (lines 127, 195) are decorative theme surfaces, so their *fallback* should be the accent token (theme-aware), not a hex:

Line 127 — change `?? '#7c6ff7'` to `?? 'var(--color-accent)'`:

```tsx
            <Box className="w-2 h-2 rounded-full" style={{ backgroundColor: activeConn.color ?? 'var(--color-accent)' }} />
```

Line 195 — same:

```tsx
              <Box className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: conn.color ?? 'var(--color-accent)' }} />
```

- [ ] **Step 3: Update ConnectionFormView — use the constant for the picker value**

In `src/renderer/src/components/connections/ConnectionFormView.tsx`, add the import near the top:

```ts
import { DEFAULT_CONNECTION_COLOR } from '@/lib/connection-color'
```

Line 54 (initial form state) — change `color: '#7c6ff7',` to:

```ts
    color: DEFAULT_CONNECTION_COLOR,
```

Line 161 (color input value fallback) — change `value={String(profile.color ?? '#7c6ff7')}` to:

```tsx
                      value={String(profile.color ?? DEFAULT_CONNECTION_COLOR)}
```

- [ ] **Step 4: Typecheck**

Run: `pnpm exec tsc -b --noEmit`
Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/lib/connection-color.ts src/renderer/src/components/query/ConnectionSelector.tsx src/renderer/src/components/connections/ConnectionFormView.tsx
git commit -m "refactor(connections): centralize default connection color

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: Migrate remaining palette-class / raw-hex sites (W4)

**Files:**
- Modify: `src/renderer/src/components/ai/MCPApprovalDialog.tsx`
- Modify: `src/renderer/src/components/plugins/PluginsPanel.tsx`
- Modify: `src/renderer/src/components/shell/ActivityBar.tsx`
- Modify: `src/renderer/src/components/ai/SchemaAutocomplete.tsx`
- Modify: `src/renderer/src/components/shell/ConnectionSwitcher.tsx`
- Modify: `src/renderer/src/components/shell/WindowControls.tsx`
- Modify: `src/renderer/src/components/settings/categories/AppearanceSettings.tsx`

**Interfaces:** none new. This task migrates raw palette classes / hex to the nearest **semantic token** class or token var. Because each file differs, the step is: for each file, list its offenders, map each to the correct semantic token, apply, and confirm.

- [ ] **Step 1: Enumerate the exact offenders per file**

Run:

```bash
rg -n '#[0-9a-fA-F]{3,8}\b|(bg|text|border|ring|from|to|via|fill|stroke)-(gray|red|blue|green|zinc|slate|neutral|yellow|amber|emerald|indigo|purple|orange|sky|rose|teal|cyan|violet|pink|lime|fuchsia)-[0-9]{2,3}|(bg|text|border)-\[#' \
  src/renderer/src/components/ai/MCPApprovalDialog.tsx \
  src/renderer/src/components/plugins/PluginsPanel.tsx \
  src/renderer/src/components/shell/ActivityBar.tsx \
  src/renderer/src/components/ai/SchemaAutocomplete.tsx \
  src/renderer/src/components/shell/ConnectionSwitcher.tsx \
  src/renderer/src/components/shell/WindowControls.tsx \
  src/renderer/src/components/settings/categories/AppearanceSettings.tsx
```

- [ ] **Step 2: Map each offender to a semantic token and apply**

Mapping rules (the token classes already exist in this codebase — grep an existing consumer, e.g. `rg "text-text-muted|bg-bg-tertiary|text-success|border-border-default" src/renderer` to confirm the class name before using it):

- Status/semantic hues → semantic token classes: green → `text-success`/`bg-success`; red → `text-error`/`bg-error`; yellow/amber → `text-warning`/`bg-warning`; blue (informational) → `text-info`.
- Neutral grays → `text-text-muted` / `text-text-secondary` / `bg-bg-tertiary` / `border-border-default` (pick by role).
- `ConnectionSwitcher.tsx` `text-[#ff8c6b]` (mongodb brand): route driver brand colors through the existing driver-color source if one exists (`rg -n "driverColor|brandColor|accentFor" src/renderer/src`); if none exists, use `text-decorative` via inline `style={{ color: 'var(--color-decorative-2)' }}` keyed to the driver. Prefer the smallest change that removes the arbitrary hex.
- `WindowControls.tsx` `hover:bg-[#e81123]` (Windows close-button red, an OS convention): replace with the error token — `hover:bg-error focus-visible:bg-error hover:text-text-inverse focus-visible:text-text-inverse`. Confirm `bg-error` exists first.
- `AppearanceSettings.tsx` `FALLBACK_PREVIEW` hex object: this is a **theme-preview fallback** (used only if a theme has no `preview`). It is user-facing-data-ish; keep it but move the literal onto the guardrail allowlist (Task 9) rather than forcing a token, OR derive it — simplest: keep as-is and allowlist the file. Decide during Step 3 based on whether a token substitution is clean; default to allowlisting.

Apply the mapping edits file by file. For each edit, the class you introduce MUST already be used elsewhere (verify with `rg`) — do not invent a token class.

- [ ] **Step 3: Typecheck + re-scan**

Run: `pnpm exec tsc -b --noEmit`
Expected: no new errors.
Re-run the Step 1 `rg` command.
Expected: empty output, EXCEPT any literal you deliberately chose to allowlist (note it for Task 9).

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/components/ai/MCPApprovalDialog.tsx src/renderer/src/components/plugins/PluginsPanel.tsx src/renderer/src/components/shell/ActivityBar.tsx src/renderer/src/components/ai/SchemaAutocomplete.tsx src/renderer/src/components/shell/ConnectionSwitcher.tsx src/renderer/src/components/shell/WindowControls.tsx src/renderer/src/components/settings/categories/AppearanceSettings.tsx
git commit -m "refactor(components): migrate raw palette/hex to semantic tokens

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: The guardrail test (W5a)

**Files:**
- Create: `tests/unit/audit/no-manual-styling.test.ts`

**Interfaces:**
- Consumes: nothing (scans source). Models `tests/unit/audit/main-orchestrator-purity.test.ts`.

- [ ] **Step 1: Write the guardrail test**

Create `tests/unit/audit/no-manual-styling.test.ts`. The allowlist starts with the sanctioned escapes established by earlier tasks; add any file you deliberately allowlisted in Task 8 Step 2, each with a justifying comment.

```ts
// Guardrail — appearance is theme-owned. Component source under
// src/renderer/src/components must not hardcode color/appearance. Colors come
// from semantic token classes (text-success, bg-bg-tertiary, ...) or CSS vars
// (var(--color-*)); never raw hex, raw Tailwind palette scales, or arbitrary
// color values. Static-appearance inline styles are banned; dynamic runtime
// values (width: size, transform, marginLeft) are fine.
//
// Sanctioned escapes live in ALLOWLIST, each with a reason.
import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const COMPONENTS = path.join(
  __dirname, '..', '..', '..',
  'src', 'renderer', 'src', 'components',
)

// Files permitted to contain a raw color literal, with justification.
const ALLOWLIST = new Set<string>([
  // User-data default: the hex the connection color picker edits. Centralized
  // constant, not a theme concern. (Task 7)
  // NOTE: connection-color.ts lives under lib/, not components/, so it is not
  // scanned — listed here for the record only.
  //
  // Theme-preview fallback shown only when a theme omits `preview`. (Task 8)
  path.join(COMPONENTS, 'settings', 'categories', 'AppearanceSettings.tsx'),
])

// Raw 3/6/8-digit hex color literal.
const RAW_HEX = /#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3}(?:[0-9a-fA-F]{2})?)?\b/
// Raw Tailwind palette scale, e.g. bg-red-500, from-purple-600, text-gray-400.
const PALETTE_CLASS = /\b(?:bg|text|border|ring|from|to|via|fill|stroke)-(?:gray|red|blue|green|zinc|slate|neutral|stone|yellow|amber|emerald|indigo|purple|orange|sky|rose|teal|cyan|violet|pink|lime|fuchsia)-[0-9]{2,3}\b/
// Arbitrary Tailwind color value, e.g. bg-[#e81123], text-[#ff8c6b].
const ARBITRARY_COLOR = /\b(?:bg|text|border|ring|fill|stroke)-\[#[0-9a-fA-F]{3,8}\]/

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(p, out)
    else if (entry.isFile() && p.endsWith('.tsx') && !p.endsWith('.stories.tsx')) out.push(p)
  }
  return out
}

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
}

describe('guardrail — components carry no manual styling', () => {
  const files = walk(COMPONENTS)

  it('finds a representative number of component files (sanity)', () => {
    expect(files.length).toBeGreaterThan(50)
  })

  it.each(files)('%s uses tokens, not raw color literals', (file) => {
    if (ALLOWLIST.has(file)) return
    const src = stripComments(fs.readFileSync(file, 'utf-8'))
    const offenders: string[] = []
    for (const re of [RAW_HEX, PALETTE_CLASS, ARBITRARY_COLOR]) {
      const m = src.match(re)
      if (m) offenders.push(m[0])
    }
    expect(
      offenders,
      `Manual styling found — use a semantic token class or var(--color-*): ${offenders.join(', ')}`,
    ).toEqual([])
  })
})
```

- [ ] **Step 2: Run the guardrail — it must PASS now**

Run: `pnpm test -- --run tests/unit/audit/no-manual-styling.test.ts`
Expected: PASS. If it fails, the failing file name + offender is printed — go migrate that file (same rules as Task 8) or, only for a genuine sanctioned escape, add it to `ALLOWLIST` with a reason. Do NOT allowlist to silence real offenders.

- [ ] **Step 3: Prove the guardrail actually catches regressions**

Temporarily add `className="bg-red-500"` to any component (e.g. top of `PlanNode.tsx`'s returned JSX), then run:
Run: `pnpm test -- --run tests/unit/audit/no-manual-styling.test.ts`
Expected: FAIL naming that file and `bg-red-500`. Then revert the temporary change and re-run — Expected: PASS. (This verifies the guard isn't a no-op.)

- [ ] **Step 4: Commit**

```bash
git add tests/unit/audit/no-manual-styling.test.ts
git commit -m "test(guardrail): fail on manual styling in components

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 10: Stale docs + changeset (W5b)

**Files:**
- Modify: `CLAUDE.md:143`, `docs/architecture.md:153`, `docs/diagrams.md:606`, `docs/guide/exploring-schema.md`, `site/src/content/docs/guide/exploring-schema.md`
- Create: `.changeset/primitive-adoption-guardrail.md`

**Interfaces:** none.

- [ ] **Step 1: Fix the stale Recharts references**

Run to locate each: `rg -n 'Recharts' CLAUDE.md docs site`

Apply, matching each file's surrounding wording:
- `CLAUDE.md:143` — `- **Recharts** — Chart panel for data visualization` → `- **@arshad-shah/swift-chart** — Chart panel for data visualization (theme-aware via `addTheme` + CSS token vars)`
- `docs/architecture.md:153` — replace `Recharts` with `@arshad-shah/swift-chart` in the libraries sentence.
- `docs/diagrams.md:606` — replace the `Recharts charts` node label with `swift-chart charts`.
- `docs/guide/exploring-schema.md` and its `site/` mirror — replace the `Recharts` mention with `swift-chart` (keep user-facing phrasing natural, e.g. "charts").

Re-run `rg -n 'Recharts' CLAUDE.md docs site` → Expected: empty.

- [ ] **Step 2: Add the changeset**

Create `.changeset/primitive-adoption-guardrail.md`:

```md
---
"verql": minor
---

Full primitive/token adoption: drove out remaining manual styling in renderer
components, added a derived decorative color token ramp and a shared
`themeColor()` helper for canvas contexts (charts, ER diagram), and added a
Vitest guardrail that fails CI on raw hex, raw Tailwind palette classes, and
static-appearance inline styles. All built-in and user-added themes keep
working with no per-theme upkeep.
```

Confirm the package name: `rg -n '"name"' package.json | head -1` — use that exact name in the changeset frontmatter if it is not `verql`.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md docs/architecture.md docs/diagrams.md docs/guide/exploring-schema.md site/src/content/docs/guide/exploring-schema.md .changeset/primitive-adoption-guardrail.md
git commit -m "docs: swift-chart (not Recharts); changeset for primitive adoption

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 11: Full verification pass

**Files:** none (verification only).

- [ ] **Step 1: Full typecheck**

Run: `pnpm exec tsc -b --noEmit`
Expected: clean (no errors).

- [ ] **Step 2: Full test suite (unit + Storybook projects)**

Run: `pnpm test`
Expected: PASS, including `tests/unit/theme/decorative-tokens.test.ts`, `tests/unit/theme/theme-color.test.ts`, and `tests/unit/audit/no-manual-styling.test.ts`.

- [ ] **Step 3: Final offender sweep (belt-and-suspenders)**

Run:

```bash
rg -n '#[0-9a-fA-F]{3,8}\b|(bg|text|border|ring|from|to|via|fill|stroke)-(gray|red|blue|green|zinc|slate|neutral|yellow|amber|emerald|indigo|purple|orange|sky|rose|teal|cyan|violet|pink|lime|fuchsia)-[0-9]{2,3}|(bg|text|border)-\[#' \
  src/renderer/src/components -g '*.tsx' -g '!*.stories.tsx'
```

Expected: only allowlisted lines remain (AppearanceSettings fallback). Anything else → migrate it.

- [ ] **Step 4: Visual re-theme spot check (verification)**

Run: `pnpm storybook`; switch across a light theme (`light`/`lab`) and dark themes (`dracula`, `nord`) and confirm ChartView, ERDiagram, PluginIcon, and connection dots all re-color correctly.

- [ ] **Step 5: No commit** — this task only verifies. If any step fails, return to the owning task.

---

## Self-Review

**Spec coverage:**
- Reframe / keep primitives → whole plan keeps primitives, only adds tokens/helper. ✓
- 5-category violation taxonomy → raw hex (Tasks 5,7,8), palette classes (Tasks 6,8), user-data default (Task 7), sanctioned canvas reads (Tasks 2,4), allowed dynamic values (documented in guardrail Task 9). ✓
- Additive layer: decorative tokens (Task 1), `themeColor()` (Task 2), `DEFAULT_CONNECTION_COLOR` (Task 7). ✓
- Theme-safety structural guarantee → derived ramp in base `:root` + per-theme source-token assertion test (Task 1). ✓
- Workstreams W1–W5 → Tasks 1–3 (W1), 4 (W2), 5–7 (W3), 8 (W4), 9–10 (W5). ✓
- Guardrail test with justified allowlist → Task 9. ✓
- Stale Recharts docs → Task 10. ✓
- Changeset, typecheck, verification → Tasks 10, 11. ✓

**Placeholder scan:** No TBD/TODO; every code step has concrete code. The one judgment call (AppearanceSettings: allowlist vs token) is explicitly decided with a default (allowlist). ✓

**Type consistency:** `themeColor`, `readThemeColors`, `decorativeColor`, `DECORATIVE_COUNT` used identically in Tasks 2, 4, 6. `DEFAULT_CONNECTION_COLOR` defined and consumed consistently in Task 7. Guardrail regexes shared between Task 8 recon and Task 9/11 enforcement. ✓

---

## Addendum — Second wave (from final whole-branch review, user-approved)

The final review approved the branch "with fixes." User chose the thorough option on all three findings. Five follow-up tasks:

### Task 12: On-status text tokens + PlanNode contrast fix
- `tokens.css` base `:root`: add derived `--color-on-success/warning/error` = `color-mix(in oklab, var(--color-<status>), black 70%)` (a dark shade of each status hue — readable on the status-colored badge in ALL themes, no per-theme upkeep).
- `PlanNode.tsx`: badge text color → the matching `var(--color-on-*)` for the current cost bg (parallel to `costColor`). Fixes the light-theme warning-badge contrast regression.
- Extend `tests/unit/theme/decorative-tokens.test.ts` to also assert the 3 on-status tokens exist.

### Task 13: er-layout.ts → live-re-theming var() strings
- `buildErElements` bakes colors at build time (only runs on load, not theme change). Store literal `var(--color-...)` STRINGS (not resolved colors) so the browser resolves them live:
  - node `color`: `` `var(--color-decorative-${(i % 8) + 1})` `` (decorative ramp).
  - edge `stroke: 'var(--color-accent)'`; label `fill: 'var(--color-text-tertiary)'`.
- Result: ER edges/nodes re-theme without rebuild. No raw hex remains.

### Task 14: tab-icons.ts + form/types.ts
- `tab-icons.ts` returns `{icon, className}` consumed by `TabItem.tsx`. No `text-decorative-N` utility exists (decorative is inline-var only, cf. ConnectionSwitcher). Change `TabIconConfig` to carry a `color: string` (a `var(--color-...)`), map the 7 raw `text-*-400` to decorative vars and the 2 existing token classes (accent, text-tertiary) to their vars for uniformity; `TabItem.tsx` applies `style={{ color }}`.
- `form/types.ts` `COLOR_PRESETS`: user-data selectable swatches (concrete hexes required) — leave as-is; it will be ALLOWLISTED in the extended guardrail (Task 16), like AppearanceSettings.

### Task 15: Neutral overlay sweep (43 occurrences, 24 files)
- Map `bg-white/5`→`bg-hover`, `bg-white/10`→`bg-active` (tokens exist: `--color-hover`, `--color-active` — theme-defined so they invert on light themes). Other hover/active-intent overlays → nearest of those.
- `bg-black/N` modal scrims/backdrops → add a `--color-scrim` token (base `:root`, e.g. `rgba(0,0,0,0.5)`) and a `bg-scrim` usage (confirm utility or use inline `var`); scrims stay dark by intent.
- Any overlay that doesn't map cleanly → implementer STOPS and asks.

### Task 16: Extend guardrail + final re-verify
- `no-manual-styling.test.ts`: `walk()` also collects `.ts` (exclude `*.stories.*`, `*.test.*`); add `white`/`black` to the alpha-overlay detection so `bg-white/x`/`bg-black/x` are caught (unless a sanctioned token like `bg-scrim`).
- ALLOWLIST additions with justification: `connections/form/types.ts` (user-data preset swatches).
- Guardrail must PASS after Tasks 12–15; re-prove regression-catch (add offender → fail → revert → pass).
- Final: `tsc -b --noEmit` clean; new/changed tests pass; full-suite failure set unchanged from the pre-existing baseline (45, all in untouched files).
