---
"verql": patch
---

Code-split the renderer so the heaviest, non-first-paint dependencies no longer
load before first paint (#205). The query editor (Monaco), the results grid
(ag-grid), the ER diagram, the AI chat panel (`react-markdown`/`shiki`), and the
charts panel/dashboard now mount behind a `React.lazy` boundary at their render
sites, with a shared spinner fallback while the chunk downloads. The renderer
build gained a `manualChunks` split that pulls `monaco-editor`, `ag-grid`, and
the markdown/highlight stack into their own vendor chunks, so opening a
connection, the welcome screen, and the app shell paint without paying for the
editor and grid up front. No component behaviour changes — only when each one
loads.
