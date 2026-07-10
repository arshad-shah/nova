---
"verql": minor
---

Full primitive/token adoption: drove out remaining manual styling in renderer
components, added a derived decorative color token ramp and a shared
`themeColor()` helper for canvas contexts (charts, ER diagram), and added a
Vitest guardrail that fails CI on raw hex, raw Tailwind palette classes, and
static-appearance inline styles. All built-in and user-added themes keep
working with no per-theme upkeep.
