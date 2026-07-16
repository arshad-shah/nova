# AI assistant

Ports the bundled `ai` plugin (`src/main/plugins/bundled/ai/`, ~2.4k LOC):
provider registry + three REST providers, the conversation manager's
streaming tool-call loop, the permission manager, the enhancements
(one-shot SQL helpers), API-key handling, and the 24 `ai:*` channels.
Crate: `verql-ai`. Related: [ADR-0002](../decisions/ADR-0002-rust-first-internals.md),
[`mcp-server.md`](./mcp-server.md) (shared ToolRegistry),
[`activity-attention-notifications.md`](./activity-attention-notifications.md)
(`tracedFetch`, attention hub), [`../04-ipc-and-events-contract.md`](../04-ipc-and-events-contract.md)
(stream-parity rules).

## v1 behavior contract

### Provider contract (`ai/internal/types.ts`)

`AIProvider { id, name, supportsToolCalling, models(): Promise<AIProviderModel[]>,
chat(request): AsyncIterable<AIProviderChunk> }`. `AIProviderChunk.type` ∈
`text | tool-call | done | error`, with `content`, `toolCall {id, name,
arguments: string}`, `error`, `usage {inputTokens, outputTokens}`.
`AIProviderModel`: `id, name, contextWindow, capabilities, costTier?`
(0 = cheapest; `pick-cheapest-model.ts` uses it for defaulting). All three
providers use raw `fetch` via **`tracedFetch`** (`src/main/activity/net.ts`)
— no vendor SDKs.

### The three providers (REST wire behavior, pinned)

| | Anthropic (`providers/anthropic.ts`) | OpenAI (`providers/openai.ts`) | Ollama (`providers/ollama.ts`) |
|---|---|---|---|
| Models | `GET https://api.anthropic.com/v1/models?limit=100[&after_id]` (paginated via `has_more`/`last_id`) | `GET https://api.openai.com/v1/models`, filtered to `CHAT_MODEL_PREFIXES = ['gpt-4o','gpt-4.1','o1','o3','o4']`, id-sorted | `GET {endpoint}/api/tags`; per-model `POST /api/show` picks the first `*.context_length` (fallback 8192) |
| Auth | headers `x-api-key` + `anthropic-version: 2023-06-01` | `Authorization: Bearer <key>` | none (endpoint = `ai.ollamaEndpoint` setting, default `http://localhost:11434`) |
| Chat | `POST /v1/messages`, `stream: true`, `max_tokens` default 4096 | `POST /v1/chat/completions`, `stream: true`, `stream_options: {include_usage: true}` | `POST /api/chat`, `stream: true` |
| Stream format | SSE `data:` lines; events `message_start` (input tokens), `content_block_start/delta` (`text_delta` → text chunks; `input_json_delta` accumulated in `partialJson`), `content_block_stop` (emits the complete `tool-call`), `message_delta` (output tokens), `message_stop` (→ `done` + usage), `error` | SSE `data:` lines; `delta.content` → text; `delta.tool_calls` accumulated **by index** in `toolCallAccumulator` (id/name on first delta, `arguments` concatenated), flushed on `data: [DONE]` followed by `done` + usage (`prompt_tokens`/`completion_tokens`) | **ndjson** (one JSON per line); `message.content` → text; `message.tool_calls` emitted immediately with a synthesized id `` `ollama-${Date.now()}` ``; `done: true` → `done` |
| Quirks | `temperature` dropped for Claude ≥4 (`supportsTemperature` regexes); prompt caching: `cache_control: {type:'ephemeral'}` on the system block and the **last** tool; context-window heuristics (`anthropicContextWindow`: Opus/Sonnet ≥4.6 → 1M else 200k); tool results sent as user-role `tool_result` blocks, consecutive ones merged (`toAnthropicMessages`) | `openaiFriendlyName` display names; `openaiContextWindow` heuristics (gpt-5/4.1 → 1,047,576; o3/o4 → 200k; else 128k) | **SSRF guard `assertSafeOllamaEndpoint`**: http(s) only, no embedded credentials, blocks `169.254.169.254`, `metadata.google.internal`, `0.0.0.0`, `::`, any `169.254.*` — validated before *every* request; errors are yielded as `error` chunks, not thrown |

### Conversation manager (`ai/internal/conversation-manager.ts`)

`chat()` is an `AsyncIterable<AIStreamEvent>` driving up to
`MAX_TOOL_ROUNDS = 10` provider rounds:

1. **System prompt assembly** (`assembleSystemMessage` → `buildChatSystemPrompt`
   in `ai/prompts/`): connection meta, **schema auto-include** — a table-name
   list from `schemaAccess.getSchemaSummary`, capped at 200 names with a
   "+N more — call list_tables" tail (`getSchemaContext` in
   `ai/internal/index.ts`), plugin `AIContextProvider`s (e.g. mongodb's),
   plus per-request `appActionsCatalog`, `connectionsSummary`,
   `notificationsSummary` sent by the renderer (`AIChatStartRequest` in
   `shared/ai-types.ts`).
2. **Token budget**: `DEFAULT_MAX_CONTEXT_TOKENS = 24000`,
   `MIN_HISTORY_TOKENS = 2000`; `historyBudget = max(2000, maxContext −
   estimateTokens(system))`; history trimmed by `trimMessagesToBudget`. Full
   history stays in memory for display/persistence — only the request payload
   is trimmed.
3. **Tool execution** per `tool-call` chunk: unknown tool and unparseable
   arguments produce failed `tool-result`s; `permissionManager.isWriteBlocked`
   short-circuits with a "Blocked: … read-only" result;
   `permissionManager.needsApproval` yields an `approval-request` event,
   publishes to the **attention hub** (`kind:'approval', source:'ai'`), then
   awaits `waitForApproval` (**no timeout** — unlike MCP's 5-minute one) and
   resolves the attention request in a `finally`; rejection yields a "User
   rejected this action" result. Approved calls go through
   `toolRegistry.execute(tool.id, params, {connectionId, abortSignal})` so
   the unified activity recorder logs them.
4. Assistant text + tool calls are appended to history (`role:'assistant'`
   with `toolCalls`), each result as `role:'tool'` with `toolCallId`; the loop
   ends when a round makes no tool calls. Usage from `done` chunks is summed
   and emitted in the terminal `{type:'done', usage?}`.

**App-action round trip**: the plugin registers `perform_app_action`
(`surfaces: ['ai']`, permission `read`) which broadcasts
`app:action:perform {requestId, actionId, params}` and awaits the renderer's
`app:action:result` invoke, with `APP_ACTION_TIMEOUT_MS = 10_000`
(`ai/internal/index.ts`). MCP never sees this tool.

### Token estimation (`ai/internal/token-estimate.ts` — port the exact algorithm)

- `estimateTokens(text) = ceil(text.length / 4)` (0 for empty).
- `estimateMessageTokens(msg)` = content + each toolCall's `name` +
  `arguments` estimates, **+ 4** framing overhead.
- `trimMessagesToBudget(messages, maxTokens)`: walk backwards summing
  estimates; the **newest message is always kept** even if it alone exceeds
  the budget; stop before overflow; then advance `startIdx` forward to the
  first `role === 'user'` message (never lead with an orphaned tool result or
  assistant turn); if that consumes everything, fall back to the last message.

### Permission manager (`ai/internal/permission-manager.ts`)

Profiles `'read-only' | 'ask-write' | 'auto'` (persisted at
`ai.permissionProfile`). `isEffectiveWrite` = per-tool override (or declared
permission) run through `isWriteToolCall` — a `read` tool whose `sql` param
is a write/DDL statement counts as write (same helper as MCP, closing the
`EXPLAIN ANALYZE DELETE` hole). `read-only` blocks writes outright
(`isWriteBlocked`), `ask-write` requires approval, `auto` approves silently.
Pending approvals resolved via `resolveApproval(requestId, approved)` from
the `ai:chat:approval-response` channel.

### Stream events (`shared/ai-types.ts` — the wire contract)

`AIStreamEvent` = `{type:'chunk', content}` · `{type:'tool-call', toolCall}` ·
`{type:'tool-result', result: AIToolCallResult}` · `{type:'approval-request',
request: AIApprovalRequest}` · `{type:'done', usage?: AITokenUsage}` ·
`{type:'error', error}`. Broadcast as `ai:chat:event` with a **two-element
payload `(streamId, event)`** (`deps.broadcast(IPC_EVENTS.AI_CHAT_EVENT,
streamId, event)`; consumed as `(streamId, event)` in
`src/renderer/src/stores/ai.ts`). Ordering guarantees to pin:

- events for one `streamId` are strictly ordered; streams never interleave
  within an id;
- every `tool-call` is followed (before the next `tool-call`'s result) by
  exactly one `tool-result` with the matching `toolCallId`, with at most one
  `approval-request` between them;
- exactly one terminal event per stream: `done` (normal completion **and**
  abort — the manager falls out of the loop and still yields `done`), or a
  handler-level `error` when `chat()` throws (the wrapper in
  `ai/internal/index.ts` catches and broadcasts `{type:'error'}` with no
  trailing `done`). Provider-emitted `error` chunks are forwarded as
  non-terminal `error` events.

### Keys, settings, wiring (`ai/internal/index.ts`)

API keys live in keyring namespace `AI_KEYRING_NS = '__ai__'` under keys
`openai` / `anthropic` (`ai:keys:has` / `ai:keys:set`); a one-time migration
sweeps legacy plaintext `ai.openaiKey`/`ai.anthropicKey` settings into the
keyring and blanks them. `ai.activeProvider` / `ai.activeModel` persist
selection; on first use the active provider defaults to
anthropic-then-openai by key presence and the model to
`pickCheapestModel(models)`. `ai:providers:list-configured` probes Ollama
(`/api/tags`, 2s timeout, SSRF-guarded) to decide whether to list it.
Active chat streams are tracked in `activeStreams: Map<streamId,
AbortController>`; `ai:chat:abort` aborts by id **and** calls
`conversationManager.abort()`.

### The 24 `ai:*` channels, by concern

| Concern | Channels |
|---|---|
| Chat stream | `ai:chat:start` (→ `{streamId}`, events async), `ai:chat:abort`, `ai:chat:approval-response` |
| Providers | `ai:providers:list`, `ai:providers:list-configured`, `ai:providers:set-active` (re-defaults model via `pickCheapestModel` unless current model belongs to the provider), `ai:providers:get-active` |
| Models | `ai:models:list`, `ai:models:set-active`, `ai:models:get-active` |
| History sync | `ai:messages:list`, `ai:messages:clear`, `ai:messages:set` (renderer swaps/branches persisted conversations into the manager) |
| Tools | `ai:tools:list` (id/name/description/permission) |
| Keys | `ai:keys:has`, `ai:keys:set` |
| Enhancements (one-shot) | `ai:generate-sql`, `ai:complete-sql`, `ai:explain-results`, `ai:conversation:summarize` (`ai/internal/enhancements.ts` — non-streaming provider calls) |
| Explain stream | `ai:explain:start` (→ `{streamId, model}`; `ai:explain:event` with `{streamId, kind: 'token'|'done'|'error', …}`), `ai:explain:abort` |
| Permissions | `ai:permission:get-profile`, `ai:permission:set-profile` |

## v2 design (`verql-ai`)

- **`trait AiProvider`** mirroring the v1 contract:
  `async fn models(&self) -> Vec<ModelInfo>`; `fn chat(&self, req:
  ChatRequest) -> BoxStream<'_, ProviderChunk>`; `fn supports_tool_calling`.
  Implementations `anthropic.rs` / `openai.rs` / `ollama.rs` over **reqwest**
  with `bytes_stream()` + a small line-splitting parser (one for SSE `data:`
  framing, one for ndjson) — the v1 parsers are already hand-rolled
  line-buffer loops, so they port structurally 1:1, including the OpenAI
  per-index tool-call accumulator, the Anthropic `partial_json` accumulation,
  the temperature/caching/context-window heuristics, and
  `assert_safe_ollama_endpoint` (same blocklist, checked per request).
- **Conversation manager** as an async fn spawned per `ai:chat:start`: the
  same round loop, budget math, and approval seam; events sent over a
  `tokio::sync::mpsc` channel whose consumer does
  `app_handle.emit("ai:chat:event", (stream_id, event))` — the tuple payload
  is preserved so the shim delivers `(streamId, event)` unchanged. Abort via
  `tokio_util::sync::CancellationToken` mapped to reqwest request abort +
  loop checks, replacing `AbortController`.
- **Token estimate**: `estimate_tokens` / `estimate_message_tokens` /
  `trim_messages_to_budget` ported exactly (constants 24000 / 2000 / +4 /
  chars÷4-ceil) and pinned by shared test vectors.
- Permission manager: same three profiles + `is_write_tool_call` (ported once
  in `verql-tools`, shared with `verql-mcp` exactly as v1 shares
  `sdk/tool-schema.ts`); pending approvals as
  `DashMap<Uuid, oneshot::Sender<bool>>`.
- Keys via `verql-keyring` (`__ai__` namespace unchanged — v1 secrets migrate
  per [`keyring.md`](./keyring.md)); all provider HTTP goes through the
  `traced_fetch` wrapper in `verql-core` (see
  [`activity-attention-notifications.md`](./activity-attention-notifications.md)).
- The plugin's two `settings` contributions (`autoIncludeSchema`,
  `maxContextMessages` — declared in `bundled/ai/index.ts`) stay declared by
  the crate's synthetic manifest so `plugins:get-categorized-settings('ai')`
  is unchanged.

## Parity cases

- **Recorded stream corpus** (the Phase-5 gate replays it, per
  [`../04-ipc-and-events-contract.md`](../04-ipc-and-events-contract.md)):
  raw v1 provider responses (Anthropic SSE incl. multi-block tool_use +
  usage events; OpenAI SSE incl. split tool-call deltas + `[DONE]` flush +
  usage-only chunk; Ollama ndjson incl. tool_calls) served from a mock HTTP
  server → the emitted `ai:chat:event` sequence matches v1 event-for-event
  (chunk granularity may differ; types/order/terminals may not).
- **Trim boundaries**: newest-message-exceeds-budget; window landing on a
  tool result (must advance to the next user turn); assistant/tool-only tail
  (falls back to last message); budget exactly at a message boundary.
- **Approval flows**: ask-write approve/deny; read-only block (no
  approval-request emitted); `read` tool + write SQL treated as write; abort
  during pending approval.
- **`supportsTemperature` / context-window / cost-tier matrices** as table
  tests on the v1 model-id fixtures.
- **SSRF**: every `assertSafeOllamaEndpoint` rejection case (scheme,
  credentials, metadata hosts, `169.254.*`, `[::]`).
- **Key handling**: `ai:keys:set` → keyring only, never config; legacy
  `ai.*Key` migration blanks the setting.

## Open questions

- The `maxContextMessages` setting is declared but the manager budgets by
  tokens, not message count (v1 behavior). Port as-is (setting inert) or wire
  it? Parity says as-is; T-502 confirms and logs.
- Whether `ai:chat:abort`'s double abort (per-stream controller + global
  `conversationManager.abort()`) is load-bearing for concurrent streams —
  v1 has one manager, so streams share state; T-501 replicates the
  single-manager semantics rather than "fixing" concurrency.
