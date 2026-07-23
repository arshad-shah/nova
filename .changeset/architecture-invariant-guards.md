---
---

Add two architecture-invariant guard tests (#171): capability availability must
come from declared `DriverCapabilities` rather than adapter method probing, and
HTTP request bodies must be decoded once via `Buffer.concat` rather than
per-chunk string concatenation. Both are static fitness functions under
`tests/unit/audit/` with teaching failure messages; no shipped behaviour
changes. CLAUDE.md now indexes each architecture invariant to its enforcing test.
