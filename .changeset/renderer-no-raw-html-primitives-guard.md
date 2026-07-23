---
---

Tests only: add a design-system fitness function that fails CI if feature code
under `src/renderer/src/components` reaches for a raw interactive/structural HTML
element instead of the design-system primitive that exists for it — `<button>`,
`<input>`, `<select>`, `<textarea>`, `<table>`, and `<h1>`–`<h6>`. The failure
names the offending file, line and the sanctioned primitive (`Button`/
`IconButton`, `Input` and its typed siblings, `Select`, `Textarea`, `Table`,
`Heading`). The `primitives/` layer is deliberately out of scope, since a
primitive is where a native element legitimately lives. This is the
element-level companion to the existing `renderer-no-raw-palette` (colour) and
`renderer-no-arbitrary-font-size` (type scale) guards. No shipped behaviour
changes.
