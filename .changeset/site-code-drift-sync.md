---
"verql": patch
---

Docs site: sync curated pages with the current source. Restored content that had
drifted behind the code — the driver `nouns` capability (object/field/record
terms) in the plugin guide and architecture map, the `onboarding.*` settings
state, the log-kit `onTransportError` failure-isolation and four-level `Logger`
facade detail in the activity subsystem, and the centralized `APP_ACTION` id
constants in the AI docs. Each addition was validated against the actual
subsystem source, not the internal `docs/` copies.
