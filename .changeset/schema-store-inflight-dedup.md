---
"verql": patch
---

De-duplicate in-flight schema requests so concurrent callers share one round trip.

The schema store cached resolved results but tracked no pending requests, so the
cache was only consulted after a request settled. Opening an ER diagram while the
explorer was expanded on the same schema — or any surface asking for the same
table's columns as another — fired a separate `DB_GET_COLUMNS` (and `DB_GET_TABLES`,
`DB_GET_INDEXES`, `DB_GET_ROW_COUNT`, `DB_GET_SCHEMA_OBJECTS`, `DB_GET_SCHEMAS`,
`DB_GET_DATABASES`) per caller. Each fetcher now caches its in-flight promise keyed
identically to its result cache; a second caller arriving before the first settles
awaits the same promise. Entries are evicted the moment a request settles so a
failed request never poisons the key, and cache invalidation (`clearCache`,
disconnect, connection delete) drops pending entries alongside the results they
would populate.
