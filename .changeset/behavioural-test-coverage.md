---
"verql": patch
---

Testing: two adversarial coverage passes over the least-covered high-risk code.

Coverage had never been measured in this repo — `@vitest/coverage-v8` was a
dependency that nothing configured — so these passes started by finding out where
the holes actually were, then went by risk rather than by size.

The first pass took the trust boundaries and the pure-logic gaps: `src/main/ipc`
(every renderer→main call, where a bug is a security bug), `src/main/mcp` (the
external tool surface), the renderer hooks, and the seven Zustand stores with no
test file at all. The second took what it did not reach: the AI plugin's
conversation loop and token budget, the plugin host lifecycle, settings and
connections, the explorer and query surfaces, the shell, the interactive
primitives, and the mongodb/redis/postgres/snowflake drivers.

Every area was then adversarially mutation-tested — break the source, confirm the
tests fail, restore — and any test that survived a mutation was strengthened.
That step is what separates a real test from a coverage filler, and it is how the
plugin icon vulnerability fixed in this release was found.

The tests deliberately do not chase the percentage. This repo already had suites
that render a component, assert its labels appear, and validate nothing — one
`ContextMenu` suite never right-clicked, so the single interaction that component
exists for was untested. Those pass against a completely broken implementation
while producing real coverage, and a percentage target is best satisfied by
writing more of them.

Several genuine bugs surfaced and are documented by tests asserting today's
behaviour rather than silently changed — each is a behaviour change and belongs
in its own release. The notable ones: Mongo `distinct` results are shredded
because the formatter branches only on `Array.isArray`; the explorer tree cannot
distinguish "loaded but empty" from "still loading", so a schema-less driver
shows a permanent loading state; and an AI approval arriving in a narrow window
is swallowed and treated as a rejection.
