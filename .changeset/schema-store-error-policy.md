---
"verql": patch
---

Schema explorer now handles load failures consistently. Every schema fetcher
(databases, schemas, tables, columns, indexes, objects, row counts) applies one
error policy: a failed load is recorded to the Activity stream, marked as
errored rather than cached as an empty result, and can no longer surface as an
unhandled promise rejection. The explorer tells a *failed* load apart from a
genuinely empty one — where it used to show a perpetual "Loading…" or a silent
empty list, it now shows an error row with a Retry action.
