---
"verql": minor
---

Replace the `@xyflow/react` + `@dagrejs/dagre` ER diagram with a handrolled,
dependency-free renderer under `src/renderer/src/components/er/`. The diagram now
says what a relationship *means*: every connector carries crow's-foot
(Information-Engineering) cardinality — exactly one, zero or one, one or many,
zero or many — with identifying relationships drawn solid and non-identifying
dashed, plus a legend that renders from the same symbol geometry the connectors
use, so the two can't drift. Connectors anchor at the row of the field they
constrain rather than at the card's edge.

The diagram now follows the active theme. A `theme-bridge` reads the ERD palette
out of the semantic token layer (`--color-bg-inset`, `--color-border-strong`,
`--color-key-pk`/`-fk`, `--color-accent`, `--color-data-accent`, …) and the type
ramp, and repaints on `data-theme` change across dark, light, midnight and any
plugin theme — no hardcoded colours and no external stylesheet the design system
can't reach. Entity cards size to their content instead of a fixed 220px, and a
layered layout engine places referenced entities ahead of the entities that
reference them (left in LR, above in TB). Below a zoom threshold each card
switches to a density read of its key structure without shifting any geometry.

Removing both dependencies and `@xyflow/react/dist/style.css` drops roughly
78 KB gzipped from the renderer bundle for the one surface that used them.
Geometry invariants (no card overlaps, no connector leg crossing an uninvolved
entity, deterministic output, cyclic/orphan termination, notation ordering) are
guarded in `tests/unit/er/`.
