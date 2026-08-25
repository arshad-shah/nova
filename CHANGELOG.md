# Changelog

## 1.8.0

### Minor Changes

- [#231](https://github.com/arshad-shah/verql/pull/231) [`81744f4`](https://github.com/arshad-shah/verql/commit/81744f4c0ad892a2056f096b0372c5d2fb2585ad) Thanks [@arshad-shah](https://github.com/arshad-shah)! - Bound the "View data" table browse so a huge table no longer loads whole into
  memory ([#213](https://github.com/arshad-shah/verql/issues/213)). The relational reader (`createRelationalGetTableData`) now fetches
  a page at a time using a driver-aware paging clause — a new `pagination` driver
  capability (`limit-offset` or `offset-fetch`) instead of a hardcoded `LIMIT`.
  The page size is a new General setting, **Max Rows to View** (`maxViewDataRows`,
  default 500); when a table has more rows the grid header shows "Showing first N
  rows" and a **Load more** button that pages in the next batch. Export is
  unchanged — it deliberately stays an unbounded read (streaming export is tracked
  separately).

- [#232](https://github.com/arshad-shah/verql/pull/232) [`bc01ada`](https://github.com/arshad-shah/verql/commit/bc01ada7526892265613d0aeccc5fada97efed8b) Thanks [@arshad-shah](https://github.com/arshad-shah)! - Stop the Redis driver from blocking production servers with `KEYS` ([#212](https://github.com/arshad-shah/verql/issues/212)). Every
  key-listing path — listing key prefixes in the explorer, counting keys per node,
  and browsing a prefix's data — used `KEYS` (including unbounded `KEYS *`), which
  is O(N) over the entire keyspace and blocks the Redis server for its whole
  duration; simply expanding a connection to a multi-million-key instance could
  stall every other client. All of them now use the non-blocking, cursor-based
  `SCAN` (ioredis `scanStream`), and the previously decorative **Key scan batch
  size** (`scanCount`) setting is finally real — it is passed through as the `SCAN`
  `COUNT` hint. A new **Max keys to scan** (`maxKeys`, default 10,000) setting caps
  how far prefix-listing and key-counting walk, so neither can traverse a whole
  huge keyspace; the per-node count is a lower bound once a prefix exceeds the cap.

  Browsing a prefix's data ("View data") now pages through `SCAN` honouring the
  same **Max Rows to View** limit and "Load more" affordance as the relational
  drivers, and reads every key on a page in two pipelined round trips (one `TYPE`
  batch, one type-specific read batch) instead of two sequential round trips per
  key. Key names stay injection-safe throughout — they are dispatched as
  structured argument arrays and pipeline elements, never re-parsed. A new fitness
  function (`tests/unit/audit/redis-no-blocking-keys.test.ts`) fails the build if
  `KEYS` is reintroduced in either form (a `client.keys(...)` call or a `['KEYS', …]`
  command dispatch).

### Patch Changes

- [#229](https://github.com/arshad-shah/verql/pull/229) [`5149bbf`](https://github.com/arshad-shah/verql/commit/5149bbfa3bfe2afc7d5c04fe89d00db682a07e20) Thanks [@arshad-shah](https://github.com/arshad-shah)! - Guard renderer async effects against stale resolution so a response for a
  previous connection, plugin, or table can no longer land late and overwrite
  fresher state. Switching connections quickly in the query toolbar could let
  connection A's database/schema list populate connection B's selector (and
  auto-select a database that doesn't exist on B); the schema and plugin/table
  browse surfaces had the same class of race, and several pollers/lifecycle
  refreshers could `setState` after their pane had closed.

  Two small dependency-free hooks now state the pattern once: `useAsyncEffect`
  (cancels a fetch-on-dependency effect when its dependencies change or the
  component unmounts) and `useIsMounted` (an unmount probe for stable pollers and
  event-driven refreshers whose async lives outside a single effect run). Every
  previously unguarded async effect across the renderer adopts one of them.

- [#221](https://github.com/arshad-shah/verql/pull/221) [`236f64e`](https://github.com/arshad-shah/verql/commit/236f64e5740a6614f48534f444fb009ce731cd60) Thanks [@arshad-shah](https://github.com/arshad-shah)! - Make in-connection database switching a declared driver capability and stop
  swallowing switch failures ([#200](https://github.com/arshad-shah/verql/issues/200)). Support was previously discovered by catching
  a thrown error at two call sites with empty `catch {}` blocks, so a genuine
  failure (target database missing, permission denied, connection dropped) was
  indistinguishable from "adapter doesn't support switching" — the tab chrome
  updated regardless and the next query ran against the _previous_ database. A
  driver now declares `databaseSwitch: { supported: true }` (postgresql, mysql,
  mongodb, redis, snowflake; SQLite declares neither the capability nor the
  method), the adapter factory validates the declaration against the optional
  `switchDatabase` method in both directions, and the connection selector gates
  its database dropdown on the declaration rather than on a thrown error. The
  shared `applyConnectionContext` helper now backs both the selector and the
  pre-query prelude: a switch that fails on a _capable_ driver surfaces the error
  and leaves the tab's database unchanged instead of silently running elsewhere.

- [#220](https://github.com/arshad-shah/verql/pull/220) [`4540c24`](https://github.com/arshad-shah/verql/commit/4540c24adadd9d886bfa013f7a410d42ef3c277f) Thanks [@arshad-shah](https://github.com/arshad-shah)! - Fix a Redis stored command-injection vulnerability ([#211](https://github.com/arshad-shah/verql/issues/211)). The Redis driver read
  table data by interpolating server-supplied key names into command strings and
  running them through `query()`, whose parser splits on whitespace and newlines —
  so a key literally named `app:cache\nFLUSHALL` browsed by a DBA executed
  `FLUSHALL` (and `CONFIG SET`, `SCRIPT LOAD`, `SHUTDOWN`, … were reachable the same
  way). `getTableData` now dispatches structured argument arrays through a new
  `RedisCommandDispatcher.command([...])` method, which ioredis sends verbatim and
  never re-parses, closing the hole; keys containing spaces (previously unreadable
  due to bad arity) now read correctly too. `parseRedisCommands` — the parser for
  user-typed console input — gains `redis-cli`-style quoting, so `SET k "hello
world"` is finally three arguments instead of four. A new fitness function
  (`tests/unit/audit/redis-no-value-interpolation.test.ts`) fails the build if any
  `query()` call in the Redis plugin is handed an interpolated command string.

- [#233](https://github.com/arshad-shah/verql/pull/233) [`0c4b8e7`](https://github.com/arshad-shah/verql/commit/0c4b8e782488999f46a23d882c6d3639830f8c84) Thanks [@arshad-shah](https://github.com/arshad-shah)! - Code-split the renderer so the heaviest, non-first-paint dependencies no longer
  load before first paint ([#205](https://github.com/arshad-shah/verql/issues/205)). The query editor (Monaco), the results grid
  (ag-grid), the ER diagram, the AI chat panel (`react-markdown`/`shiki`), and the
  charts panel/dashboard now mount behind a `React.lazy` boundary at their render
  sites, with a shared spinner fallback while the chunk downloads. The renderer
  build gained a `manualChunks` split that pulls `monaco-editor`, `ag-grid`, and
  the markdown/highlight stack into their own vendor chunks, so opening a
  connection, the welcome screen, and the app shell paint without paying for the
  editor and grid up front. No component behaviour changes — only when each one
  loads.

- [#230](https://github.com/arshad-shah/verql/pull/230) [`924589d`](https://github.com/arshad-shah/verql/commit/924589d30ea07d80a6181480f388633f8ef5d35f) Thanks [@arshad-shah](https://github.com/arshad-shah)! - Schema explorer now handles load failures consistently. Every schema fetcher
  (databases, schemas, tables, columns, indexes, objects, row counts) applies one
  error policy: a failed load is recorded to the Activity stream, marked as
  errored rather than cached as an empty result, and can no longer surface as an
  unhandled promise rejection. The explorer tells a _failed_ load apart from a
  genuinely empty one — where it used to show a perpetual "Loading…" or a silent
  empty list, it now shows an error row with a Retry action.

- [#228](https://github.com/arshad-shah/verql/pull/228) [`b4abc54`](https://github.com/arshad-shah/verql/commit/b4abc5416d81e0ecd5fce57b5296fc033b2c9243) Thanks [@arshad-shah](https://github.com/arshad-shah)! - De-duplicate in-flight schema requests so concurrent callers share one round trip.

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

- [#227](https://github.com/arshad-shah/verql/pull/227) [`fc9775b`](https://github.com/arshad-shah/verql/commit/fc9775b8e3ddf972f391b7c3efc1b38611f85677) Thanks [@arshad-shah](https://github.com/arshad-shah)! - Subscribe to Zustand stores per-field across the renderer so shell chrome no
  longer re-renders on every keystroke.

  `App.tsx` already documented the rule — subscribe to individual fields, not the
  whole store, because App renders the entire shell and a whole-store subscription
  re-renders it on every store mutation (including per-keystroke `updateTabSql`,
  which also carries full result sets in the tabs store) — but 26 call sites still
  took the whole store. All 26 (tab bar, charts dashboard, status bar, command
  palette, connection selector/switcher, query panel/editor, sidebars,
  notifications, toasts, and the query-execution/transaction hooks) now select the
  exact fields they use; actions are stable references, so selecting them
  individually is free. A new fitness function,
  `tests/unit/audit/renderer-store-selectors.test.ts`, fails the build if a bare
  `useXStore()` whole-store subscription is reintroduced.

- [#218](https://github.com/arshad-shah/verql/pull/218) [`3e21102`](https://github.com/arshad-shah/verql/commit/3e21102a5c469a0dd68df76a275070add3c32fc0) Thanks [@arshad-shah](https://github.com/arshad-shah)! - Security: `isWriteQuery` now strips SQL comments with a string-aware scan
  instead of two literal-blind regexes. A comment marker (`/*`, `--`, `$$`)
  inside a quoted string is treated as data rather than opening a phantom
  comment, so a write hidden after such a marker — e.g.
  `SELECT '/*' AS a; DELETE FROM users; SELECT '*/' AS b` — is no longer
  mis-classified as a read and can no longer slip past the write-approval gate
  on the MCP server or the AI assistant. Input the scanner cannot confidently
  tokenise (unterminated quote, unbalanced block comment) is treated as a write
  (fail closed).

- [#224](https://github.com/arshad-shah/verql/pull/224) [`8962e8f`](https://github.com/arshad-shah/verql/commit/8962e8fd93607be68fc8ede5fa4797ce9316aaa7) Thanks [@arshad-shah](https://github.com/arshad-shah)! - Unify the two divergent SQL statement splitters into one shared walk ([#199](https://github.com/arshad-shah/verql/issues/199)). The
  SDK splitter (`string[]`) and the renderer gutter splitter (`Statement[]` with
  positions) were separate hand-written tokenisers that disagreed on statement
  boundaries — the SDK deleted comments and missed backticks, the renderer missed
  `''` doubling, and neither handled Postgres `$$…$$` bodies. They now share a
  single pure walk in `shared/sql/statement-splitter.ts` with two thin adapters,
  so "Run statement N" and the SQL importer/formatter always see the same text.
  Comments are now retained in emitted statements, dollar-quoted function bodies no
  longer split on their internal semicolons (gated on a new `supportsDollarQuoting`
  driver capability, set on Postgres), and a `statement-splitter-single-implementation`
  fitness function keeps a second tokeniser from reappearing.

## 1.7.0

### Minor Changes

- [#193](https://github.com/arshad-shah/verql/pull/193) [`6d7eced`](https://github.com/arshad-shah/verql/commit/6d7eced31b15051a0816be06856dc2d109b0c3c0) Thanks [@arshad-shah](https://github.com/arshad-shah)! - Replace the `@xyflow/react` + `@dagrejs/dagre` ER diagram with a handrolled,
  dependency-free renderer under `src/renderer/src/components/er/`. The diagram now
  says what a relationship _means_: every connector carries crow's-foot
  (Information-Engineering) cardinality — exactly one, zero or one, one or many,
  zero or many — with identifying relationships drawn solid and non-identifying
  dashed, plus a legend that renders from the same symbol geometry the connectors
  use, so the two can't drift. Connectors anchor at the row of the field they
  constrain rather than at the card's edge.

  The diagram now follows the active theme. A `theme-bridge` reads the ERD palette
  out of the semantic token layer (`--color-bg-inset`, `--color-border-strong`,
  `--color-key-pk`/`-fk`, `--color-accent`, `--color-data-accent`, …) and the type
  ramp, and repaints on `data-theme` change across dark, light, midnight and any
  plugin theme — no hardcoded colours and no external stylesheet the design system
  can't reach. Entity cards size to their content instead of a fixed 220px, and a
  layered layout engine places referenced entities ahead of the entities that
  reference them (left in LR, above in TB). Below a zoom threshold each card
  switches to a density read of its key structure without shifting any geometry.

  Removing both dependencies and `@xyflow/react/dist/style.css` drops roughly
  78 KB gzipped from the renderer bundle for the one surface that used them.
  Geometry invariants (no card overlaps, no connector leg crossing an uninvolved
  entity, deterministic output, cyclic/orphan termination, notation ordering) are
  guarded in `tests/unit/er/`.

### Patch Changes

- [#185](https://github.com/arshad-shah/verql/pull/185) [`ee8c367`](https://github.com/arshad-shah/verql/commit/ee8c367b3ae1f910d4b3aae24227327b7a398734) Thanks [@arshad-shah](https://github.com/arshad-shah)! - Driver capability declarations and adapter implementations can no longer
  silently disagree. A driver advertises features as serializable data on its
  factory (`session`, `explain`) that the renderer gates on, and implements the
  matching optional methods on its adapter that the glue calls — but nothing
  linked the two, so a driver could declare a transaction capability it never
  implemented (a toolbar button that crashed on use) or implement one it never
  declared (a feature that silently never appeared). The adapter factory now
  validates, in both directions, that each declaration maps to its adapter
  methods when it builds an adapter — the single point every connection passes
  through: a mismatch is an actionable error naming the capability, the offending
  method, and the fix, so the connect fails clearly instead of crashing later
  when the declared feature is used.

- [#179](https://github.com/arshad-shah/verql/pull/179) [`ad41b37`](https://github.com/arshad-shah/verql/commit/ad41b376e6802b54427f26648825edca04408963) Thanks [@arshad-shah](https://github.com/arshad-shah)! - ER diagram node labels now use a readable, themed label colour derived from the
  node's own hue instead of a hardcoded white. Every colour in the table palette
  is bright enough that white text fell below WCAG AA against it (as low as
  1.7:1 on the gold and green hues); the header label is now chosen from the
  fill's luminance, clearing AA on every hue and every theme. This closes the one
  place the renderer's foreground colour did not follow the theme, and the same
  `--color-on-fill-*` label tokens replace the remaining raw palette classes
  (`text-white`, `text-black`, `bg-black/50`, `divide-white`, `border-white`)
  across the window controls, appearance settings, avatars, modals, notifications
  sidebar and colour picker. A renderer-wide guard test now fails if any raw
  Tailwind palette utility is reintroduced.

- [#184](https://github.com/arshad-shah/verql/pull/184) [`d8cc04f`](https://github.com/arshad-shah/verql/commit/d8cc04fbcabcd8bae6e60aa46a4a8aebbfd2aea0) Thanks [@arshad-shah](https://github.com/arshad-shah)! - MCP tool-call approvals now describe non-SQL drivers in their own terms. The
  approval prompt previously exposed a field named `sql` and, for any driver that
  was not SQL (MongoDB, Redis, …), stuffed the tool's parameters into it as a JSON
  blob highlighted as SQL — mislabeling what the user was being asked to grant. The
  approval contract is now engine-neutral (an opaque `statement` plus the
  `language` to highlight it in), so a Mongo or Redis command shows verbatim, in
  its own syntax, and a guard test keeps the contract from drifting back to SQL.

- [#177](https://github.com/arshad-shah/verql/pull/177) [`dbbf684`](https://github.com/arshad-shah/verql/commit/dbbf684ff5b0cc9ccfb1e0c8e583d707282d6a22) Thanks [@arshad-shah](https://github.com/arshad-shah)! - MCP server: fix multi-byte UTF-8 corruption and cap the request body size. The
  `POST /messages` handler now buffers request chunks and decodes them once, so a
  non-ASCII character split across a TCP chunk boundary is no longer mangled into
  replacement characters. The body is also bounded to 1 MiB (tracked by byte
  length); an oversized request is answered with `413` and its connection is torn
  down instead of accumulating unbounded memory in the main process.

- [#186](https://github.com/arshad-shah/verql/pull/186) [`d6731b0`](https://github.com/arshad-shah/verql/commit/d6731b0fc4fade911429dee2068a3cfe2de4746d) Thanks [@arshad-shah](https://github.com/arshad-shah)! - Name the recurring surface widths instead of hand-rolling arbitrary pixel
  values. Dialog, palette and column widths that were scattered as `w-[400px]`,
  `w-[520px]`, `w-[230px]`, `max-w-[1280px]` and the like are now named steps:
  the `--container-prompt` (400px), `--container-palette` (520px) and
  `--container-hero` (230px) tokens back a new `width` variant on the `Modal`
  primitive (`width="prompt"` for confirm/blocking dialogs, `width="palette"` for
  the command palette), so surface width is chosen from a scale rather than left
  to each caller. Surface widths stay pixel-exact and density-independent.

  Content constraints (label truncation bounds, a suggestion-wrap max-width, a
  popover min-width) move onto the shared Tailwind width scale (`max-w-40`,
  `min-w-65`, …); these track UI density, so at the default comfortable density
  they render a little larger — more room before text truncates, never less, so
  nothing that fit before clips now. The macOS traffic-light gutter and a
  chevron-sized row spacer, which must stay fixed pixels, become inline widths.

  A new fitness guard (`renderer-no-arbitrary-width`) fails CI if any
  `w-[Npx]`/`max-w-[Npx]`/`min-w-[Npx]` is reintroduced under
  `src/renderer/src/components`, naming the file, line and the named step or
  inline-style exception to use instead.

- [#190](https://github.com/arshad-shah/verql/pull/190) [`531f482`](https://github.com/arshad-shah/verql/commit/531f482756f2a81afee002ad4ea32201a4530d9b) Thanks [@arshad-shah](https://github.com/arshad-shah)! - Route all renderer backend access through a single platform client. Renderer
  code now reaches the main process via `import { ipc } from '@/platform/client'`
  (`ipc.invoke` / `ipc.on` / `ipc.optional` / `ipc.available()` / `ipc.platform()`)
  instead of touching `window.electronAPI` directly, giving one chokepoint where
  cross-cutting concerns (error normalization, activity logging, retry,
  cancellation, instrumentation) can be added once rather than per call site.
  `useIpcQuery` is built on top of the same client. Behaviour is unchanged; an
  architecture guard (`renderer-backend-access-through-platform`) now fails the
  build if the bridge is referenced anywhere outside the platform layer.

- [#188](https://github.com/arshad-shah/verql/pull/188) [`cf976c6`](https://github.com/arshad-shah/verql/commit/cf976c6a7216916bf8acb701a618a4e35d1305c3) Thanks [@arshad-shah](https://github.com/arshad-shah)! - The theme and AI stores no longer throw when a plugin/IPC contribution list
  resolves to a non-array (previously `themes:list` or the AI provider/model lists
  resolving `undefined` surfaced as a `TypeError`); they now degrade to an empty
  list. Alongside this, the test suite is green again (7 failures fixed) and
  coverage is collected from both the unit and Storybook browser projects and
  merged into one gated report.

- [#182](https://github.com/arshad-shah/verql/pull/182) [`c6814a1`](https://github.com/arshad-shah/verql/commit/c6814a131a565a912444de3ae7bdb2d5ac078ddb) Thanks [@arshad-shah](https://github.com/arshad-shah)! - Extend the type scale to the app's real density instead of hand-rolling sub-12px
  font sizes. Two named steps now sit below `xs` — `text-3xs` (10px) and `text-2xs`
  (11px), each with its own tight line-height — declared in the token layer and
  exposed as `size` variants on `Text`, `Label`, `Code` and `Tag` (and used by
  `Badge`). The 83 ad-hoc `text-[8/9/10/11px]` values across the renderer's chrome
  (explorer tree, status bar, activity rows, badges, AI panels) are migrated onto
  these steps; the handful at 8/9px round up to 10px, the desktop legibility floor.
  A new `renderer-no-arbitrary-font-size` guard test keeps the arbitrary-value
  escape hatch from re-opening — any `text-[Npx]` reintroduced in a component fails
  CI and the message names the scale step to use instead.

- [#181](https://github.com/arshad-shah/verql/pull/181) [`76867eb`](https://github.com/arshad-shah/verql/commit/76867eb5b9b28e78627eb0183bb2c911bd116cb4) Thanks [@arshad-shah](https://github.com/arshad-shah)! - Type the main → renderer broadcast event seam end-to-end. Listener registration
  (`window.electronAPI.on`) is now generic over `keyof IpcEventMap`, so the event
  constant constrains the callback payload — a wrong-arity or wrong-typed listener
  is a compile error instead of a silent runtime mismatch. The per-window emit
  path gains a typed `sendTo(webContents, event, …)` helper (sibling to
  `broadcast`), and the three remaining raw `webContents.send` call sites route
  through it. This also corrects the `AI_CHAT_EVENT` payload contract, which
  declared a single `[event]` argument while both emitter and listener have always
  used two (`[streamId, event]`); the wire behaviour is unchanged. A new guard
  test (`ipc-event-seam-typed`) keeps `IpcEventShapes` and `IPC_EVENTS` in
  bijection and fails if the listener seam ever reverts to a bare `string` key.

## 1.6.0

### Minor Changes

- [#146](https://github.com/arshad-shah/verql/pull/146) [`ea6409c`](https://github.com/arshad-shah/verql/commit/ea6409ce5f6c555832a8a8a36e8b93cec25ff2c2) Thanks [@arshad-shah](https://github.com/arshad-shah)! - Drivers now declare their own visual identity.

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

- [#146](https://github.com/arshad-shah/verql/pull/146) [`ea6409c`](https://github.com/arshad-shah/verql/commit/ea6409ce5f6c555832a8a8a36e8b93cec25ff2c2) Thanks [@arshad-shah](https://github.com/arshad-shah)! - Menus: one implementation for every menu in the app.

  The renderer carried three copies of the same floating-menu machinery.
  `DropdownMenu` accepted only `{ label, onSelect, disabled }`. `ContextMenu` was
  a near-copy of it with no keyboard navigation and no collision handling, so
  right-clicking an explorer node near a screen edge opened a menu that ran off
  the viewport. `MenuBar` never used the primitive at all — despite a comment
  claiming its look — and hand-rolled the same stack a third time, which is how it
  ended up the most capable menu in the app while not being the shared one.

  All three now render `primitives/surfaces/menu`. Nothing new was added to the
  dependency tree: `@floating-ui/react` was already installed, and this uses the
  parts of it the app had never touched — `useListNavigation` (replacing a
  `querySelectorAll`-per-keypress loop), `useTypeahead`, `FloatingFocusManager`,
  `FloatingTree` with `safePolygon` for submenus, and the `size` middleware so a
  long connection list scrolls instead of overflowing.

  Menus can now express what the app already needed: icons, accelerators, section
  headers, separators, submenus, check and radio rows with the right ARIA roles
  (`menuitemcheckbox` / `menuitemradio` / `group`), and a destructive tone. Two
  entry points, one implementation — a declarative `items` tree for data-shaped
  menus like the application menu, and compound `<Menu.Item>` for rows with custom
  content.

  Visible fixes that fall out of this: right-click near a screen edge now flips
  into view; Escape returns focus to the trigger instead of stranding it on
  `<body>`; typing jumps to a row; and the leading icon column is reserved per
  menu rather than per row, so labels no longer jag left and right depending on
  whether their neighbour has an icon — all three previous menus got that wrong.

  The menubar keeps only what is genuinely menubar-specific (cross-menu hover
  switching and ←/→) in a local `useMenubar` hook.

  An audit test now fails CI if a fourth copy appears: `role="menu"` may only be
  declared inside the menu module.

- [#149](https://github.com/arshad-shah/verql/pull/149) [`f6e5263`](https://github.com/arshad-shah/verql/commit/f6e5263f987f5bbd210dc7fca15d68e70bb13d38) Thanks [@arshad-shah](https://github.com/arshad-shah)! - Redesigned the tab bar. Tabs are larger and roomier at every UI density
  (Settings → Appearance → UI Density), sized off a proper density scale instead
  of a fractional accident — the previous "comfortable" tab was 33.75px tall.
  The active tab no longer relies on a thin accent strip across the top; it now
  reads as a raised surface welded into the workspace, with a brighter label and
  matching corner rounding.

  Tabs are now fully keyboard-operable and exposed to assistive tech: the tab
  strip is a single tab stop, arrow keys move focus along it, Enter/Space
  activates the focused tab, Home/End jump to the first/last tab, and
  Delete/Backspace closes it (respecting the same unsaved-changes and
  open-transaction prompts as clicking the close button). Switching focus with
  the arrow keys does not itself switch tabs — activating one opens a real
  editor and, for a database tab, a real connection, so that only happens on an
  explicit activate.

  Fixed: Close Others, Close to the Right, and Close All could silently discard
  unsaved changes and abandon open transactions, bypassing the confirmation
  prompts that a single tab's close button always honored. They now behave
  consistently with closing one tab at a time: clean tabs close immediately, any
  unsaved tabs in the batch share one confirmation before their changes are
  discarded, and any tab with an open transaction is prompted to commit or roll
  back before it closes.

  Fixed: tab icons no longer ignore the active theme.

  Fixed: inactive tab labels had insufficient contrast against the tab
  background on several bundled themes; labels are now readable at a minimum
  contrast ratio across all bundled themes, checked automatically going forward.

- [#146](https://github.com/arshad-shah/verql/pull/146) [`ea6409c`](https://github.com/arshad-shah/verql/commit/ea6409ce5f6c555832a8a8a36e8b93cec25ff2c2) Thanks [@arshad-shah](https://github.com/arshad-shah)! - UI: complete the deferred modularity follow-ups from [#145](https://github.com/arshad-shah/verql/issues/145).

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

### Patch Changes

- [#146](https://github.com/arshad-shah/verql/pull/146) [`ea6409c`](https://github.com/arshad-shah/verql/commit/ea6409ce5f6c555832a8a8a36e8b93cec25ff2c2) Thanks [@arshad-shah](https://github.com/arshad-shah)! - Testing: two adversarial coverage passes over the least-covered high-risk code.

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

- [#149](https://github.com/arshad-shah/verql/pull/149) [`f6e5263`](https://github.com/arshad-shah/verql/commit/f6e5263f987f5bbd210dc7fca15d68e70bb13d38) Thanks [@arshad-shah](https://github.com/arshad-shah)! - Testing: turn coverage into a ratchet that CI enforces.

  `@vitest/coverage-v8` was already a dependency but had never been configured, so
  coverage had never been measured and nothing stopped a change from lowering it.
  The unit project now reports coverage through `pnpm test:coverage`, and CI runs
  that instead of a bare `vitest run --project unit`.

  `vitest.config.ts` gains a `coverage` block whose `thresholds` are pinned to the
  measured floor rather than to an aspiration. CI fails below the floor, so
  coverage can only go up; raising it means raising the floor in the same PR.
  Verified by temporarily demanding more than the codebase had and confirming a
  non-zero exit and an explicit threshold error.

  When the ratchet was first pinned the floor was statements 33.52, branches 28.95,
  functions 28.40, lines 35.34, across 1646 passing tests in 180 files. The
  behavioural test passes in this same release raised it well past that, and the
  floor was raised with them each time — which is the mechanism working as
  intended rather than a number to admire.

  Two things the numbers do not say, both noted in the config so the next reader
  doesn't misread them. The floor covers the `unit` project only — the `storybook`
  project renders components in a real browser and isn't counted, so component
  percentages understate reality. And a threshold is a ratchet, not a goal:
  percentage is trivially satisfied by tests that render code without asserting
  behaviour, so the floor exists to prevent regression, not to be chased.

  `src/preload/**` and the renderer bootstrap are excluded — entry points with no
  logic worth asserting.

- [#146](https://github.com/arshad-shah/verql/pull/146) [`ea6409c`](https://github.com/arshad-shah/verql/commit/ea6409ce5f6c555832a8a8a36e8b93cec25ff2c2) Thanks [@arshad-shah](https://github.com/arshad-shah)! - Docs: audit every page against the source and fix what had drifted.

  Every document in `docs/` and its `site/` counterpart was checked one at a time,
  claim by claim, against the actual code — roughly 650 factual claims verified,
  64 corrections. Each page was then re-checked by a second pass whose job was to
  assume the first had been lazy, and to read the diff for errors the audit itself
  introduced.

  The user guide had drifted furthest, and in the way that matters most: it still
  told Windows users to download and run an unsigned `.exe`, and to verify it.
  That installer does not exist — Verql ships on Windows through the Microsoft
  Store, which updates and signs itself. The Linux Homebrew formula was missing
  from the update instructions entirely.

  `docs/plugin-audit.md` is pure status ("fully wired" / "partly wired" / "not
  wired") and so rots fastest; every marker was re-derived from source, and 12 were
  wrong.

  The menu and design-system sections were deliberately left alone — they are being
  rewritten in [#146](https://github.com/arshad-shah/verql/issues/146) and are documented there.

- [#146](https://github.com/arshad-shah/verql/pull/146) [`ea6409c`](https://github.com/arshad-shah/verql/commit/ea6409ce5f6c555832a8a8a36e8b93cec25ff2c2) Thanks [@arshad-shah](https://github.com/arshad-shah)! - Security: a plugin's manifest icon could read arbitrary files.

  `plugins:list` resolved a plugin's `manifest.icon` against the plugin's own
  directory with `path.resolve` and no containment check, then base64-encoded
  whatever it found and returned it to the renderer. Because a manifest is
  attacker-controlled for any third-party plugin, an entry like
  `"icon": "../../../../etc/passwd"` — or any absolute path — escaped the plugin's
  directory and the file's contents were handed back as the plugin's "icon".

  Any installed plugin could therefore read any file the app process can read,
  with no prompt, no permission grant, and no capability gate. The file extension
  only ever selected a MIME type, so it restricted nothing: a traversal to
  `../secret.png` was read and returned too.

  **Who is affected:** anyone who has installed a third-party plugin. Bundled
  plugins were never able to reach this path. There is no indication of
  exploitation, and nothing in the app itself triggers it — a plugin had to ask.

  **The fix:** icon paths are now pinned to the plugin's own directory through a
  shared `resolveWithinPlugin()` guard, and an unknown extension means the file is
  never opened rather than read and mislabelled. The same guard has always
  protected `manifest.main`, but it was written inline in the plugin host and
  never shared — which is precisely why `icon` shipped without it. Both call-sites
  now use the one guard, so a third manifest-driven path cannot forget it.

  Found by an adversarial test-hardening pass, and now pinned by regression tests
  covering traversal, absolute paths, a traversal wearing an image extension, a
  non-image inside the plugin directory, and a legitimate nested icon still
  resolving.

- [#146](https://github.com/arshad-shah/verql/pull/146) [`ea6409c`](https://github.com/arshad-shah/verql/commit/ea6409ce5f6c555832a8a8a36e8b93cec25ff2c2) Thanks [@arshad-shah](https://github.com/arshad-shah)! - Internal: route hardcoded identifiers through their constants, and guard it.

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

## 1.5.0

### Minor Changes

- [#141](https://github.com/arshad-shah/verql/pull/141) [`61c0995`](https://github.com/arshad-shah/verql/commit/61c0995995f616ae8f9c4df32b78bf0a4bbbda3a) Thanks [@arshad-shah](https://github.com/arshad-shah)! - The interface reads at a proper desktop size. Everything used to render **12.5%
  smaller than designed**: UI density set the root font size (13/14/15px) as its
  scaling lever, but the styling scale is relative to that root — so at the
  default density body text came out at 10.5px instead of 12px, the title bar at
  35px instead of 40px, and buttons at 31.5px instead of 36px. Most text sat below
  both the macOS (11px floor, 13px body) and Windows (14px body) guidance for
  desktop apps.

  Density no longer drags the whole interface down with it, and the scale has been
  raised a step across all three settings — the old floor was simply too small on
  a desktop display. At the default (**comfortable**) body text is now 15px, with
  a 45px title bar and 42px controls. **Compact** is now what the old default
  aimed to be — 12/14/16px text and 36px controls — so it's a genuinely dense
  option rather than an unreadable one, and **spacious** goes further again (16px
  body, 48px controls).

  If the new default feels roomy, Settings → Appearance → UI density → compact.

- [#141](https://github.com/arshad-shah/verql/pull/141) [`61c0995`](https://github.com/arshad-shah/verql/commit/61c0995995f616ae8f9c4df32b78bf0a4bbbda3a) Thanks [@arshad-shah](https://github.com/arshad-shah)! - Ion: a new look for Verql. **Ion is now the default theme** — a new palette
  paired with a redrawn ribbon mark, and every brand artifact (app icons, Store
  tiles and listing art) is generated from that one source.

  The design system was rebuilt behind it. Toast was rebuilt and is now the only
  one; Banner merged into Alert; Avatar was redesigned around what the app
  actually shows; Input absorbed the single-line field variants; Card gained
  variants and replaced hand-rolled surfaces; SegmentedControl and ToggleGroup are
  new; Button gained loading and subtle variants and a corrected destructive red.
  Components that reached for native HTML now use primitives instead, and the
  pickers moved onto them.

  Colour is theme-driven throughout: the action colour, Badge and Kbd shadows, and
  Shiki code blocks all follow the active theme rather than hardcoded values, and
  the stale Nightshift colours are gone. Alert and Toast body text now reads at
  the same contrast as its title, and Badge can mark PK/FK/UNIQUE keys.

  Naming follows one system across the primitives: **tone** carries meaning
  (success, warning, error) and **variant** carries weight (solid, subtle, …).

- [#141](https://github.com/arshad-shah/verql/pull/141) [`61c0995`](https://github.com/arshad-shah/verql/commit/61c0995995f616ae8f9c4df32b78bf0a4bbbda3a) Thanks [@arshad-shah](https://github.com/arshad-shah)! - macOS gets the full application menu. The native menu and the Windows/Linux
  menu bar were declared in two separate places and had drifted: macOS was
  missing the entire **Query** menu (Run, Run Selection, Save, Format Document),
  plus Settings, Find in Editor, Close/Reopen Tab, the Explorer/Plugins and
  sidebar/dock toggles, Welcome and What's New.

  The menu is now declared once in `shared/menus.ts` and rendered by both
  surfaces, so a command can't exist on one platform and not another. Placement
  still follows each platform's conventions rather than mirroring one OS onto
  another: Settings sits in the macOS app menu at Cmd+, and under File elsewhere.

  **About now opens Verql's own About window on macOS** instead of the system
  About panel, matching every other platform.

  Menu shortcuts follow your keybindings. Previously the native menu hardcoded
  its accelerators, so rebinding a command in Settings → Keybindings left the old
  key firing the old command. One visible consequence: **New Query is Cmd/Ctrl+T**
  — the shortcut the keybinding list always advertised — where the menu used to
  say Cmd/Ctrl+N.

### Patch Changes

- [#141](https://github.com/arshad-shah/verql/pull/141) [`61c0995`](https://github.com/arshad-shah/verql/commit/61c0995995f616ae8f9c4df32b78bf0a4bbbda3a) Thanks [@arshad-shah](https://github.com/arshad-shah)! - The documentation site now wears Ion. It still carried the old Nightshift mint
  while the app had moved to Ion's violet, so the docs and the product no longer
  looked like the same thing. The site's accent, ink surfaces and hero glow are
  now taken from the app's own Ion tokens, in both light and dark.

- [#141](https://github.com/arshad-shah/verql/pull/141) [`61c0995`](https://github.com/arshad-shah/verql/commit/61c0995995f616ae8f9c4df32b78bf0a4bbbda3a) Thanks [@arshad-shah](https://github.com/arshad-shah)! - Storybook: give every story the app `ThemeProvider` from a single global
  decorator. The title bar and welcome screen stories crashed with "useTheme must
  be used within ThemeProvider" — both render `VerqlMark`, whose `auto` variant
  resolves light/dark through `useTheme()`, and Storybook's theme toolbar only set
  the `data-theme` attribute, never the React context. Every story that touched
  the theme had to remember its own provider decorator, and the two newest ones
  didn't.

  The provider now wraps all stories from `.storybook/preview.tsx`, and the ten
  per-file decorators that duplicated it are gone. The theme toolbar drives the
  provider through its own `setTheme` instead of writing `data-theme` behind its
  back, so the provider stays the single writer of that attribute — this replaces
  addon-themes' `withThemeByDataAttribute`, which raced it.

## 1.4.1

### Patch Changes

- [#138](https://github.com/arshad-shah/verql/pull/138) [`b4307d1`](https://github.com/arshad-shah/verql/commit/b4307d19d08238a28624ae5679759fde8524b8e7) Thanks [@arshad-shah](https://github.com/arshad-shah)! - Security: resolve all open Dependabot advisories. Bumped direct deps
  (dompurify, vite, vitest) and refreshed the `pnpm-workspace.yaml` transitive
  `overrides` to current patched versions — form-data, hono, dompurify, undici,
  esbuild, tar, tmp, ws, @babel/core, js-yaml (both the 3.x consumer via
  read-yaml-file and the 4.x line). The undici override is bounded to `^7.28.0`
  so jsdom's test DOM environment keeps working. The docs `site/` gets astro
  6.4.8 plus its own dompurify/esbuild overrides. App and site workspaces both
  report zero known vulnerabilities; production build and the test baseline are
  unchanged.

- [#137](https://github.com/arshad-shah/verql/pull/137) [`510725c`](https://github.com/arshad-shah/verql/commit/510725c42097c3aff689ab38c563b89a87c2a19e) Thanks [@arshad-shah](https://github.com/arshad-shah)! - Docs site: sync curated pages with the current source. Restored content that had
  drifted behind the code — the driver `nouns` capability (object/field/record
  terms) in the plugin guide and architecture map, the `onboarding.*` settings
  state, the log-kit `onTransportError` failure-isolation and four-level `Logger`
  facade detail in the activity subsystem, and the centralized `APP_ACTION` id
  constants in the AI docs. Each addition was validated against the actual
  subsystem source, not the internal `docs/` copies.

## 1.4.0

### Minor Changes

- [#116](https://github.com/arshad-shah/verql/pull/116) [`a42e108`](https://github.com/arshad-shah/verql/commit/a42e10897dca239b73e2bce70e5fd52cde1c7c7f) Thanks [@arshad-shah](https://github.com/arshad-shah)! - Polish the toast notifications that appear bottom-right. Toasts now slide in,
  and dismissing one smoothly slides the rest up instead of jumping. Each toast
  shows an auto-dismiss progress bar that pauses while you hover so you have time
  to read it, and the message reads in normal high-contrast text with the status
  colour on the icon and a slim left rail. Long-running "loading" toasts keep
  their spinner and stay until they finish.

- [#116](https://github.com/arshad-shah/verql/pull/116) [`a42e108`](https://github.com/arshad-shah/verql/commit/a42e10897dca239b73e2bce70e5fd52cde1c7c7f) Thanks [@arshad-shah](https://github.com/arshad-shah)! - Refine the form-field primitives and rebuild the multi-line text editor. Every
  field — text input, number input, password, file path/content pickers, date
  picker, and the text area — now scales with the **UI density** setting
  (Settings → Appearance → compact / comfortable / spacious), changing height,
  text size, corner radius, and padding together. Field glyphs are now crisp
  icons (show/hide password, file, calendar, clear, …) instead of text symbols.

  The password field shows a four-segment strength meter; the file pickers tint
  when a file is selected and highlight on drag-and-drop. The text area is rebuilt
  as a card you can resize with a corner grip (vertical, horizontal, or both),
  with optional auto-grow, a character counter that warns near a limit, a clear
  button, and a footer toolbar. Existing usages are unchanged — the new
  capabilities are opt-in.

- [#116](https://github.com/arshad-shah/verql/pull/116) [`a42e108`](https://github.com/arshad-shah/verql/commit/a42e10897dca239b73e2bce70e5fd52cde1c7c7f) Thanks [@arshad-shah](https://github.com/arshad-shah)! - Make toast notifications easier to read and optionally self-dismissing. The
  message now renders in normal high-contrast text instead of being tinted the
  status colour; the status colour moves to the icon and a slim colored rail down
  the left edge, over a faint tonal background. Toasts can now take a `duration`
  to auto-dismiss with a progress bar that pauses while you hover, so you have
  time to read them. Padding and corners follow the UI density setting.

### Patch Changes

- [#116](https://github.com/arshad-shah/verql/pull/116) [`a42e108`](https://github.com/arshad-shah/verql/commit/a42e10897dca239b73e2bce70e5fd52cde1c7c7f) Thanks [@arshad-shah](https://github.com/arshad-shah)! - Refresh the checkbox: the checkmark is now a crisp icon that springs in when
  ticked (with a centered dash for the mixed/indeterminate state), the box size
  follows the UI density setting (Settings → Appearance), and the focus glow only
  appears for keyboard navigation. No behaviour or API changes.

## 1.3.2

### Patch Changes

- [#114](https://github.com/arshad-shah/verql/pull/114) [`64a8078`](https://github.com/arshad-shah/verql/commit/64a80787c5a09d26b64436a6ce8299f4e955ed2c) Thanks [@arshad-shah](https://github.com/arshad-shah)! - Rebuild the release & distribution pipeline around three clean channels —
  Homebrew cask (macOS), Homebrew formula (Linux), and the Microsoft Store
  (Windows MSIX). Dropped the unsigned NSIS installer, the macOS update zip, and
  the unused `latest*.yml` electron-updater feeds from the release. The Homebrew
  tap is now regenerated from versioned templates (`packaging/homebrew/*.tmpl` via
  `scripts/render-homebrew.mjs`) instead of in-place `awk` surgery — the cask
  template preserves the existing working cask verbatim (including the
  quarantine-strip `postflight`), with only the version and sha256s injected, and
  a new Linux formula installs the AppImage. The release now publishes a single
  cosign-signed `sha256sums.txt` covering every platform's binaries (previously
  each runner's checksum file clobbered the others under `cp -n`, leaving only the
  Windows entries).

## 1.3.1

### Patch Changes

- [#111](https://github.com/arshad-shah/verql/pull/111) [`2de46a4`](https://github.com/arshad-shah/verql/commit/2de46a4bcc117931c7499daec3096480f547828b) Thanks [@arshad-shah](https://github.com/arshad-shah)! - Fix the automated release tagging: `scripts/release-tag.mjs` ran `git tag -a`
  on a CI runner with no committer identity, so the first auto-tag of a merged
  Version PR died with "empty ident name" and no `vX.Y.Z` / `sdk-vX.Y.Z` tag was
  created. The script now configures a bot git identity (only when none is set)
  before tagging, so the canonical Changesets merge → auto-tag → gated publish
  flow completes without a manual tag push.

## 1.3.0

### Minor Changes

- [#108](https://github.com/arshad-shah/verql/pull/108) [`3f57477`](https://github.com/arshad-shah/verql/commit/3f57477b20c86dc15f232b3061aea0797cf669e7) Thanks [@arshad-shah](https://github.com/arshad-shah)! - Make destructive-statement detection driver-aware.

  The "this can change data — run anyway?" confirm no longer assumes SQL for every
  connection. Detection now routes through the statement contribution selected by
  the driver's `statementSyntax` capability (the same mechanism the Run/Explain
  gutter uses), so each driver gets the right semantics:

  - **SQL** — `DELETE`/`DROP`/`TRUNCATE` and an `UPDATE` with no `WHERE`.
  - **Redis** — `FLUSHALL`/`FLUSHDB`/`DEL`/`UNLINK`/`GETDEL`.
  - **MongoDB** — `drop`/`dropDatabase`/`deleteMany`/`deleteOne`/`remove`/`findOneAndDelete`.
  - **Any other syntax** — no spurious SQL-keyword warning unless that syntax
    contributes its own `classifyDestructive`.

  A new generic confirm message backs the non-SQL cases. The SQL classifier still
  reuses the pure, unit-tested `destructiveKind` helper.

- [#108](https://github.com/arshad-shah/verql/pull/108) [`3f57477`](https://github.com/arshad-shah/verql/commit/3f57477b20c86dc15f232b3061aea0797cf669e7) Thanks [@arshad-shah](https://github.com/arshad-shah)! - Export/import dialogs now show the formats the connection actually supports.

  The Export and Import dialogs no longer hardcode `sql | csv | json`. They fetch
  the formats registered for the active connection (`export:formats-list` /
  `import:formats-list`, driver-filtered through the exporter/importer registries),
  so the list is always correct — a MongoDB or Redis connection is no longer
  offered a SQL export it can't produce.

  - `RegisteredExporter` gains an optional `supportsSchema` flag (the SQL exporters
    set it); the "include schema definition" toggle now shows for any format that
    declares it, instead of being hardcoded to `sql`.
  - The Import dialog branches on the importer's `driverExecutes` flag (SQL scripts
    run their own statements; data files parse into a target object) rather than on
    the literal format name.
  - `export:table`'s `format` is now a registry id (`string`), not a fixed enum, so
    plugin-contributed formats work end to end.

- [#108](https://github.com/arshad-shah/verql/pull/108) [`3f57477`](https://github.com/arshad-shah/verql/commit/3f57477b20c86dc15f232b3061aea0797cf669e7) Thanks [@arshad-shah](https://github.com/arshad-shah)! - Persist open tabs incrementally to SQLite instead of localStorage.

  Restore-on-startup for open query tabs moves off a renderer-`localStorage`
  snapshot — which rewrote _every_ tab on _every_ change, synchronously on the UI
  thread, and silently dropped saves at the ~5 MB origin quota — and onto the
  existing main-process SQLite app-data store, behind a per-tab-incremental engine.

  - **Durable layer** — a new `open_tabs` table (one row per tab); `listOpenTabs()`
    / `applyOpenTabOps()` apply an upsert/delete/active batch in a single
    transaction, over two typed IPC channels.
  - **Engine** (`src/renderer/src/lib/tab-persistence/`) — a pure `select` +
    `diff` core (a single-tab edit yields exactly one row write, regardless of tab
    count), a debounced/coalesced/serialized write loop whose baseline only
    advances after a successful write (so a failed write retries instead of being
    lost), an IPC transport, and a one-time migration of the legacy localStorage
    payload.
  - Tabs keep their identity across restore, so writes stay incremental. The
    persisted query buffer is treated as **opaque, driver-agnostic text** (SQL,
    MongoDB, Redis, …) — never parsed.

  Result: tab writes leave the UI thread, cost is bounded by what changed, there's
  no quota cliff, and commits are crash-safe (WAL). Existing localStorage tabs are
  migrated automatically on first launch.

### Patch Changes

- [#109](https://github.com/arshad-shah/verql/pull/109) [`4cc3495`](https://github.com/arshad-shah/verql/commit/4cc3495e36219ed11690284ee26e4a6a7a3aa143) Thanks [@arshad-shah](https://github.com/arshad-shah)! - Modernize the release pipeline. The "Version Packages" step now uses the
  canonical `changesets/action` (SHA-pinned) instead of a hand-rolled script —
  fixing the `GITHUB_TOKEN`/changelog-github failure that broke versioning &
  tagging — while the gated, PAT-free auto-tag → reusable-publish flow is
  unchanged. Adds Microsoft Store (MSIX) publishing: an `appx` target in
  `electron-builder.yml` and a `publish-msstore` job in `release.yml`, gated
  behind the `release` environment and skipped until `MICROSOFT_STORE_PRODUCT_ID`
  is set. The `setup-release-gates.sh` script now also provisions the
  `npm-publish` environment and the "Actions can create PRs" permission.

- [#108](https://github.com/arshad-shah/verql/pull/108) [`3f57477`](https://github.com/arshad-shah/verql/commit/3f57477b20c86dc15f232b3061aea0797cf669e7) Thanks [@arshad-shah](https://github.com/arshad-shah)! - Make the shared error hints driver-neutral.

  The error-classification system already keeps messages renderer-owned and i18n'd
  (drivers contribute only regex→code patterns via `errorRules`, which carry no
  text), and a `DbErrorCode` is a cross-driver taxonomy. Several fallback **hints**
  still baked in SQL syntax, so a MongoDB/Redis user hitting a shared code (timeout,
  permission denied, type mismatch, …) saw SQL-only advice. Those hints are now
  phrased generically:

  - timeout — "return less data (filter the results or fetch fewer records)"
    instead of "add a WHERE / LIMIT"
  - permission denied — "grant them to this user" instead of "GRANT SELECT, ..."
  - type mismatch — "cast or convert the value explicitly" instead of "value::int"
  - division by zero — "guard the denominator so it can never be zero" instead of
    "NULLIF(x, 0)"
  - transaction aborted — "roll back the transaction" instead of "Run \`ROLLBACK\`"
  - duplicate object — "a create-if-not-exists form, or remove the existing
    {object} first" instead of "CREATE TABLE IF NOT EXISTS"

  The driver-specific destructive-run warnings (DELETE/DROP/TRUNCATE) are unchanged
  — they now surface only for SQL connections via the driver-aware classifier.

- [#108](https://github.com/arshad-shah/verql/pull/108) [`3f57477`](https://github.com/arshad-shah/verql/commit/3f57477b20c86dc15f232b3061aea0797cf669e7) Thanks [@arshad-shah](https://github.com/arshad-shah)! - Build the main-process app logger on `@arshad-shah/log-kit`.

  The hand-rolled logger core is replaced by log-kit while the app's narrow
  four-level `Logger` facade (serialised `detail`, `child(scope)`) stays
  byte-for-byte compatible — every existing call site is unchanged.

  - log-kit owns the record pipeline (level gating, child-scope nesting) and fans
    each record out to two app-supplied transports with **failure isolation**: a
    throwing activity sink can no longer break console output, and vice versa.
  - The transports preserve existing behaviour exactly — a console transport keeps
    the `[scope] message` format and level→method mapping (info → `console.log`),
    and an activity transport records `log` entries into the unified activity
    stream.
  - Adds `logger.mark(label)` perf markers (recording `durationMs`); plugin boot is
    wired through it as the first use.

  No user-facing behavior change.

- [#108](https://github.com/arshad-shah/verql/pull/108) [`3f57477`](https://github.com/arshad-shah/verql/commit/3f57477b20c86dc15f232b3061aea0797cf669e7) Thanks [@arshad-shah](https://github.com/arshad-shah)! - Security hardening (defense-in-depth).

  - **Secret-redacting logger.** The app logger now recursively redacts
    secret-looking object keys (`password`, `token`, `*key`, `secret`,
    `authorization`, `credential`) before serialising a detail object to the
    console or the persisted activity stream — so a careless call site that logs a
    whole `ConnectionProfile` (which holds plaintext secrets in memory) can't leak
    credentials. Free-text strings/stacks are unchanged; non-secret fields are
    preserved verbatim.
  - **Explicit zip-slip guard on plugin install.** Before extracting a third-party
    plugin archive, the entry names are validated and any absolute path, Windows
    drive-letter path, or `..` traversal segment is rejected — defense-in-depth
    that no longer trusts `unzip`'s implicit stripping across versions/platforms.

## 1.2.0

### Minor Changes

- [#107](https://github.com/arshad-shah/verql/pull/107) [`b64dc8b`](https://github.com/arshad-shah/verql/commit/b64dc8b87d5dcaece348c3bf5a6c97cde7e925ce) Thanks [@arshad-shah](https://github.com/arshad-shah)! - Add first-run onboarding and per-version release notes, VS Code-style.

  - **Welcome tab** — a "Get Started" walkthrough that opens on a fresh install:
    a brand hero, quick actions (new connection / query / plugins), an interactive
    setup checklist whose steps auto-complete from app state, and learn/resource
    links. Re-openable any time from Help → Welcome, the command palette, or AI.
  - **What's New tab** — a hand-authored, per-version release-notes page (titled
    after the version) that opens automatically after an update when a curated
    entry exists, and from Help → What's New. Content lives in a typed registry
    (`lib/release-notes/`) with authoring instructions in `docs/onboarding.md`.
  - New `settings.onboarding` state (`lastSeenVersion`, `completedSteps`,
    `hideOnStartup`) drives a pure, unit-tested startup decision; the Welcome and
    release surfaces are also exposed as `open-welcome` / `open-release-notes`
    app-actions.

### Patch Changes

- [#90](https://github.com/arshad-shah/verql/pull/90) [`1bce419`](https://github.com/arshad-shah/verql/commit/1bce4195e7e725d88424f5d11a4d286ce081d02a) Thanks [@arshad-shah](https://github.com/arshad-shah)! - Centralize two more duplicated main-process patterns.

  - **`broadcast(event, ...payload)`** (`src/main/ipc/broadcast.ts`) replaces the
    hand-rolled `BrowserWindow.getAllWindows()` send-loop that was copied across
    the IPC handlers, plugins/updater/MCP/settings subsystems. It's typed by
    `IpcEventMap`, so a wrong broadcast payload is now a compile error. (The MCP
    approval send keeps its own path — it early-returns when no window exists.)
  - **`errorMessage(err)`** (`shared/errors.ts`) replaces the
    `err instanceof Error ? err.message : String(err)` idiom hand-rolled in 13
    places across the main process and renderer.
  - Fix the `settings:changed` event type: it's declared as two positional args
    (`keyPath`, `value`) to match what the main process sends and the renderer
    listener reads — the previous single-object payload type was inaccurate.

  No runtime behavior change.

- [#90](https://github.com/arshad-shah/verql/pull/90) [`1bce419`](https://github.com/arshad-shah/verql/commit/1bce4195e7e725d88424f5d11a4d286ce081d02a) Thanks [@arshad-shah](https://github.com/arshad-shah)! - Reduce duplicated code by centralizing shared helpers and hooks.

  - `formatCompactNumber` (lib/format.ts) replaces three identical row/token
    number formatters; `formatRelativeTime` / `formatClockTime` (lib/format-time.ts)
    replace the per-file time formatters (and give NotificationItem the i18n it
    was missing).
  - One `useClipboard()` hook replaces the two narrow copy hooks and an inline
    copy variant: it exposes a transient `copied` flag and an optional success
    toast via `copy(text, { toast })`, covering every copy surface (code blocks,
    chat messages, notifications, and the explorer's context menus / hover
    actions).

  CONTRIBUTING.md and CLAUDE.md now document this "centralize, don't duplicate"
  requirement.

- [#90](https://github.com/arshad-shah/verql/pull/90) [`1bce419`](https://github.com/arshad-shah/verql/commit/1bce4195e7e725d88424f5d11a4d286ce081d02a) Thanks [@arshad-shah](https://github.com/arshad-shah)! - Apply the driver `nouns` capability to every relational label, completing the
  DB-agnostic explorer. The context-menu / hover / export / copy labels and the
  query-semantic error messages (not-found, duplicate, constraint, type-mismatch)
  now read in the active driver's own terms (table/column/row, collection/field/
  document, key/field/entry, …) with generic fallbacks. Noun resolution is
  centralized in `lib/data-nouns.ts`.

- [#90](https://github.com/arshad-shah/verql/pull/90) [`1bce419`](https://github.com/arshad-shah/verql/commit/1bce4195e7e725d88424f5d11a4d286ce081d02a) Thanks [@arshad-shah](https://github.com/arshad-shah)! - Make the schema explorer DB-agnostic via a driver-supplied `nouns` capability.

  Drivers can now declare what they call their data concepts —
  `nouns: { object, field, record }` (each `{ one, many }`) — e.g. SQL drivers
  table/column/row, MongoDB collection/field/document, Redis key/field/entry. The
  renderer resolves them through `useDataNouns` (with generic fallbacks) so the
  explorer's search placeholder, group headers, loading/empty states and row
  counts read in the active driver's own terms instead of assuming SQL. Combined
  with the earlier literal-"SQL" string cleanup, the shell no longer hardcodes SQL
  terminology in generic surfaces.

- [#90](https://github.com/arshad-shah/verql/pull/90) [`1bce419`](https://github.com/arshad-shah/verql/commit/1bce4195e7e725d88424f5d11a4d286ce081d02a) Thanks [@arshad-shah](https://github.com/arshad-shah)! - Fix two transaction-session edge cases in query execution (renderer
  orchestration only — session/pool logic stays in the driver adapters):

  - A tab whose selected database differs from the connection's default no longer
    throws "No open session" on its first transactional query. The database/schema
    context is now applied _before_ the session is opened, so the pool-rebuilding
    `switchDatabase` (already idempotent in the adapter) can't wipe the session.
  - Switching a tab's connection now releases the open transactional session on
    the old connection (tolerant no-op when none) and resets the tab's
    transaction status, instead of orphaning the session.

- [#90](https://github.com/arshad-shah/verql/pull/90) [`1bce419`](https://github.com/arshad-shah/verql/commit/1bce4195e7e725d88424f5d11a4d286ce081d02a) Thanks [@arshad-shah](https://github.com/arshad-shah)! - Streamline IPC channel/event definitions so each wire string is authored once.

  Previously every channel name (e.g. `'db:connect'`) was written twice in
  `shared/ipc.ts` — as a key in `IpcChannelMap` and as the value in
  `IPC_CHANNELS` — and kept in sync by hand. The `args`/`return` contracts now
  live in `IpcChannelShapes` (and `IpcEventShapes`) keyed by the constant name,
  the wire string lives only in `IPC_CHANNELS`/`IPC_EVENTS`, and the
  wire-string-keyed `IpcChannelMap`/`IpcEventMap` consumed by `invoke`/`handle`/
  the preload bridge are derived from the two. A `satisfies Record<keyof
IpcChannelShapes, string>` clause makes any drift between the halves a
  compile-time error. No runtime behavior or channel values change; all call
  sites continue to use `IPC_CHANNELS.X` / `IPC_EVENTS.X`.

- [#90](https://github.com/arshad-shah/verql/pull/90) [`1bce419`](https://github.com/arshad-shah/verql/commit/1bce4195e7e725d88424f5d11a4d286ce081d02a) Thanks [@arshad-shah](https://github.com/arshad-shah)! - Break up the largest renderer components for clearer separation of concern.
  No behavior or public-prop changes — each component's logic moved into
  co-located hooks and sub-components:

  - **ConnectionFormView** (518→263 lines) → `connections/form/` (`PluginFieldInput`,
    `FetchableFieldsWizard`, `SshTunnelSection`, `Section`, `ToggleRow`, shared types).
  - **QueryPanel** (463→138) → `useQueryExecution`, `useQueryTransactions`,
    `useQuerySaveDialog` hooks + `SaveQueryDialog`.
  - **App** (452→229) → `useAppKeyboardShortcuts`, `useFileDropForwarding`,
    `useShellMenuEvents` hooks + `ActiveTabView` and `TabCloseGuard`.
  - **TableNode** (364→221) → `useTableNodeActions` hook + shared `TableHoverActions`.
  - **QueryEditor** (277→142) → `useEditorActions`, `useEditorOptions`,
    `useSqlCompletions` hooks + a pure `parseKeybinding` helper (now unit-tested).

## 1.1.0

### Minor Changes

- [#86](https://github.com/arshad-shah/verql/pull/86) [`a5e74c7`](https://github.com/arshad-shah/verql/commit/a5e74c7c1d0354ccedc613e8b2b68fab719370ef) Thanks [@arshad-shah](https://github.com/arshad-shah)! - Driver-declared EXPLAIN, data-grid browse, and database-explorer fixes

  - **EXPLAIN is now driver-declared.** Each driver's `explain` capability carries
    the statement to run (Postgres/MySQL `EXPLAIN ANALYZE`, SQLite
    `EXPLAIN QUERY PLAN`, Snowflake `EXPLAIN`); the app no longer hardcodes a
    dialect, and the Explain action is hidden for drivers that can't explain
    (Redis, MongoDB) — fixing the `ERR unknown command 'EXPLAIN'` on Redis.
  - **Data-grid browse** for non-SQL stores: a new "View data" action opens a
    key/type/value (Redis) or document (Mongo) grid via the driver's own
    `getTableData` reader, shown for any driver that declares `hasGetTableData`.
  - **MySQL explorer** no longer shows server-internal databases and no longer
    mis-nests schemas (MySQL databases are treated as their own schema).
  - **GradientSurface** primitive (accent/neutral × subtle/bold) — used by the
    About modal's hero.
  - Redis browsing now lists a key prefix's keys instead of erroring; the explorer
    shows "No columns" for schema-less stores instead of a stuck "Loading…".

- [#86](https://github.com/arshad-shah/verql/pull/86) [`a5e74c7`](https://github.com/arshad-shah/verql/commit/a5e74c7c1d0354ccedc613e8b2b68fab719370ef) Thanks [@arshad-shah](https://github.com/arshad-shah)! - App-designed shell, custom About, and richer diagnostics

  - **Menus & window controls**: replace the native OS application menu on
    Windows/Linux with an app-designed File / Edit / View / Query / Help menu bar
    (our own dropdowns + keyboard-shortcut hints, trimmed to what helps), and
    render the min/max/close window controls with the IconButton primitive.
  - **About**: a custom in-app "About Verql" modal — branded hero panel, app +
    build versions with a copyable build block, MIT license, and resource links —
    replacing the old "open the website" behaviour.
  - **Diagnostics**: a much more detailed in-app activity stream for debugging —
    new event kinds (IPC calls, plugin lifecycle, network/API calls, renderer
    state mutations, performance long-tasks), a structured detail drawer (metadata
    JSON, duration, error stack), a session error/warning summary, and a verbose
    capture toggle.
  - **Design system**: add `size` variants across many primitives and a redesigned
    Switch (pixel-perfect circular thumb, consistent across every theme); normalize
    semantic variant names (Button `danger` → `error`, add `success` to Banner);
    the ColorInput picker now renders in a portal so it can't be clipped; context
    and dropdown menus hug their content.
  - **Fixes**: the "show secondary sidebar" / "show bottom dock" settings now take
    effect live; fill in missing status/accent tokens in the dark, midnight and
    other themes; open external links via Windows interop under WSL; and don't
    crash when OS secret encryption is unavailable (headless / WSL).

### Patch Changes

- [#86](https://github.com/arshad-shah/verql/pull/86) [`a5e74c7`](https://github.com/arshad-shah/verql/commit/a5e74c7c1d0354ccedc613e8b2b68fab719370ef) Thanks [@arshad-shah](https://github.com/arshad-shah)! - Redesign the connection form layout into clear, grouped sections. Fields were
  previously stacked full-width in a single column with duplicate labels and
  inconsistent section headers. The form now uses titled cards:

  - **General** — database type, name and color side by side, and an auto-commit
    toggle row.
  - **Connection** — driver fields laid out in a responsive two-column grid (wide
    inputs like passwords, selects, and file pickers span the full width), with
    boolean options grouped into a clean toggle list under an "Options" subheading.
  - **SSH Tunnel** — collapsible card with a description hint.
  - A footer action bar pairs **Test Connection** with **Cancel / Save**.

  Fields are still rendered generically from driver and middleware contributions,
  so the new grid and toggle grouping applies to every database type and any
  plugin-contributed connection fields.

## 1.0.0

### Major Changes

- [#81](https://github.com/arshad-shah/verql/pull/81) [`3a2f890`](https://github.com/arshad-shah/verql/commit/3a2f8906bdd1051d219fa162d7c089df4eafe403) Thanks [@arshad-shah](https://github.com/arshad-shah)! - v1.0.0 — settings fully plumbed, internationalization, and platform hardening.

  **Settings (every setting now works end-to-end):**

  - Query history backed by the SQLite app-data store (consumes `maxHistoryItems`), surfaced via a Saved/History toggle.
  - Restore open tabs on startup (`restoreTabsOnStartup`).
  - Data display: custom date pattern, boolean display, and text truncation now apply to results.
  - Confirm-on-unsaved-close is honoured; full keybinding rebinding (App-level shortcuts are data-driven; editor already was) with a capture/reset UI.
  - Removed orphaned `connectionDefaults` (autoReconnect / defaultSslMode — SSL is driver-owned) and dead `splitRatio`; typed `pluginGrants`.

  **Internationalization (new subsystem):**

  - Homegrown, dependency-free, cross-process message catalogue (`shared/i18n`) with a typed `t()`/`MessageKey`, ICU-subset interpolation + plurals, a renderer `<I18nProvider>`/`useTranslation`, and a `general.language` setting. All user-facing chrome migrated to it (plugin-authored strings stay plugin-owned). See `docs/i18n.md`.

  **Performance, structure & correctness:**

  - `App` subscribes to stores per-field (no more whole-shell re-render per keystroke).
  - Centralized constants the way IPC channels are: main-process `IPC_EVENTS`, settings category ids, keybinding action ids, and UI panel ids — fixing a broken "Show Schema" command and making settings-open land on the correct category.

### Minor Changes

- [#84](https://github.com/arshad-shah/verql/pull/84) [`30f39e5`](https://github.com/arshad-shah/verql/commit/30f39e5df67dcb68de200f1a3c50b265d5b00f5d) Thanks [@arshad-shah](https://github.com/arshad-shah)! - Cross-platform, app-integrated title bar. The renderer now owns the title bar on
  every OS with a consistent look: macOS keeps its native traffic lights, while
  Windows and Linux get app-drawn window controls (minimize / maximize / close)
  plus an in-title-bar application menu (File / Edit / View / …) that pops the
  native submenus. This fixes the doubled title bar on Windows (native frame +
  app bar) and restores the menu that the custom title bar had hidden.

  Also fixed in this release:

  - **Windows production crash** — `@shared/*` modules were externalised as
    runtime `require()`s (`Cannot find module … shared/settings`) because the
    Vite externalisation guard only recognised POSIX absolute paths. It now uses
    `path.isAbsolute`, so Windows drive-letter paths resolve and the modules are
    bundled.
  - **Windows dev console mojibake** — `pnpm dev` now forces the console to UTF-8
    so tooling glyphs (e.g. `✓`) render correctly instead of `Ô£ô`.

### Patch Changes

- [#81](https://github.com/arshad-shah/verql/pull/81) [`3a2f890`](https://github.com/arshad-shah/verql/commit/3a2f8906bdd1051d219fa162d7c089df4eafe403) Thanks [@arshad-shah](https://github.com/arshad-shah)! - Move query-semantic error classification into the drivers (DB-boundary fix [#2](https://github.com/arshad-shah/verql/issues/2)).
  The renderer previously hardcoded PG/MySQL/SQLite error-message patterns in
  `lib/db-error.ts`. Now:

  - `DbErrorCode` + a serializable `DbErrorRule` live in `shared/db-errors`; an
    `errorRules` capability is added to the `@verql/plugin-sdk` `DriverFactory`
    (additive) and serialized into driver capabilities.
  - The postgresql/mysql/sqlite plugins declare their dialect's rules (bad
    column/table/schema, syntax, constraints, type mismatch, duplicate table,
    division-by-zero, deadlock, aborted txn).
  - `parseDbError(raw, dbType?)` applies the active driver's rules first (regex from
    the driver, friendly message from the renderer's i18n catalogue), then host
    rules for connection/auth/app-layer errors that span drivers. A new driver can
    contribute its own error classification by shipping `errorRules` — no host
    changes. Classification behaviour is unchanged (42-case characterization test).

- [#81](https://github.com/arshad-shah/verql/pull/81) [`3a2f890`](https://github.com/arshad-shah/verql/commit/3a2f8906bdd1051d219fa162d7c089df4eafe403) Thanks [@arshad-shah](https://github.com/arshad-shah)! - Move Postgres EXPLAIN plan parsing out of the renderer into the driver
  (DB-boundary fix [#1](https://github.com/arshad-shah/verql/issues/1)). The renderer previously hardcoded Postgres plan formats
  (`(cost=…)` text + `FORMAT JSON` keys). Now:

  - `PlanNode` lives in `shared/types`; `DbAdapter` gains an optional
    `parseQueryPlan(result)` (additive to the plugin-author surface).
  - The postgresql plugin owns the parsing; a new `db:parse-plan` IPC delegates to
    the active adapter and returns `[]` when a driver has no plan parser.
  - The renderer stores the parsed tree on the query tab and renders it
    generically; `lib/plan-parser.ts` is removed. Other drivers can now contribute
    plan parsing by implementing `parseQueryPlan`.

- [#81](https://github.com/arshad-shah/verql/pull/81) [`3a2f890`](https://github.com/arshad-shah/verql/commit/3a2f8906bdd1051d219fa162d7c089df4eafe403) Thanks [@arshad-shah](https://github.com/arshad-shah)! - Move statement-gutter dialect selection behind a driver capability (DB-boundary
  fix [#3](https://github.com/arshad-shah/verql/issues/3)). Drivers now declare a `statementSyntax` (`'sql'` / `'redis'` /
  `'mongodb'`) on their factory; the renderer's statement registry is keyed by that
  syntax and `StatementGutter` resolves it from the driver's capabilities, instead
  of a hardcoded db-type list in the renderer. A new SQL driver gets the
  "Run/Explain" gutter for free by declaring `statementSyntax: 'sql'`. Adds the
  optional `statementSyntax` field to the `@verql/plugin-sdk` `DriverFactory` type
  (additive). Behaviour for the bundled drivers is unchanged.

- [#81](https://github.com/arshad-shah/verql/pull/81) [`3a2f890`](https://github.com/arshad-shah/verql/commit/3a2f8906bdd1051d219fa162d7c089df4eafe403) Thanks [@arshad-shah](https://github.com/arshad-shah)! - Internal modularization & slimming (behavior-preserving, no user-facing change):

  - Extract pure plugin-manifest validation + the symlink walker out of the
    1047-line `plugin-host.ts` into `plugins/manifest-validation.ts` (re-exported
    for compatibility; covered by the existing manifest/audit tests).
  - Collapse the 14 near-identical `tabs.ts` query-tab setters behind
    `patchQueryTab`/`patchTabTxn` helpers.
  - Extract SQL classification (`isSchemaMutatingSql`, `destructiveKind`,
    `stripSqlNoise`) into a tested `lib/sql-classify.ts`, decoupled from i18n.
  - Split the inline `PluginDetailView` tab components and the repeated
    `SchemaNode` object-group blocks into their own modules.
  - Use `IPC_CHANNELS.DB_CONNECTION_OPTIONS` in the connection form instead of a
    hardcoded channel string.

## 0.12.0

### Minor Changes

- [#80](https://github.com/arshad-shah/verql/pull/80) [`f7dfeb6`](https://github.com/arshad-shah/verql/commit/f7dfeb69f57ce601cb6b1c70ad460714637e5db1) Thanks [@arshad-shah](https://github.com/arshad-shah)! - Persist AI conversations and saved queries in an internal SQLite app-data store
  instead of renderer `localStorage`. A new main-process `AppDataStore`
  (`${userData}/app.db`, WAL mode) reached over typed `appdata:*` IPC channels
  removes the ~5–10MB `localStorage` quota cap that could silently drop chat
  history, and replaces full-blob rewrites with incremental, transactional writes
  (one write per settled message / saved query). Existing `localStorage` data is
  migrated into the store automatically on first launch.

- [#79](https://github.com/arshad-shah/verql/pull/79) [`4403452`](https://github.com/arshad-shah/verql/commit/4403452dfaeff2f9a2f08376763548496400c187) Thanks [@arshad-shah](https://github.com/arshad-shah)! - Add native OS notifications for approval prompts. A new bundled
  `os-notifications` plugin surfaces "your response is needed" moments — AI
  write-tool approvals and MCP query authorizations — as desktop notifications
  when Verql is in the background, with user toggles (master enable, only when
  unfocused, approvals). The host gains a delivery-agnostic `attention` seam
  (`src/main/attention/`) that approval flows publish to, and the plugin exposes
  an `os-notifications` service so other plugins can raise desktop notifications.

## 0.11.0

### Minor Changes

- Add an Activity Panel and harden the app against a batch of security and correctness defects.

  - **Activity Panel** — a new secondary-sidebar panel that surfaces recent app activity (connections, queries, errors, and warnings) so you can see what's been happening at a glance.

  Security & correctness fixes:

  - **Secrets never written in cleartext** — saving settings, resetting a category, or deleting a connection no longer rewrites every connection's password into `config.json` in plaintext; keyring-backed fields are stripped before any disk write.
  - **Keyring redaction bypass closed** — the renderer can no longer read AI API keys or DB passwords back out of the keyring; secret-field access is gated and the reserved AI namespace is refused.
  - **AI "explain" stays read-only** — `explain_query` can no longer run writes (e.g. `EXPLAIN ANALYZE DELETE …`) without approval; the same write-detection used by the MCP server now applies.
  - **Constant-time MCP auth** — the MCP bearer token is now compared with a timing-safe check instead of `!==`.
  - **Redis SSL & database honored** — enabling SSL now actually uses TLS, and the selected database number is respected instead of always connecting to db0 in plaintext.
  - **Tighter plugin isolation** — isolated plugins can only call an explicit allowlist of capability methods, and plugin installs use an atomic private temp dir to avoid symlink/clobber races.
  - **No leaked pools on failed connect** — a failed `db:connect` now releases its adapter instead of leaking a connection pool on every failed attempt.

## 0.10.0

### Minor Changes

- [#72](https://github.com/arshad-shah/verql/pull/72) [`3855e81`](https://github.com/arshad-shah/verql/commit/3855e81d0880f64fceb15d6f52f9aa464435b8bc) Thanks [@arshad-shah](https://github.com/arshad-shah)! - Expand what the AI assistant can do in the app. The App-Action registry now ships
  built-in actions for the full capability roadmap, each usable as a clickable chip or
  run directly by the assistant:

  - **Connections** — connect, disconnect, and switch the active connection by name or id.
  - **Schema authoring** — scaffold `CREATE TABLE`/migration SQL into a new query tab (never auto-run).
  - **Results** — export the current results to CSV/JSON, or open a chart of them.
  - **Navigation** — reveal a table (or column) in the explorer, open a saved query, and open the ER diagram with a table selected.
  - **Editor assist** — insert SQL at the cursor or replace the current selection in the active editor.
  - **Plugins** — open the plugin install screen (and settings categories, including plugins).
  - **Diagnostics** — the assistant now sees recent errors/warnings and can summarize them and open the notifications panel.

- [#71](https://github.com/arshad-shah/verql/pull/71) [`a94b1f3`](https://github.com/arshad-shah/verql/commit/a94b1f39b9e821325958a23b1f54245b43f2d03a) Thanks [@arshad-shah](https://github.com/arshad-shah)! - Enhance the AI chat and surrounding workflow:

  - **Active connection fix** — the assistant now uses the connection you have active in the UI (previously it had no connection and its query/schema tools silently failed).
  - **Refined message bubbles** — avatar-anchored, adaptive width so tables and code never truncate, copy/retry actions, and a suggestion empty state.
  - **Deeper app integration** — the assistant can link you to the right place (e.g. "Add a Connection", "Open ER Diagram") via clickable action chips, and can navigate the app directly through an extensible App-Action registry that plugins can contribute to. The assistant knows your saved connections, so it sends you to the connections list for an existing one and the form only for a new one. Agentic actions report real success/failure back to the chat.
  - **Cheapest model by default** — when a provider is active or you switch vendors, the cheapest model for that vendor is selected by default (you can still pick another).
  - **Connections panel** — row actions moved into an overflow menu, with a new Delete action (confirmed via a dialog).

- [#72](https://github.com/arshad-shah/verql/pull/72) [`3855e81`](https://github.com/arshad-shah/verql/commit/3855e81d0880f64fceb15d6f52f9aa464435b8bc) Thanks [@arshad-shah](https://github.com/arshad-shah)! - AI chat now keeps a history of conversations and runs leaner:

  - **Conversations** — your chats are saved and listed in a switcher at the top of the AI panel. Start a new chat, rename or delete old ones, and pick up any conversation where you left off (they persist across restarts).
  - **Branching** — fork a new conversation from any message to explore an alternative direction without losing the original thread.
  - **More efficient context** — long conversations no longer send an ever-growing transcript to the model on every turn. The request is trimmed to a token budget (keeping the most recent context), which keeps responses fast and costs down.

- [#75](https://github.com/arshad-shah/verql/pull/75) [`f732a19`](https://github.com/arshad-shah/verql/commit/f732a191da9c484b2a99d087e3ec950e4c67b69f) Thanks [@arshad-shah](https://github.com/arshad-shah)! - AI: enable Anthropic prompt caching and externalise every prompt to its own
  markdown file.

  Caching: the system prompt and tool catalog now carry `cache_control:
{ type: 'ephemeral' }` breakpoints when targeting Anthropic models. Anthropic
  keeps a 5-minute prefix cache keyed on these blocks, so cached input tokens
  cost ~10% of the normal rate and skip re-processing on the server — the
  single biggest TTFT win on multi-turn chats with a stable schema.

  Externalised prompts: the five AI prompts (chat system, explain, generate
  query, inline SQL completion, summarize) and the chat-system context
  fragments now live as `.md` files in
  `src/main/plugins/bundled/ai/prompts/`, imported via Vite's `?raw` and
  rendered with a tiny `{{placeholder}}` helper. No prompt prose lives in the
  AI layer code anymore. New `tests/unit/ai-prompts.test.ts` pins the
  structural anchors that callers depend on (cursor token, section headers,
  word limits) so prompt edits can't silently break the surrounding code.

- [#73](https://github.com/arshad-shah/verql/pull/73) [`3dc6718`](https://github.com/arshad-shah/verql/commit/3dc6718953906907e4db48b21d18cf44b0974c8f) Thanks [@arshad-shah](https://github.com/arshad-shah)! - Editor AI redesign: replace the CodeLens "Run / Explain" bar with a custom
  statement gutter (lucide icons + per-statement status chip); add an
  Accept/Reject toolbar and status pill to inline AI ghost-text; rebuild the
  Explain-results panel with Markdown, streaming, Copy/Regenerate/Ask-follow-up
  actions. No ASCII glyphs remain in the touched surfaces.

- [#72](https://github.com/arshad-shah/verql/pull/72) [`3855e81`](https://github.com/arshad-shah/verql/commit/3855e81d0880f64fceb15d6f52f9aa464435b8bc) Thanks [@arshad-shah](https://github.com/arshad-shah)! - SQL formatting, in-app help, and docs:

  - **Format query** — the editor can now pretty-print the buffer ("Format Document" / Shift+Alt+F, or ask the assistant to "format this"). Formatting is plugin-owned and keyed by editor language: SQL drivers (PostgreSQL, MySQL, SQLite, Snowflake) contribute dialect formatters backed by `sql-formatter`, MongoDB pretty-prints its JSON, and Redis tidies its command buffer. New database plugins can contribute a formatter for their own query language via the new `formatters` contribution surface.
  - **Help menu** — a native Help menu links to the documentation and issue tracker, and the About panel shows the version (macOS/Linux).
  - **Docs** — added `docs/architecture.md` and `docs/ai.md`, documented the formatter surface in `docs/plugins.md`, and refreshed `CLAUDE.md` with a docs-first workflow and the glue↔plugin ownership boundary.

### Patch Changes

- [#73](https://github.com/arshad-shah/verql/pull/73) [`3dc6718`](https://github.com/arshad-shah/verql/commit/3dc6718953906907e4db48b21d18cf44b0974c8f) Thanks [@arshad-shah](https://github.com/arshad-shah)! - Bump the `uuid` transitive (via snowflake-sdk) to `>=11.1.1` to resolve
  GHSA-w5hq-g745-h8pq (missing buffer bounds check in v3/v5/v6). Our usage path
  through snowflake-sdk only touches v4, but the audit gate flagged it; the
  override moves us to a maintained line.

- [#73](https://github.com/arshad-shah/verql/pull/73) [`3dc6718`](https://github.com/arshad-shah/verql/commit/3dc6718953906907e4db48b21d18cf44b0974c8f) Thanks [@arshad-shah](https://github.com/arshad-shah)! - Trim the AI system prompt: drop verbose rule restatements, send only table
  names (instead of full column schemas) with a hint to call describe_table on
  demand, compact the App-Action catalog to `id "Title"` pairs, omit the active
  connection from the "saved connections" list, and cap recent notifications at
  three titles. Cuts per-turn prompt size by ~2-5k tokens on typical workspaces.

## 0.9.0

### Minor Changes

- [#69](https://github.com/arshad-shah/verql/pull/69) [`65aece9`](https://github.com/arshad-shah/verql/commit/65aece9e843e41115f48a32cd66d2be5fdee87d2) Thanks [@arshad-shah](https://github.com/arshad-shah)! - Unify MCP and AI tooling behind a single SDK `ToolRegistry`. Database tool logic now lives in a dedicated always-on `db-tools` bundled plugin consumed by both the MCP server and the AI assistant (clean break: `ctx.ai.registerTool` is removed in favour of `ctx.tools`). The MCP settings panel gains per-tool enable toggles, a read-only mode, a configurable row limit, automatic port-conflict resolution, and a live activity log. SQL in the MCP approval dialog and the Claude client config are now syntax-highlighted via a new reusable `CodeView` primitive.

## 0.8.0

### Minor Changes

- [#54](https://github.com/arshad-shah/verql/pull/54) [`d2e6c88`](https://github.com/arshad-shah/verql/commit/d2e6c8894dac9735305078cbc52de601aa816373) Thanks [@arshad-shah](https://github.com/arshad-shah)! - Added transaction controls for PostgreSQL and SQLite connections. Each query tab can now turn off auto-commit and run statements inside a transaction, with Commit/Rollback, isolation level, and read-only mode in a new transaction toolbar. A connection can default to manual-commit via a per-connection "Auto-commit by default" setting, and closing a tab with an open transaction prompts you to commit or roll back first.

  Under the hood, drivers declare these capabilities through a new plugin-SDK session/transaction surface, so the UI stays database-agnostic — future drivers (MySQL, Snowflake, MongoDB, Redis) light up the same controls just by declaring support.

- [#54](https://github.com/arshad-shah/verql/pull/54) [`d2e6c88`](https://github.com/arshad-shah/verql/commit/d2e6c8894dac9735305078cbc52de601aa816373) Thanks [@arshad-shah](https://github.com/arshad-shah)! - Redesigned the status bar as a VS Code-style segmented bar. Connection, database, and plugin status are now shown as discrete segments along the bar, replacing the previous ConnectionCard layout.

## 0.7.0

### Minor Changes

- [#51](https://github.com/arshad-shah/verql/pull/51) [`876f08e`](https://github.com/arshad-shah/verql/commit/876f08e153e05f9b8d4b4aa5a860d8ac99783f73) Thanks [@arshad-shah](https://github.com/arshad-shah)! - The main app is now a pure orchestrator: every line of database-specific logic lives inside its driver plugin. Adding a new database (Cassandra, ClickHouse, DuckDB, anything else) no longer requires editing the main process or the renderer's hot paths.

  What changed for the user-facing app:

  - Each driver now contributes its own identifier-quote character, prepared-statement placeholder, sample query, and migration DDL builder. The orchestrator routes through these structural capabilities; the previous hardcoded "for these four dialects" table is gone.
  - The CSV-into-table importer is fully generic — it asks the active driver for its quoting + placeholder shape, so the same import path works for every relational driver (bundled or third-party).
  - SQLite's `INTEGER PRIMARY KEY` rowid quirk during migration moved into the SQLite plugin where it belongs. The migration tool no longer special-cases it.
  - The `db:sample-query` IPC handler no longer fabricates a `SELECT * FROM table LIMIT 100` fallback. Every driver, SQL or otherwise, ships its own sample-query implementation.
  - Bundled drivers are now wired through a single `src/main/plugins/bundled/index.ts` list. The orchestrator iterates that list — it doesn't reference individual driver names anywhere else.

  What changed for plugin authors: see the SDK release notes below — the helpers driver plugins compose (`quoteIdentifier`, `generateCreateTable`, `splitSqlStatements`, `importCsvToTable`, `createRelationalGetTableData`) now live in the public SDK barrel and take the driver's quote character as a parameter, so a new driver plugin never has to hardcode a dialect name.

  A regression test now scans every file under `src/main/` outside `plugins/` and fails the build if any of `'postgresql'`, `'mysql'`, `'sqlite'`, `'mongodb'`, `'redis'`, `'snowflake'` re-appears in core code.

- [#51](https://github.com/arshad-shah/verql/pull/51) [`876f08e`](https://github.com/arshad-shah/verql/commit/876f08e153e05f9b8d4b4aa5a860d8ac99783f73) Thanks [@arshad-shah](https://github.com/arshad-shah)! - The plugin SDK is now a complete, documented surface for third-party plugin authors, and themes are validated end-to-end so a partial theme can never half-paint the app.

  **Plugin SDK additions**

  - `definePlugin({ manifest, activate, deactivate? })` — typed identity helper that pins the plugin shape at compile time. Missing fields or mistyped contributions fail at compile time instead of at boot.
  - SQL helpers exposed in the public barrel: `quoteIdentifier`, `validateIdentifier`, `formatSqlValue`, `generateCreateTable`, `generateInsertStatements`, `splitSqlStatements`, `importCsvToTable`, `createRelationalGetTableData`. All take the driver's `quoteChar` as a parameter — no dialect enum.
  - Theme helpers exposed: `validateTheme`, `REQUIRED_THEME_TOKENS`, `RECOMMENDED_THEME_TOKENS`. Plugin authors can run the same validator the host runs and fail their own CI before shipping a broken theme.
  - Manifest validator now covers `themes`, `exporters`, and `importers` contributions (previously silently accepted any shape and failed later at activation time).

  **Theme validation**

  - The theme registry validates every theme at registration time and stores the report on the entry. The picker reads it once instead of re-running validation per render.
  - Optional `register(theme, { strict: true })` throws on missing required tokens — useful inside a plugin author's CI build.
  - The Appearance settings theme grid now **disables** tiles for themes missing required tokens — they're greyed out, non-clickable, and show a tooltip listing the missing tokens. Themes that only miss _recommended_ tokens still work and show the existing warning badge.
  - `setTheme()` refuses to land on a broken theme even when called programmatically (URL handler, command palette, restored settings), and the resolved-theme fallback skips broken themes when picking the effective theme for the active mode.
  - The 9 bundled themes (Lab, Ink & Paper, Dark, Light, Midnight, Dracula, Nord, Solarized, Catppuccin) are pinned by a unit test against the required-token list, so a future palette tweak can't silently break one.

  **Documentation**

  `docs/plugins.md` has been updated for the new SDK surface: `definePlugin`, the driver capability flags (`quoteChar`, `placeholder`, `sampleQuery`, `generateMigrationDdl`), the theme-token contract, and the bundled-plugins/index.ts wiring file.

### Patch Changes

- [#51](https://github.com/arshad-shah/verql/pull/51) [`876f08e`](https://github.com/arshad-shah/verql/commit/876f08e153e05f9b8d4b4aa5a860d8ac99783f73) Thanks [@arshad-shah](https://github.com/arshad-shah)! - Round of correctness fixes surfaced by a full-codebase audit:

  - **Schema cache is cleared on disconnect.** Reconnecting a profile no longer surfaces stale tables/columns from the previous session, which would otherwise cause confusing autocomplete and the occasional "table doesn't exist" against the live server.
  - **Tabs detach cleanly when their connection is deleted.** Query tabs lose their dead `connectionId` and land in the "pick a connection" state; ER-diagram and table tabs close outright instead of dangling against a profile that no longer exists.
  - **CSV import "update on conflict"** no longer silently drops every conflicting row. Per-row failures now surface in the importer's `errors[]` so the user can see what failed, instead of seeing a successful import that didn't actually write anything.
  - **Adapters disconnect cleanly on app quit.** A new `before-quit` handler awaits every active adapter's `disconnect()`, so SSH tunnels and database pools close before the process exits rather than getting reaped abruptly.
  - **`Close all tabs` no longer reverses the open tab list** for any subscriber still holding the prior reference. The action now copies the array before reversing it.
  - **Disconnect middleware errors are logged** instead of being swallowed by an empty `catch {}`, so a leaking SSH tunnel or socket is discoverable in the developer console instead of vanishing.
  - **Command-palette plugin actions** log their errors instead of disappearing into a no-op `.catch(() => {})`.

- [#51](https://github.com/arshad-shah/verql/pull/51) [`876f08e`](https://github.com/arshad-shah/verql/commit/876f08e153e05f9b8d4b4aa5a860d8ac99783f73) Thanks [@arshad-shah](https://github.com/arshad-shah)! - Security hardening across connection, IPC, and plugin loading paths:

  - **PostgreSQL SSL** now verifies the server certificate by default whenever SSL is enabled, instead of silently disabling verification on every encrypted connection. The connection form gains an explicit _SSL Mode_ selector — pick "Verify (recommended)" or "Skip verification (insecure)" — so opt-out is deliberate, not a hidden default.
  - **MCP server** no longer returns `Access-Control-Allow-Origin: *`. The bearer-token check still gates every request, but removing the wildcard means even a leaked token can't be read by a malicious page in the user's browser.
  - **MCP `explain_query` tool** now routes through the same write-approval gate as `query`. Statements that hide DML behind a comment or after a semicolon (`EXPLAIN SELECT 1; DELETE FROM users`) can no longer be smuggled through the "read-only" label.
  - **Bundled plugins can no longer be shadowed.** A third-party plugin claiming the name `verql-plugin-postgresql` (or any other bundled name) is now rejected at discover and install time instead of silently overriding the built-in driver and intercepting credentials.
  - **Plugin `main` path traversal** is rejected at the validate phase. A manifest declaring `main: '../../../etc/passwd.js'` (or any absolute path) can no longer escape the plugin directory and load arbitrary files via `require()`.
  - **Encrypted credentials file** (`credentials.enc`) is now written with mode `0o600` so it isn't world-readable on shared systems.
  - **Main window** declares `setWindowOpenHandler` (denies all `window.open` requests) and a `will-navigate` guard pinned to the bundled assets / dev server, so the renderer can never be steered to an external URL.

## 0.6.0

### Minor Changes

- [#48](https://github.com/arshad-shah/verql/pull/48) [`1293f54`](https://github.com/arshad-shah/verql/commit/1293f542ff4adbbb2ee63530927daa6a401b8859) Thanks [@arshad-shah](https://github.com/arshad-shah)! - Added in-app update controls under Settings → General. When the running install is managed by Homebrew, you can check for a new version and trigger `brew upgrade --cask verql` from inside the app, then restart to apply. The mechanism is channel-pluggable — Mac App Store, Windows Store, Snap and APT can drop in later without changes to the UI or IPC layer.

### Patch Changes

- [#48](https://github.com/arshad-shah/verql/pull/48) [`1293f54`](https://github.com/arshad-shah/verql/commit/1293f542ff4adbbb2ee63530927daa6a401b8859) Thanks [@arshad-shah](https://github.com/arshad-shah)! - Plugin deactivations now survive an app restart. Previously the choice was kept only in memory, so every boot re-activated every installed plugin and the disable toggle appeared to do nothing across sessions.

## 0.5.0

### Minor Changes

- [#47](https://github.com/arshad-shah/verql/pull/47) [`ea26f17`](https://github.com/arshad-shah/verql/commit/ea26f171f48a68e12f89ae308757dc3342ea14ee) Thanks [@arshad-shah](https://github.com/arshad-shah)! - Redesigned the workspace tab bar in a browser-style: each tab now has rounded top corners and curved skirt corners that visually attach the active tab to the workspace below.

  Introduced five new theme tokens — `--color-tab-bar-bg`, `--color-tab-active-bg`, `--color-tab-active-fg`, `--color-tab-inactive-fg`, `--color-tab-hover-bg` — so themes (bundled and plugin-contributed) can tune tab contrast independently from the underlying surface palette. All nine plugin themes plus the baseline Nightshift were updated with values that keep the active tab clearly distinct from the bar, including on light themes where the previous hover wash blended into the background.

- [#47](https://github.com/arshad-shah/verql/pull/47) [`ea26f17`](https://github.com/arshad-shah/verql/commit/ea26f171f48a68e12f89ae308757dc3342ea14ee) Thanks [@arshad-shah](https://github.com/arshad-shah)! - Nightshift is now owned by the app shell rather than the core-themes plugin. Its CSS variables already lived in the always-loaded baseline; this release moves the Monaco editor definition into the renderer alongside, so the brand syntax highlighting works even with every plugin disabled. The renderer always prepends Nightshift to the theme list and ignores any plugin attempting to register the same id, keeping the brand surface authoritative. The core-themes plugin now ships nine themes (Lab, Ink & Paper, Dark, Light, Midnight, Dracula, Nord, Solarized, Catppuccin).

  The pre-React boot splash now uses the real Verql brand mark (frost-and-mint V-bars) instead of the placeholder chevron, matching the React-side splash so the loading-to-app handoff doesn't swap symbols.

### Patch Changes

- [#47](https://github.com/arshad-shah/verql/pull/47) [`ea26f17`](https://github.com/arshad-shah/verql/commit/ea26f171f48a68e12f89ae308757dc3342ea14ee) Thanks [@arshad-shah](https://github.com/arshad-shah)! - Light themes (Light, Lab, Ink & Paper) now render correctly:

  - The Light theme's selected-state and status colors (accent emphasis, success, warning, error, info) no longer fall back to the Nightshift baseline's mint/amber palette that washed out on white surfaces.
  - The Color Mode toggle (Light / Dark / System) on Lab and Ink & Paper themes had dark text on a dark accent-muted background; the accent-muted token is now a translucent tint suitable for selected-state backgrounds on light surfaces.
  - The Lab and Ink & Paper themes are now declared as `color-scheme: light` so native form controls render with the correct UA palette.

  Removed the duplicate `<Heading>` element from every Settings category — the settings layout already shows the category name in its header, so each page no longer renders two headings stacked on top of each other.

  Removed nine orphaned theme CSS files from `src/renderer/src/primitives/theme/themes/` that hadn't been imported since themes migrated to the plugin registry. The directory is gone; baseline Nightshift in `baseline.css` is the only renderer-bundled theme stylesheet.

- [#47](https://github.com/arshad-shah/verql/pull/47) [`ea26f17`](https://github.com/arshad-shah/verql/commit/ea26f171f48a68e12f89ae308757dc3342ea14ee) Thanks [@arshad-shah](https://github.com/arshad-shah)! - The Plugins settings page now lists each plugin's actual contributions (drivers, commands, panels, themes, exporters, importers, middleware) as inline chips below the description. Previously, plugins that contributed only exporters or importers — like Core Formats — appeared blank because the plugin host's contribution-verification loop didn't track those kinds, so nothing flowed through to the UI. The verification path now covers exporters and importers, and the settings page renders the full contribution list.

## 0.4.0

### Minor Changes

- **New default theme: Nightshift.** Plus two more curated themes — Lab (refined light) and Ink & Paper (warm editorial) — bringing the total to three primary directions before legacy/community themes.

  - `nightshift` (default) — modern dark with an electric mint accent (`#2bd9a3`)
  - `lab` — refined off-white with a deep teal accent (`#115E59`)
  - `inkpaper` — warm editorial paper-toned light with a rust accent (`#9E3022`)

  Old themes (`dark`, `light`, `midnight`, `dracula`, `nord`, `solarized`, `catppuccin`) remain available for users who prefer them. Existing user theme preferences are preserved across upgrade.

  Also wired up the **animations** appearance toggle — it now actually disables transitions app-wide instead of being a no-op switch. `ThemeProvider` writes `data-animations="off"` to `<html>`, and a global CSS rule kills `transition-duration` / `animation-duration` when set.

## 0.3.6

### Patch Changes

- Permanently fix `Cannot find module` crashes at launch by bundling pure-JS main-process dependencies (snowflake-sdk, axios, form-data, mongodb, ioredis, …) into `out/main/index.js` via Rollup, plus switch pnpm to `nodeLinker: hoisted` (pnpm's own recommendation for Electron projects).

  Previously, electron-builder's dep-graph walker silently dropped transitive deps under pnpm's isolated layout — `es-object-atoms`, `mime-db`, `get-intrinsic`, `call-bind-apply-helpers`, … all went missing from the packaged `app.asar` even when they were present at top-level `node_modules` locally. Bundling inlines them so runtime resolution never reaches the filesystem.

  Only native modules (`better-sqlite3`, `pg`, `mysql2`, `ssh2`, `cpu-features`) and `@electron/rebuild` remain external — those still ship in `node_modules` inside the asar and are packed reliably because they're declared direct dependencies.

## 0.3.5

### Patch Changes

- Fix `Cannot find module` crashes at launch by including the full transitive node_modules graph in the packaged `app.asar`. The previous `files: ["out/**/*"]` config left it to electron-builder's default dep-walker, which (under pnpm's symlinked layout) silently dropped many transitive deps — `mime-db`, `es-object-atoms`, `get-intrinsic`, `es-set-tostringtag`, and others all went missing. Switched to explicit `files` patterns that pull in `node_modules/**/*` with sensible excludes (changelogs, tests, docs, source maps).

  Asar package count: 353 → 434.

## 0.3.4

### Patch Changes

- Fix `Cannot find module 'mime-db'` crash at launch (still hitting users on v0.3.3). Despite `shamefullyHoist: true` in `pnpm-workspace.yaml` placing `mime-db` at the top of `node_modules` locally, the same install on macos-14 CI runners didn't include it in the packaged `app.asar` — snowflake-sdk's nested `mime-types` then couldn't resolve `mime-db` at runtime.

  Declared `mime-db@1.52.0` and `mime-types@2.1.35` as direct dependencies so electron-builder's dep-graph walker always packs them regardless of pnpm layout quirks.

## 0.3.3

### Patch Changes

- Fix release workflow dropping the Windows `.exe` from the release assets. With the new `artifactName` template the installer is named `verql-X.Y.Z-x64.exe` instead of `verql Setup X.Y.Z.exe`; the `*Setup*.exe` globs in the SHA computation and the upload step missed it. Switched both to `*.exe`.

## 0.3.2

### Patch Changes

- Force lowercase artifact filenames via explicit `artifactName` template (`${name}-${version}-${arch}.${ext}`). electron-builder previously derived names from `productName` ("Verql" with a capital V), producing `Verql-0.3.1-arm64.dmg` etc. — which mismatched the lowercase URLs in the Homebrew cask and broke the auto-bump workflow's asset download. Both architectures now carry an explicit `-x64` / `-arm64` suffix; workflow and cask updated to match.

## 0.3.1

### Patch Changes

- Fix macOS release build failing with `DOMParser.parseFromString: the provided mimeType "undefined" is not valid`. The `@xmldom/xmldom` 0.9 line made the `mimeType` argument mandatory; the `plist` library that electron-builder uses to parse the Electron prebuild's `Info.plist` doesn't pass one. Pin `@xmldom/xmldom` to `~0.8.13` via pnpm overrides.

## 0.3.0

### Minor Changes

- **Rebrand from Nova to Verql** — the previous name conflicted with existing trademarks.

  - Project, repo (`arshad-shah/nova` → `arshad-shah/verql`), package (`nova` → `verql`), and Homebrew tap (`arshad-shah/homebrew-nova` → `arshad-shah/homebrew-verql`) are all renamed.
  - macOS bundle identifier changes from `com.electron.nova` to `com.electron.verql`; settings paths under `~/Library/Application Support/` move accordingly.
  - Existing Homebrew installs need to be reinstalled: `brew uninstall --cask arshad-shah/nova/nova` and then `brew install --cask arshad-shah/verql/verql`.

  **Other fixes bundled with the rebrand:**

  - **pnpm-workspace.yaml** is now the source of truth for pnpm config. The previous `.npmrc` setting `shamefully-hoist=true` was silently ignored by pnpm 11; switching to `shamefullyHoist: true` in this file makes the hoist take effect. Without hoisting, transitive deps (e.g., `mime-db` pulled in by `snowflake-sdk` → `mime-types`) were dropped from the packaged `app.asar` and the app crashed at launch with `Cannot find module 'mime-db'`.
  - Explicit `build.appId` (`com.electron.verql`) and `build.productName` (`Verql`) so the bundle, dock label, and Info.plist all carry the proper brand instead of falling back to the lowercase package name.

## 0.2.5

### Patch Changes

- Fix macOS `.dmg` rejected with "verql is damaged and can't be opened". With `mac.identity: null`, electron-builder was skipping signing entirely, leaving every nested binary with its stale Electron-prebuild linker signature while the bundle's resource hashes (Info.plist, app.asar, icons) no longer matched. macOS rejected the app at launch (`spctl: code has no resources but signature indicates they must be present`).

  Adds an `afterPack` hook that ad-hoc re-signs the assembled bundle with `codesign --force --deep --sign -` before the dmg is created. Every nested binary now ends up with a consistent ad-hoc signature, matching resource hashes, and a null Team ID — so Gatekeeper accepts the bundle even without an Apple Developer ID.

## 0.2.4

### Patch Changes

- Fix macOS `.dmg` crashing on launch with `Library not loaded: Electron Framework ... mapping process and mapped file ... have different Team IDs`. Without `mac.identity: null`, electron-builder left the embedded Electron Framework's original signature intact while the outer binary was ad-hoc signed, so dyld refused to load nested frameworks at runtime. Setting `identity: null` forces consistent ad-hoc signing across every nested binary.

## 0.2.3

### Patch Changes

- Fix release workflow hashing step on macOS. macOS runners don't ship GNU `sha256sum`; use the platform's available hasher (`shasum -a 256` on macOS, `sha256sum` on Linux/Windows runners) so the artifact SHA file is produced on every platform.

## 0.2.2

### Patch Changes

- Fix macOS release build when no Apple signing certificate is configured. The previous workflow set `CSC_LINK: ""` which electron-builder treated as a path to the project root, failing with `not a file`. Now sets `CSC_IDENTITY_AUTO_DISCOVERY=false` when `MAC_CERT_P12_BASE64` is unset, producing an unsigned bundle instead.

## 0.2.1

### Patch Changes

- Fix release workflow: run `electron-vite build` before `electron-builder` so the packaged `app.asar` contains `out/main/index.js`. Without this step all three OS builds failed at the asar sanity check during the v0.2.0 release attempt.

## 0.2.0

### Minor Changes

- Initial public release of Verql — a fast, extensible desktop database client built on Electron + React.

  - **Database drivers** (each a bundled plugin): PostgreSQL, MySQL, SQLite, MongoDB, Redis, Snowflake.
  - **SQL editor** powered by Monaco with per-dialect autocomplete and code lens.
  - **Schema browser** with ER diagrams, table previews, and a row inspector.
  - **Import/export** for CSV, JSON, JSON-Lines, and SQL — all as plugin contributions.
  - **AI assistant** with OpenAI, Anthropic, and Ollama providers; per-query permission gating for tool calls.
  - **MCP server** built in, so Claude Code and other MCP clients can read schemas and run approved queries.
  - **SSH tunnels** as connection middleware.
  - **Themes**: dark, light, midnight — three-layer token system for further customisation.

  Pre-built binaries for macOS, Linux, and Windows are attached to this release. macOS and Windows builds are currently **unsigned**; see the README for verification steps using `sha256sums.txt` and the detached GPG signature.

All notable changes to Verql are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Going forward, entries are generated from
[Changesets](https://github.com/changesets/changesets) — see
[`.changeset/README.md`](./.changeset/README.md) for the workflow.
The 0.1.0 entry below is the consolidated history from the project's
private prototype phase through to first public release.

## [Unreleased]

## [0.1.0] - First public release

The initial release of Verql as an open-source project. Highlights of
the prototype phase that fed into 0.1.0:

### Application shell

- Three-panel workbench: primary sidebar with the connection explorer,
  centre area with tabbed editors / table views, secondary sidebar
  for context-aware panels.
- Bottom dock for query plans, charts, and plugin-contributed views.
- Inspector panel that reflects the user's current selection (row,
  column, schema object).
- Command palette (`Cmd+Shift+P`) that surfaces every Monaco editor
  action plus app commands and any plugin-contributed commands.
- Native macOS / Linux / Windows menu and accelerators.

### Database support

- Native drivers for PostgreSQL, MySQL, SQLite, Snowflake, MongoDB,
  and Redis.
- Schema introspection: tables, views, columns, indexes, foreign keys,
  materialised views, functions, triggers, sequences, extensions
  (per-driver coverage varies).
- ER diagram generation (`@xyflow/react` + dagre).
- Per-driver Monaco completion providers with static keywords plus
  dynamic table / column completions.
- AI-assisted inline completion in the SQL editor.
- Connection middleware support, with a bundled SSH tunnel middleware.

### Query editor

- Monaco-powered editor with per-driver language selection (`sql`,
  `json` for Mongo, `plaintext` for Redis).
- Code lens with inline "▶ Run / Explain" buttons.
- Per-action keybinding configuration in Settings.
- Query plan tab and charts tab in the bottom dock.

### Import / export

- CSV and JSON import / export for every driver, contributed by a
  `core-formats` bundled plugin.
- SQL exporter + importer contributed by each relational driver
  plugin (PostgreSQL, MySQL, SQLite, Snowflake) — uses dialect-aware
  identifier quoting.
- JSON-Lines + JSON-Array exporter for MongoDB; JSON exporter for
  Redis.

### AI assistant

- Bundled providers: OpenAI, Anthropic (Claude), Ollama.
- Per-tool permission gating; write operations require user approval.
- Built-in tools: list tables, describe table, get relationships,
  connection info, execute query, generate SQL, complete SQL, explain
  results.
- AI keys stored encrypted at rest via Electron `safeStorage`.

### MCP server

- Optional built-in MCP server that exposes the active connection to
  external AI tools (Claude Code, etc.).
- Bearer token authentication; user must explicitly start the server
  in Settings.

### Plugin system (extension surfaces)

- Discover → validate → resolve → activate → verify lifecycle.
- Manifest validation enforced equally for bundled and external
  plugins.
- Per-plugin error budget auto-disables a plugin that throws
  repeatedly at runtime.
- Contribution surfaces:
  - drivers (with `sqlDialect`, `editorLanguage`,
    `defaultSchemaCandidates`, `getTableData`)
  - exporters / importers
  - type mappers
  - connection middleware
  - completion providers
  - panels (primary / secondary / bottom dock)
  - commands (with keybindings)
  - declarative UI widgets (toolbar selectors, status bar items,
    slots and resolvers)
  - AI providers / tools / context providers
  - settings (per-plugin, mounted into core categories)
- Plugins can be installed from a directory or a zip via the
  Extensions panel.

### Security

- Renderer sandboxed: `sandbox: true`, `contextIsolation: true`,
  `nodeIntegration: false`, `webSecurity: true`.
- All SQL identifier interpolation goes through `quoteIdentifier()`,
  which rejects NUL / CR / LF / tab and caps length at 255.
- Secrets stored encrypted via OS-keyring-backed `safeStorage`;
  legacy plain-text secrets are migrated on first launch.
- Bundled CI dependency audit (`pnpm audit --audit-level high`).
- Zero known high or critical dependency vulnerabilities.

### Architecture refactors that fed into 0.1.0

- Driver-driven extension model: removed every hardcoded
  `connectionType === '…'` branch from the orchestrator and renderer.
  Drivers contribute capability flags (`sqlDialect`,
  `defaultSchemaCandidates`, `editorLanguage`, …) that the generic
  code paths read.
- `TypeMapperRegistry` for cross-dialect type translation —
  migration code is dialect-agnostic.
- `IPC_CHANNELS` / `IPC_EVENTS` constants in `shared/ipc.ts` as the
  single source of truth for every renderer ↔ main channel. Coverage
  test enforces that no call site uses an inline string literal.
- Plugin-driven import / export — formats register themselves through
  the SDK; the orchestrator never imports a concrete exporter.

### Tooling

- 834 unit tests, runnable under `pnpm test --project unit`.
- Storybook for primitives + components.
- TypeScript strict mode across the codebase; `tsc -b` is part of CI.
- GitHub Actions CI: unit tests on Node 20 + 22, typecheck, dependency
  audit, and a production `electron-vite build`.

[Unreleased]: https://github.com/arshad-shah/verql/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/arshad-shah/verql/releases/tag/v0.1.0
