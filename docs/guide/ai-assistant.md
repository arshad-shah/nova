# The AI assistant

Verql includes a built-in **AI assistant** that can help you write SQL,
understand your schema, and explain query results — using a provider and model
you choose, with your own API key. It can also act as a tool *for* external AI
clients through a built-in MCP server.

[← Back to the User Guide](./README.md)

## Providers and your API key

The assistant supports these providers out of the box:

| Provider | Notes |
|----------|-------|
| **OpenAI** | Bring your own OpenAI API key. |
| **Anthropic** | Bring your own Anthropic (Claude) API key. |
| **Ollama** | Connect to a local Ollama instance — useful for running models on your own machine. |

You supply your own API key. Like your database credentials, keys are stored
encrypted in your operating system's keychain via Electron's `safeStorage` —
never in plain text on disk. (See
[Connecting → How your credentials are stored](./connecting.md#how-your-credentials-are-stored).)

## Chatting and tool calls

You talk to the assistant in a chat panel. To actually help, it can use **tools**
— for example, listing tables, describing a table, or running a query against your
connected database.

**Tool calls are gated by a permission mode** you pick in the chat panel:
**Read-only** (writes are refused outright), **Ask before writes** (the
default — a write tool call pauses for your approval before it runs), or
**Auto** (writes run without asking). Outside of Auto mode, the assistant
doesn't silently touch your database: write operations wait for your
go-ahead before they run.

## Conversation history

Your conversations are kept so you can return to earlier chats rather than
starting over each time. You can revisit and continue prior threads.

## The built-in MCP server

Verql also includes an **MCP (Model Context Protocol) server**. When you turn it
on, it lets an external MCP client — such as Claude Code — connect to Verql and
use a curated set of tools to read your schema and run approved queries against
your active connection.

Key safeguards, all under your control in the MCP settings:

- **You must explicitly start the server.** It is off until you enable it.
- **Tokenised endpoint.** Every request must present a bearer token, so a random
  process can't connect. (The server does not allow arbitrary web pages to reach
  it.)
- **Per-tool permission gating.** You choose which tools the server exposes with
  per-tool enable toggles — the same approval model the in-app assistant uses.
- **Read-only mode.** Flip this on to let external clients read without being able
  to write.
- **Row limit.** Cap how many rows a tool call can return.
- **Live activity log.** Watch what the server is doing in real time.

Because the assistant and the MCP server share the same underlying tool
registry, a tool behaves consistently whether you invoke it in chat or an
external client invokes it — including the write-approval gate. (For example,
attempts to smuggle a data-modifying statement past the "read-only" label are
routed through the same write-approval check.)

> Only start the MCP server and connect clients you trust. Treat the bearer
> token like a password.

---

Next: [Managing plugins →](./managing-plugins.md)
