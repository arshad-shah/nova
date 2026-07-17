---
title: AI assistant
description: How Verql's bundled AI plugin works — providers, the tool registry shared with MCP, the App-Action registry, the orchestration loop, and conversation history.
sidebar:
  order: 5
---

The AI assistant is a **bundled plugin** (`src/main/plugins/bundled/ai/`).
Nothing in the core app knows about OpenAI or Anthropic; the plugin registers
providers, tools, and IPC handlers through the SDK at activation, exactly like a
driver plugin registers a database.

This doc covers how a chat turn flows end to end, the tool system shared with
MCP, the App-Action registry that lets the AI act on the UI, conversation
history, and how the orchestrator keeps requests bounded.

- [Process split](#process-split)
- [Providers and models](#providers-and-models)
- [Tools: the shared ToolRegistry](#tools-the-shared-toolregistry)
- [App actions: deep links and agentic UI](#app-actions-deep-links-and-agentic-ui)
- [The orchestration loop](#the-orchestration-loop)
- [Conversation history](#conversation-history)
- [Enhancements (generate / complete / explain)](#enhancements)
- [Renderer state and UI](#renderer-state-and-ui)
- [File map](#file-map)

## Process split

| Runs in | Responsibility |
|---------|----------------|
| **main** (`bundled/ai/internal/`) | provider API calls, the tool loop, permission gating, conversation state for the current turn |
| **renderer** (`stores/ai.ts`, `components/ai/`) | chat UI, conversation history + persistence, the App-Action registry, approval prompts |
| **shared** (`shared/ai-types.ts`) | message/event/request types crossing the IPC boundary |

The renderer never calls a provider directly. It sends `ai:chat:start` and
streams `ai:chat:event` broadcasts back. All AI IPC channels live under the
`ai:*` prefix in [`shared/ipc.ts`](https://github.com/arshad-shah/verql/blob/main/shared/ipc.ts) (see [ipc.md](/develop/ipc/)).

## Providers and models

`AIProviderRegistry` holds the registered providers and tracks the active
provider + model id. Three providers ship in the box:

- `providers/openai.ts`, `providers/anthropic.ts`, `providers/ollama.ts`

Each implements the `AIProvider` interface (`internal/types.ts`): `models()`
(lists models with a `contextWindow` and a `costTier`) and `chat(request)` (an
async generator of `{ type: 'text' | 'tool-call' | 'done' | 'error', … }`
chunks). API keys live in the OS keyring under the `__ai__` namespace, never in
`settings.json` (a one-time migration moves any legacy plaintext key out).

When a provider becomes active, the cheapest model for that vendor is selected
by default (`pick-cheapest-model.ts`), unless the user already chose one.

## Tools: the shared ToolRegistry

Tool calling is unified across the AI chat and the built-in MCP server. Both
read the **same** `ToolRegistry` (`sdk/tool-registry.ts`), constructed once in
`ipc-handlers.ts` and handed to every plugin. A `Tool` (`sdk/types.ts`):

```ts
interface Tool {
  id: string
  name: string
  description: string
  inputSchema: JsonSchemaObject   // authors build this with toJsonSchema(z.object({ … }))
  permission: 'read' | 'write'
  surfaces?: Array<'ai' | 'mcp'>   // omitted = both
  execute(params, ctx: ToolContext): Promise<ToolResult>
}
```

- The canonical database tools (`query`, `explain_query`, `list_tables`,
  `describe_table`, `get_schemas`, `connection_info`) are registered by the
  `db-tools` bundled plugin and are visible to **both** AI and MCP.
- `surfaces: ['ai']` scopes a tool to the chat only — the headless MCP server
  never sees it. `perform_app_action` (below) is AI-only for this reason.
- `permission: 'write'` tools route through the `PermissionManager`: the loop
  emits an `approval-request` event and waits for the user's
  `ai:chat:approval-response` before executing.

## App actions: deep links and agentic UI

"App actions" are named, parameterized things the assistant can point the user
to or perform inside the renderer — opening a panel, a query tab, connecting to
a database, exporting results. They are the single source of truth behind two
surfaces, so a new action lights up both with no extra wiring.

The registry lives in the **renderer** (`lib/app-actions/`):

```ts
interface AppAction {
  id: string                       // used in verql://action/<id> links + tool calls
  title: string                    // human label on chips / in the catalog
  description: string              // shown to the AI in the system prompt
  kind: 'navigation' | 'mutating'  // gates agentic execution
  params?: Record<string, AppActionParam>
  run: (params) => void | Promise<void>
}
```

Built-ins are registered at startup (`builtins.ts`, via `registerBuiltinAppActions()`
in `App.tsx`); plugins can register their own through the same `appActions.register`
API, so any plugin destination becomes referenceable by the AI automatically.

**Built-in ids are centralized constants.** Every built-in action id lives once
in `APP_ACTION` (`lib/app-actions/ids.ts`) — the same pattern as `KEYBINDING_ACTION`,
`SETTINGS_CATEGORY` and `IPC_CHANNELS`. Code never writes a built-in action id as
a raw string: `builtins.ts`, the chip icon map, and tests all import `APP_ACTION.*`.
Plugin actions keep using composite `pluginId:commandId` ids, so `AppAction.id`
stays a permissive `string`.

**Two surfaces, one registry:**

1. **Deep-link chips (user-clicked).** The assistant writes a markdown link with
   a `verql://action/<id>?param=value` href. `MarkdownContent`'s link renderer
   intercepts that scheme (`parse.ts`) and renders an `ActionChip` instead of an
   anchor. Clicking it runs the action. `mutating` chips confirm first.
2. **Agentic tool (AI-initiated).** The AI calls the `perform_app_action` tool
   (registered in `internal/index.ts`, `surfaces: ['ai']`). Because tools run in
   **main** but actions run in the **renderer**, the tool broadcasts
   `app:action:perform` with a correlation id; the renderer bridge (`bridge.ts`)
   runs the action and reports the outcome back over `app:action:result`, so the
   tool result honestly reflects success/failure. **Only `navigation` actions
   run agentically** — the bridge refuses `mutating` ones, which must go through
   a user-clicked chip.

The AI learns the catalog because the renderer sends `appActions.describeForPrompt()`
on every `ai:chat:start`, and `ConversationManager.assembleSystemMessage()`
appends it with usage rules. See `builtins.ts` for the full list (connect /
disconnect / switch connection, open a query tab, export results, open a
chart, reveal a table, open a saved query, ER diagram, insert into the editor,
settings, notifications, …).

## The orchestration loop

`ConversationManager.chat()` (`internal/conversation-manager.ts`) is an async
generator that drives one user turn to completion:

1. **Assemble the system prompt** — base rules + the connected driver, the
   current schema summary, registered context providers, the saved-connections
   summary, a recent-notifications summary (for diagnostics), and the app-action
   catalog.
2. **Budget the context.** The full transcript is kept in memory for display and
   persistence, but only a trimmed copy is sent each round.
   `token-estimate.ts` gives a cheap `chars/4` estimate; `trimMessagesToBudget`
   keeps the system prompt plus the most recent turns within
   `maxContextTokens` (default 24k), always retaining the newest message and
   never leading with an orphaned tool result. This stops a long conversation
   from growing the request — and the bill — without bound.
3. **Stream + tool loop.** Text chunks are forwarded as `chunk` events. On a
   `tool-call`: resolve the tool, gate `write` tools through approval, execute
   via `toolRegistry.execute(id, params, { connectionId, abortSignal })`, and
   feed the result back. Loops up to `MAX_TOOL_ROUNDS` (10) until the model
   answers with no further tool calls.

The connection id is threaded **per request** from the renderer (the UI's active
connection), overriding the ambient one, so the tools always run against the
database the user is actually looking at.

## Conversation history

The renderer owns conversations and persists them to the **internal SQLite
app-data store** in the main process (`appdata:conversations:*` IPC →
`src/main/appdata/store.ts`, file `${userData}/app.db`). This replaced the
former `localStorage` blob (`verql:ai-conversations`), which hit the browser
storage quota and rewrote the entire history on every message; the store now
takes one transactional write per settled message. The legacy `localStorage`
payload is migrated into the store on first launch (see
[`docs/proposals/internal-app-data-store.md`](https://github.com/arshad-shah/verql/blob/main/docs/proposals/internal-app-data-store.md)).
State and actions live in `stores/ai.ts`:

```ts
interface Conversation {
  id: string
  title: string                // auto-derived from the first user message
  messages: AIChatMessage[]
  stats: SessionStats          // per-conversation token / tool-call totals
  createdAt: number
  updatedAt: number
}
```

- `newConversation` / `switchConversation` / `deleteConversation` /
  `renameConversation` / `branchConversation` manage the list; the history
  dropdown built into `ChatPanelHeader` (at the top of the panel) is the
  switcher.
- **Branching** (`branchConversation(messageId)`, surfaced as the branch button
  on a message) forks a new conversation containing the history up to that
  message, leaving the original intact.
- A module-level store subscription keeps the active conversation in sync with
  the live message/stat state and writes it through to the app-data store
  (`appdata:conversations:upsert`) — only the active conversation, not the whole
  list. `hydrate()` loads the set (and runs the one-time migration) on app boot.
- **Compaction** (`compactConversation`, exposed as a Compact button in
  `ChatPanelHeader`) summarizes every message except the last two turns into a
  single system message via `ai:conversation:summarize` (an LLM call, see
  Enhancements below), replacing the older history in place; `undoLastCompact`
  restores the pre-compaction snapshot. `AutoCompactBanner` watches token usage
  against the active model's context window and prompts to compact automatically
  once usage crosses 80% (a 5s countdown, skippable), forcing the prompt at 95%.

Because the main process starts each launch with no history, the renderer pushes
the relevant transcript to main via **`ai:messages:set`** (→
`ConversationManager.setMessages`) on switch, on branch, and once on startup for
the restored active conversation. Otherwise continuing a restored chat would send
only the new message and lose context.

## Enhancements

Separate from tool-calling chat, `internal/enhancements.ts` exposes direct
one-shot provider calls that don't go through the conversation loop or tools:

| Channel | Used by | Purpose |
|---------|---------|---------|
| `ai:generate-sql` | none currently | natural language → SQL (`generateSql`); the IPC channel and handler exist but no renderer component calls it today |
| `ai:complete-sql` | `lib/monaco-ai-completion.ts`'s inline completions provider, registered directly in `QueryEditor`'s `onMount` (SQL language only); the `useAIInlineSuggest` hook is separate — it just mounts the status pill/accept-reject overlay that reflects the same module's state | ghost-text completion |
| `ai:explain-results` | none currently | one-shot "explain a result set" (`explainResults`); superseded in the UI by the streaming variant below — no renderer caller remains |
| `ai:conversation:summarize` | `stores/ai.ts`'s `compactConversation` | summarizes older turns into one system message for conversation compaction (see Conversation history) |

### Streaming explain results

`ai:explain:start` returns `{ streamId, model }`; the plugin emits
`ai:explain:event` messages (`token` | `done` | `error`) keyed by `streamId`
until completion. Callers may abort with `ai:explain:abort(streamId)`. The
renderer's Results bar uses this for token-by-token rendering of the Explain
card with a Stop button.

## Renderer state and UI

`stores/ai.ts` (`useAIStore`) holds messages, streaming state, providers/models,
approvals, per-session stats, and the conversation list. It listens for
`ai:chat:event` and applies each `AIStreamEvent` (`handleStreamEvent`).

Components in `components/ai/`:

| Component | Role |
|-----------|------|
| `ChatPanel` | panel shell: `ChatPanelHeader` + `AutoCompactBanner` + `MessageThread` + `ActionZone` |
| `ChatPanelHeader` | conversation switcher (new / switch / rename / delete), active model name, and a context-window usage bar; hosts the manual Compact action |
| `AutoCompactBanner` | watches token usage against the model's context window and drives the auto-compact countdown/forced prompt (see Conversation history) |
| `MessageThread` | renders the message list + empty-state suggestion chips |
| `ActionZone` | sticky area above the composer: pending `ApprovalCard`, `PermissionModeRow`, and `ChatInput` |
| `MessageBubble` | a user/assistant bubble; hosts copy / retry / branch actions |
| `ToolCallCard` | a tool call's status, arguments, and result (resolves `perform_app_action` ids to titles) |
| `ApprovalCard` | approval prompt for `write` tools |
| `PermissionModeRow` | read-only / ask-write / auto permission-profile picker |
| `MarkdownContent` | assistant markdown; intercepts `verql://action/*` → `ActionChip` |
| `ActionChip` | clickable deep-link pill backed by an `AppAction` |

## File map

```
src/main/plugins/bundled/ai/
├── index.ts                      # plugin activate(): wires deps → startAIModule
├── prompts/                      # chat-system.md, chat-fragments.md, generate-query.md,
│                                  # inline-complete.md, explain.md, summarize.md + index.ts
└── internal/
    ├── index.ts                  # startAIModule: providers, IPC handlers, perform_app_action tool
    ├── conversation-manager.ts   # system prompt + the tool loop + context trimming
    ├── token-estimate.ts         # estimateTokens + trimMessagesToBudget
    ├── provider-registry.ts      # active provider/model
    ├── permission-manager.ts     # approval requests for write tools
    ├── enhancements.ts           # generate / complete / explain SQL + conversation summarize
    ├── pick-cheapest-model.ts
    └── providers/{openai,anthropic,ollama}.ts

src/renderer/src/
├── stores/ai.ts                  # useAIStore: messages, conversations, persistence
├── lib/app-actions/
│   ├── types.ts  registry.ts  builtins.ts  parse.ts  bridge.ts  resolve.ts
└── components/ai/                # ChatPanel, ChatPanelHeader, AutoCompactBanner, MessageBubble, …

shared/ai-types.ts                # AIChatMessage, AIStreamEvent, AIChatStartRequest, …
```
