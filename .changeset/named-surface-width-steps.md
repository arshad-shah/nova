---
"verql": patch
---

Name the recurring surface widths instead of hand-rolling arbitrary pixel
values. Dialog, palette and column widths that were scattered as `w-[400px]`,
`w-[520px]`, `w-[230px]`, `max-w-[1280px]` and the like are now named steps:
the `--container-prompt` (400px), `--container-palette` (520px) and
`--container-hero` (230px) tokens back a new `width` variant on the `Modal`
primitive (`width="prompt"` for confirm/blocking dialogs, `width="palette"` for
the command palette), so surface width is chosen from a scale rather than left
to each caller. Surface widths stay pixel-exact and density-independent.

Content constraints (label truncation bounds, a suggestion-wrap max-width, a
popover min-width) move onto the shared Tailwind width scale (`max-w-40`,
`min-w-65`, …); these track UI density, so at the default comfortable density
they render a little larger — more room before text truncates, never less, so
nothing that fit before clips now. The macOS traffic-light gutter and a
chevron-sized row spacer, which must stay fixed pixels, become inline widths.

A new fitness guard (`renderer-no-arbitrary-width`) fails CI if any
`w-[Npx]`/`max-w-[Npx]`/`min-w-[Npx]` is reintroduced under
`src/renderer/src/components`, naming the file, line and the named step or
inline-style exception to use instead.
