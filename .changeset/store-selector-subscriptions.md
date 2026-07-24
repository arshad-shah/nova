---
"verql": patch
---

Subscribe to Zustand stores per-field across the renderer so shell chrome no
longer re-renders on every keystroke.

`App.tsx` already documented the rule — subscribe to individual fields, not the
whole store, because App renders the entire shell and a whole-store subscription
re-renders it on every store mutation (including per-keystroke `updateTabSql`,
which also carries full result sets in the tabs store) — but 26 call sites still
took the whole store. All 26 (tab bar, charts dashboard, status bar, command
palette, connection selector/switcher, query panel/editor, sidebars,
notifications, toasts, and the query-execution/transaction hooks) now select the
exact fields they use; actions are stable references, so selecting them
individually is free. A new fitness function,
`tests/unit/audit/renderer-store-selectors.test.ts`, fails the build if a bare
`useXStore()` whole-store subscription is reintroduced.
