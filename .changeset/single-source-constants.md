---
"verql": patch
---

Internal: route hardcoded identifiers through their constants, and guard it.

`IPC_CHANNELS` has always been single-sourced and guarded by an audit test, but
that pattern stopped there. ~131 raw literals across the codebase re-typed an id
that already lived in a constant, or should have. A re-typed identifier is
type-checked at some call sites and silently wrong at others, and it is how the
two sides of a boundary drift apart.

Seven constant sets now exist where the code previously only had a union type
with no runtime companion, so every call site hand-typed the string:
`CONTRIBUTION_KIND`, `CAPABILITY_SURFACE`, `PLUGIN_PERMISSION`, `PLUGIN_PHASE`,
`ACTIVITY_KIND`, `CONFIG_KEY`, `DEFAULT_THEME_ID`, plus `AI_CHAT_PANEL_ID` for a
plugin-namespaced panel id that was duplicated across five files.

A new audit test generalises the IPC guard to 18 constant sets. It derives each
set's values by importing the defining module rather than copying the strings —
a guardrail that duplicates what it guards is its own worst example — and scopes
each check to the specific call-site shapes the codebase actually uses, because
half these values ('error', 'active', 'query', 'dark') are ordinary words
elsewhere and a guard that flags every 'error' gets deleted within a week.

Driver ids were deliberately NOT swept into a constant. Some of those literals
are the renderer branching on a driver's identity, which CLAUDE.md's ownership
rule exists to prevent; a constant would only have made the wrong thing tidier.
They are reported instead — see the PR.
