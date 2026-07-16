# App-data store — app.db (conversations, saved queries, history, open tabs)

Ports `src/main/appdata/store.ts` + `src/main/ipc/appdata.ts`. Types:
`shared/appdata.ts`. Renderer client for the open-tabs half:
`src/renderer/src/lib/tab-persistence/` (see
[`docs/tab-persistence.md`](../../../docs/tab-persistence.md)). Task: T-205.

## v1 behavior contract

### Schema (exact, from `MIGRATIONS` in `appdata/store.ts`)

SQLite `userData/app.db`, PRAGMA `journal_mode = WAL`, `foreign_keys = ON`.
Six tables, five indexes, created by three forward-only migrations keyed on
`PRAGMA user_version` (`MIGRATIONS[v]` upgrades version `v` → `v+1`, each
inside a transaction that also bumps `user_version`; never reorder/rewrite,
only append):

| Version | Tables (columns) | Indexes |
|---|---|---|
| v1 | `conversations(id PK, title, created_at, updated_at, total_input_tokens DEF 0, total_output_tokens DEF 0, tool_call_count DEF 0)`; `messages(id PK, conversation_id REFERENCES conversations ON DELETE CASCADE, seq, role, content, timestamp, extra)`; `saved_queries(id PK, name, sql, connection_type, created_at, updated_at)`; `meta(key PK, value)` | `idx_conversations_updated_at(updated_at DESC)`, `idx_messages_conversation(conversation_id, seq)`, `idx_saved_queries_updated_at(updated_at DESC)` |
| v2 | `query_history(id PK, sql, connection_id, connection_type, status, duration_ms, row_count, error, executed_at)` | `idx_query_history_executed_at(executed_at DESC)` |
| v3 | `open_tabs(id PK, position, title, sql, connection_id, db_name, schema_name, saved_query_id, auto_commit DEF 1)` | `idx_open_tabs_position(position)` |

`meta` keys in use: `activeConversationId`, `activeTabId`. All timestamps are
epoch milliseconds. `open_tabs.sql` is an opaque editor buffer (any driver's
language — the column comment is explicit; no parsing).

### Corrupt-quarantine

Constructor: if the initial open/migrate throws (not `:memory:`, which
rethrows), the file is renamed to `` `${filePath}.corrupt-${Date.now()}` ``
(best-effort) and a fresh DB is created. Boot never crash-loops; the user
sees empty state; the quarantined file remains for inspection.

### Behavioral details worth pinning

- **Conversations**: `upsertConversation` replaces the row and **all its
  messages wholesale** in one transaction (`DELETE` + re-insert, `seq` =
  array index); the `ON CONFLICT` update deliberately does **not** touch
  `created_at`. `deleteConversation` relies on `ON DELETE CASCADE` and clears
  the `activeConversationId` meta if it pointed at the deleted id.
  `listConversations` returns newest-`updated_at`-first with full messages;
  optional message fields (`toolCalls`, `toolCallId`, `isError`) ride in the
  `extra` JSON column and are **omitted, not null** when absent.
- **Saved queries**: upsert keeps `created_at` on conflict;
  `connectionType` omitted when the column is null.
- **Query history**: `listQueryHistory(limit = 500)` newest-first;
  `addQueryHistory(entry, maxItems)` inserts and prunes to the newest
  `keep = max(1, floor(maxItems))` **in one transaction** (the clamp protects
  against a misconfigured `general.maxHistoryItems` of 0 wiping the table);
  optional fields (`connectionId`, `connectionType`, `durationMs`,
  `rowCount`, `error`) omitted when null. Also `deleteQueryHistory(id)` and
  `clearQueryHistory()`.
- **Open tabs**: `listOpenTabs` orders by `position ASC` and returns
  `{ tabs, activeId }`; per-row, `connectionId`/`database`/`schema` are
  serialized as explicit `null`s while `savedQueryId` is **omitted** when
  null (asymmetry is in the v1 mapper — pin it); `auto_commit` integer ↔
  boolean. `applyOpenTabOps(ops)` applies a `TabOp[]` batch
  (`upsert {tab, position}` / `delete {id}` / `active {id|null}`) in a single
  transaction, in order; empty batch is a no-op.
- **Import channels** (one-time localStorage migration):
  `importConversations` / `importSavedQueries` no-op returning 0 unless the
  target table is empty; otherwise bulk-insert in a transaction and return
  the count.

### The 15 `appdata:*` channels (`ipc/appdata.ts` — pure pass-through glue)

| Group (count) | Channels |
|---|---|
| conversations (5) | `appdata:conversations:list` / `:upsert` / `:delete` / `:set-active` / `:import` |
| saved-queries (4) | `appdata:saved-queries:list` / `:upsert` / `:delete` / `:import` |
| query-history (4) | `appdata:query-history:list` / `:add` / `:delete` / `:clear` |
| open-tabs (2) | `appdata:open-tabs:list` / `:apply` |

### The tab-persistence engine's expectations of `apply`

`lib/tab-persistence/engine.ts` (renderer) debounces changes (default 400 ms),
diffs against a baseline, and sends the minimal op batch through
`transport.apply` (`transport.ts` → `appdata:open-tabs:apply`). Its
correctness leans on the store: **the batch must be atomic** — the engine
advances its baseline only when `apply` resolves, and a failed batch is
retried by re-diffing, so a half-applied batch would desync durable state
from the baseline permanently. Writes are serialized client-side (never
overlapping), so the store needs no cross-batch ordering guarantees beyond
per-call atomicity. `list` is called once at startup to hydrate the restore
baseline (`initTabPersistence` in `src/renderer/src/main.tsx`).

## v2 design: `verql-appdata`

- **Engine:** `rusqlite`, one `Connection` owned by the crate, all access on
  `tokio::task::spawn_blocking` (or a dedicated thread + channel — T-205
  picks; either satisfies the never-block-the-runtime rule). Statements are
  small and indexed, as in v1; no async SQLite needed.
- **Same file, same scheme — the headline parity case:** identical PRAGMAs
  (`journal_mode = WAL`, `foreign_keys = ON`) and an identical `MIGRATIONS`
  array carrying the **same SQL text**, gated on the same
  `PRAGMA user_version`. A v1 `app.db` (user_version = 3) opens in v2 with
  zero migrations executed and no schema churn; a fresh v2 file is
  byte-compatible with what v1 would create (so a rollback to v1 during the
  A/B period also works). WAL sidecars (`app.db-wal`/`-shm`) are handled by
  SQLite itself; the v1 importer copies nothing — v2 opens the file in place.
- **Corrupt-quarantine ported:** same rename pattern
  `app.db.corrupt-<epoch-millis>`, same fresh-recreate, same in-memory
  rethrow. "Corrupt" means the open **or any migration** fails, as in v1.
- **Serde mapping:** row → shared-type conversion mirrors the v1 mappers'
  omit-vs-null choices exactly (`skip_serializing_if = "Option::is_none"`
  for the omitted fields; explicit `null` for `PersistedTab.connectionId`/
  `database`/`schema`) — 04 §type strategy makes this the round-trip fixture
  target. `extra` stays an opaque JSON column so the message shape can evolve
  without migrations (v1's stated design).
- **Transactions:** `upsertConversation`, `applyOpenTabOps`,
  `addQueryHistory`+prune, and both imports are single `rusqlite`
  transactions, matching the v1 boundaries listed above.
- **Dispatch handlers** stay pass-through one-liners per channel, as
  `ipc/appdata.ts` is today.

## Parity cases

1. **v1 file opens unchanged:** golden `app.db` fixture built by v1 (seeded
   conversations with tool-call extras, saved queries, 600 history rows,
   open tabs incl. null/omitted field variants, both meta keys) → v2
   `appdata:*` list channels return JSON byte-identical to v1's responses;
   `user_version` still 3; `sqlite3 .schema` diff empty.
2. Fresh-create equivalence: v2-created empty db → opened by v1 → v1 boots
   and operates (rollback safety).
3. `addQueryHistory` with `maxItems = 0` leaves exactly 1 row (clamp);
   with 200 leaves the newest 200 by `executed_at`.
4. `upsertConversation` twice with edited history: second write fully
   replaces messages; `created_at` unchanged; `seq` re-derived from array
   order.
5. Delete active conversation → `appdata:conversations:list` returns
   `activeConversationId: null`.
6. `applyOpenTabOps` mixed batch (upsert + delete + active) is atomic: a
   forced mid-batch failure (fixture: constraint violation) leaves the
   pre-batch state, and the engine's retry converges (engine unit tests reuse
   the Rust store through the parity harness transport).
7. Import no-op: `appdata:conversations:import` against a non-empty table
   returns `{ imported: 0 }` and writes nothing.
8. Quarantine: garbage bytes at `app.db` → boot succeeds, empty lists, a
   sibling `app.db.corrupt-<ts>` exists.

## Open questions

- `spawn_blocking`-per-call vs a dedicated writer thread: measure under the
  activity-heavy startup burst in T-205 and log the choice (both are
  contract-neutral).
- Whether the A/B parity period ever runs v1 and v2 against the *same live*
  app.db concurrently (WAL allows multi-process, but the harness should
  probably copy the fixture per run) — decide in the verification harness
  task, not here.
