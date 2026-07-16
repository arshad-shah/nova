---
"verql": minor
---

Ion: a new look for Verql. **Ion is now the default theme** — a new palette
paired with a redrawn ribbon mark, and every brand artifact (app icons, Store
tiles and listing art) is generated from that one source.

The design system was rebuilt behind it. Toast was rebuilt and is now the only
one; Banner merged into Alert; Avatar was redesigned around what the app
actually shows; Input absorbed the single-line field variants; Card gained
variants and replaced hand-rolled surfaces; SegmentedControl and ToggleGroup are
new; Button gained loading and subtle variants and a corrected destructive red.
Components that reached for native HTML now use primitives instead, and the
pickers moved onto them.

Colour is theme-driven throughout: the action colour, Badge and Kbd shadows, and
Shiki code blocks all follow the active theme rather than hardcoded values, and
the stale Nightshift colours are gone. Alert and Toast body text now reads at
the same contrast as its title, and Badge can mark PK/FK/UNIQUE keys.

Naming follows one system across the primitives: **tone** carries meaning
(success, warning, error) and **variant** carries weight (solid, subtle, …).
