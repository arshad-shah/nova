---
"verql": patch
---

Extend the type scale to the app's real density instead of hand-rolling sub-12px
font sizes. Two named steps now sit below `xs` — `text-3xs` (10px) and `text-2xs`
(11px), each with its own tight line-height — declared in the token layer and
exposed as `size` variants on `Text`, `Label`, `Code` and `Tag` (and used by
`Badge`). The 83 ad-hoc `text-[8/9/10/11px]` values across the renderer's chrome
(explorer tree, status bar, activity rows, badges, AI panels) are migrated onto
these steps; the handful at 8/9px round up to 10px, the desktop legibility floor.
A new `renderer-no-arbitrary-font-size` guard test keeps the arbitrary-value
escape hatch from re-opening — any `text-[Npx]` reintroduced in a component fails
CI and the message names the scale step to use instead.
