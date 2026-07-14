# Full primitive adoption + anti-drift guardrail — design

**Date:** 2026-07-10
**Status:** Approved (design), pending implementation plan

## Problem & framing

The request began as "create a robust reusable primitive component set and make
every component use it." Investigation showed the primitive set **already
exists and is mature** — `forms/`, `layout/`, `navigation/`, `feedback/`,
`data-display/`, `typography/`, `utilities/`, `theme/`, `patterns/` (151 files,
CVA-based, token-driven, mostly with stories) — and is **~85% adopted** (122 of
141 component files import primitives).

So this is **not** a greenfield build. The real goal is consistency:

1. Drive out the remaining **manual styling** so themes fully own appearance.
2. Add the few missing **primitives/tokens** that recurring raw patterns need.
3. Lock it in with a **guardrail** so manual styling cannot creep back.

Deliverable is consistency + an anti-drift gate, not a new component library.

### Decisions locked during brainstorming

- **Goal:** audit + migrate existing primitives to full adoption (keep the
  primitives; do not rebuild them).
- **Enforcement:** one-time cleanup **plus** a durable guardrail.
- **Dynamic styles:** allow inline styles that carry a computed/runtime value
  (width from state, drag transforms); ban only static appearance/color
  literals.
- **Guardrail mechanism:** a source-scanning **Vitest test** (the repo has no
  ESLint and is TypeScript + Vitest only; standing up ESLint just for this is
  disproportionate). Modeled on the existing `sdk-public-surface` invariant
  test.
- **Charting:** the app already uses the user's own `@arshad-shah/swift-chart`
  (bumped to latest, **1.3.1**, during brainstorming) — **not** Recharts. The
  only remaining "Recharts" references are stale docs, corrected as part of this
  work.
- **All themes must keep working**, including user-added themes.

## Violation surface (audit results)

Concentrated and tractable — ~25–35 files, not 141. Five categories, each with a
prescribed fix:

| Category | Example | Fix |
|---|---|---|
| Raw color literal (static) | `color: '#000'` contrast in `PlanNode.tsx` | theme token (`--color-text-inverse`) |
| Raw Tailwind palette class | `PluginIcon` gradients, `MCPApprovalDialog`, `PluginsPanel`, `ActivityBar`, `SchemaAutocomplete` | token-driven primitive / semantic token |
| User-data color default | `'#7c6ff7'` duplicated in 3 connection files | one shared `DEFAULT_CONNECTION_COLOR` constant + token |
| Canvas color read (legit) | `readVar('--color-accent', …)` in `ChartView`, `ERDiagram` | **sanctioned** shared helper, deduped |
| Dynamic runtime value (legit) | `style={{ width: size }}` | **allowed**, untouched |

Concrete raw-hex sites: `PlanNode.tsx`, `ConnectionSelector.tsx`,
`ConnectionFormView.tsx`, `ERDiagram.tsx`, `ChartView.tsx`,
`ConnectionSwitcher.tsx`, `WindowControls.tsx`, `AppearanceSettings.tsx`.

Raw Tailwind palette offenders (by count): `PluginIcon.tsx` (16),
`PluginsPanel.tsx` (4), `MCPApprovalDialog.tsx` (4), `ActivityBar.tsx` (2),
`SchemaAutocomplete.tsx` (2).

19 files import no primitives; several are legitimately exempt (hooks like
`useGroupExpanded.tsx`, data modules like `menu-model.tsx`, mount points like
`PluginSlot.tsx` / `PluginPanelMount.tsx`). These are triaged, not force-fitted.

## Additive layer (new primitives/tokens)

Small, well-bounded additions that the raw patterns collapse into. Add a
primitive only where 2+ call sites need the same new thing; most cases map onto
**existing** primitives (`BadgeIndicator`, `Avatar`, `Badge`, `Text`).

- **`themeColor()` / `readThemeColors()`** in `primitives/theme/` — a single
  source-of-truth helper for canvas/SVG contexts (swift-chart, `@xyflow/react`)
  that must read CSS tokens as color strings. Replaces the two duplicated
  `readVar` copies in `ChartView` and `ERDiagram`; fallbacks (if any) live in
  one map instead of being copy-pasted hex that can drift. This is the
  **sanctioned escape** for "can't use a className."
- **Decorative color tokens** `--color-decorative-1..N` — a themeable ramp so
  deterministic hash-colored UI (`PluginIcon`) draws from tokens and responds to
  themes. `PluginIcon` becomes a thin consumer of the existing `Avatar`
  primitive (or a small `GeneratedIcon` keyed by a `seed`).
- **`DEFAULT_CONNECTION_COLOR`** constant + derived token so the `#7c6ff7`
  default is defined once; connection status dots use the existing
  `BadgeIndicator` instead of raw `<Box className="w-2 h-2 rounded-full"
  style={{ backgroundColor }}>`.

## Theme-safety guarantee

"All themes work correctly" is made **structural**, not a per-theme chore.

Every built-in theme in `core-themes/themes-data.ts` (lab, inkpaper, dark,
light, midnight, dracula, nord, solarized, catppuccin, …) guarantees the same
core semantic tokens — `--color-accent`, `--color-accent-emphasis`,
`--color-success`, `--color-warning`, `--color-error` — and the theme contract
requires any user-added theme to define them too.

So the decorative ramp is **derived, not hand-authored per theme** — defined
once in the base `:root` of `tokens.css` via `var()`/`color-mix()` from those
guaranteed tokens:

```css
:root {
  --color-decorative-1: var(--color-accent);
  --color-decorative-2: var(--color-accent-emphasis);
  --color-decorative-3: var(--color-success);
  --color-decorative-4: var(--color-warning);
  --color-decorative-5: var(--color-error);
  --color-decorative-6: color-mix(in oklab, var(--color-accent), var(--color-success) 50%);
  /* …extend to N with color-mix blends */
}
```

Consequences that make the guarantee hold:

- All built-in themes get a correct, on-brand ramp for free (they remap the
  source tokens; derived tokens follow).
- Any user-added theme satisfying the existing contract gets a coherent ramp
  automatically — it never has to know decorative tokens exist.
- A theme *may* override `--color-decorative-*` for bespoke hues, but never
  *has* to.
- `DEFAULT_CONNECTION_COLOR` (token derived from accent) and `themeColor()`
  follow the same principle: `themeColor()` reads the live CSS variable, so
  swift-chart's `addTheme` re-bakes correctly on every theme switch across all
  themes and user themes.

A Vitest test asserts every theme in `themes-data.ts` resolves the core source
tokens, so no future theme can silently break the derived ramp.

## Migration workstreams

Each is an independently reviewable unit.

- **W1 — Additive foundation:** decorative tokens + `DEFAULT_CONNECTION_COLOR`
  token + `themeColor()`/`readThemeColors()` helper in `primitives/theme/`.
  Stories/docs for the token ramp. No consumer changes yet.
- **W2 — Canvas contexts:** `ChartView` + `ERDiagram` swap duplicated `readVar`
  for the shared helper; drift-prone hex fallbacks removed; swift-chart
  `addTheme` fed from the helper.
- **W3 — Decorative/data color sites:** `PluginIcon` → tokens/`Avatar`;
  connection color dots → `BadgeIndicator` + `DEFAULT_CONNECTION_COLOR`;
  `PlanNode` contrast → `--color-text-inverse`.
- **W4 — Palette-class & bespoke sites:** `MCPApprovalDialog`, `PluginsPanel`,
  `ActivityBar`, `SchemaAutocomplete`, `ConnectionSwitcher`, `WindowControls` →
  semantic tokens/primitives; the 19 non-adopting files triaged.
- **W5 — Guardrail + docs:** the Vitest guardrail test flipped to error once
  W1–W4 land; stale Recharts→swift-chart doc fixes in `CLAUDE.md`,
  `docs/architecture.md`, `docs/diagrams.md`, `docs/guide/exploring-schema.md`
  and its `site/` mirror.

## Guardrail test design

`tests/unit/no-manual-styling.test.ts`, modeled on `sdk-public-surface`. Scans
`src/renderer/src/components/**/*.tsx` (excluding `*.stories.tsx`) and **fails**
on:

- Raw hex color literals (`#rgb` / `#rrggbb` / `#rrggbbaa`).
- Raw Tailwind palette classes
  (`(bg|text|border|ring|from|to|via|fill|stroke)-(gray|red|blue|…)-\d{2,3}`)
  and arbitrary color values (`bg-[#…]`, `text-[#…]`).
- Static-appearance inline styles (color / background / border literals inside
  `style={{…}}`).

**Allowed (not flagged):**

- Dynamic inline values (`width: size`, `transform: …`).
- A small **explicit allowlist** of sanctioned files (`primitives/theme/*`, the
  `themeColor` helper, documented user-data-color sites). Each allowlist entry
  carries a comment justifying why. The allowlist is the pressure valve that
  lets the rule be strict without false positives.

## Testing & verification

- New Vitest tests: the guardrail scanner (W5) and the theme-token-resolution
  assertion (theme safety).
- Stories for the decorative token ramp; existing stories continue to pass.
- `pnpm test` (unit + Storybook projects) green.
- `pnpm exec tsc -b --noEmit` clean (esbuild-based `pnpm test` skips
  typechecking).
- Manual/visual: swift-chart + ER diagram re-theme correctly across a sample of
  light and dark themes after switching.
- A changeset added (Verql uses Changesets; every feature/fix PR needs one).

## Out of scope

- Rebuilding or redesigning existing primitives (they stay as-is).
- Introducing ESLint or any new lint toolchain.
- Unrelated refactors of the component areas being touched.
- Changing the theme contract or adding new themes.
- Replacing the charting library (already the user's own package).
