---
"verql": minor
---

Drivers now declare their own visual identity.

Three components each hardcoded their own driver-id → label/colour map:
`ConnectionSegment`, `ConnectionSwitcher` and `ConnectionListItem`. They had
already drifted — two omitted Snowflake entirely, so it fell back to a generic
grey "SN" chip in the status bar while the connection list showed a proper "SF",
and MongoDB was a different colour depending on which surface you looked at.

That is the ownership rule in CLAUDE.md being broken: the renderer was deciding
what each driver looks like. It meant every new driver required editing the
renderer, and a plugin-contributed driver could never look like anything at all.

Drivers now declare a `presentation` capability — a short chip label and a
semantic tone — alongside the `nouns` capability they already declare. The tone
is deliberately semantic ('accent', 'error', …) rather than a colour: the driver
says what it is, and each surface maps that to its own treatment. A driver
shipping a CSS class would be reaching into the renderer's design system from
the far side of an IPC boundary.

Omitting it still works: the renderer falls back to the first two letters of the
driver id and a neutral tone, so a plugin driver renders sensibly without
declaring anything — which the three maps could never do.

One deliberate visual change: MongoDB's colour in the connection switcher.
The two maps disagreed, so one identity had to win; it is now the same green the
connection list already used. Snowflake gains its proper "SF" chip in the status
bar and switcher, which previously only the connection list knew about.
