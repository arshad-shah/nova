---
"verql": minor
---

UI: complete the deferred modularity follow-ups from #145.

All ten items in `docs/ui-modularity-followups.md` are done. The headline is
`ConnectionSelector` — the audit called it the single biggest UI cleanup, and it
was blocked until the menu primitive could express what it needed. Three
`useState` booleans with hand-written mutual exclusion, a `fixed inset-0`
backdrop, three floating panels and a class string repeated four times are
replaced by one primitive. Its database and schema pickers are single-select, so
the active one is now announced through `aria-checked` in a `role="group"`
rather than being conveyed by colour alone.

New primitives for patterns that were hand-rolled across the app: `StatusDot`
(eight sites, previously four different sizes) and `ConnectionDot`, which
preserves both of its call-sites' deliberately different colour fallbacks
through a `state` prop rather than unifying away a distinction that was by
design.

Where a primitive could not express a call-site, it was extended rather than
overridden with `!` classes — `Modal` gained a `position` variant for the
top-anchored command palette, `Badge` a `pill` size, `Progress` a semantic
`tone`, `IconButton` a `nav` variant, and both `DropdownMenu` and `Popover`
gained controlled `open`/`onOpenChange`. That last one matters: without it the
AI panel had to force-close a picker by remounting it, and one menu could not
open another, which had pushed a refactor into quietly redesigning the chat
rename flow.

Two real bugs fixed on the way. The `bg-white/18` overlays in the status bar and
notifications sidebar did not invert on light themes the way every other overlay
token does; they are now derived tokens that follow the theme. And
`ToolCallCard` referenced an undefined `--color-text`, so one label rendered with
no colour at all.

Six items deviate from the audit as written, deliberately, and the reasons are
recorded in the doc: `ActivityList` keeps its inline cluster rather than grow its
hit target, `ActionChip`'s interactive chip stays a `Button` rather than lose its
keyboard semantics to a `span`, and `SchemaAutocomplete` stays hand-rolled
because a combobox anchored to someone else's textarea is not a popover.
