---
---

Tests only: add a design-system fitness function that fails CI if a public
primitive is missing a Storybook story. A primitive re-exported through a
category barrel (`primitives/<category>/index.ts`, reachable from
`primitives/index.ts` via `export *`) must ship a sibling `*.stories.tsx`; the
failure names the offending file and the story to add. Menu internals
(`surfaces/menu/`) and root-level providers/helpers (`ThemeProvider`, `cn`) are
off the public surface by construction, and a documented `EXCEPTIONS` map is the
sanctioned, self-verifying escape hatch. Backfills the two primitives that were
missing stories (`AvatarLabel`, `SeverityIcon`). Companion to the existing
`renderer-no-raw-palette`, `renderer-no-arbitrary-font-size`,
`renderer-no-arbitrary-width` and `renderer-no-raw-html-primitives` guards. No
shipped behaviour changes.
