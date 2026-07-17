---
title: User Guide
description: An overview of Verql, the fast cross-platform desktop database client, and a map of this guide.
sidebar:
  order: 0
---

**Verql** is a fast, cross-platform desktop database client. You connect to your
databases, browse their structure, write and run queries, visualise results, and
move data in and out — all from one app. It runs on macOS, Linux, and Windows,
and it's open source ([MIT](https://github.com/arshad-shah/verql/blob/main/LICENSE),
by Arshad Shah).

Out of the box, Verql speaks **PostgreSQL**, **MySQL**, and **SQLite**, with
**MongoDB**, **Redis**, and **Snowflake** added by bundled plugins. It includes a
query editor with autocomplete, an interactive results grid, ER diagrams, charts,
import/export tools, and a built-in AI assistant — and it can be extended further
with plugins.

> This guide is for people **using** Verql to work with databases. If you want to
> build a plugin or contribute to Verql itself, see the developer docs in the
> [`docs/`](/develop/) folder instead.

## Contents

| Page | What it covers |
|------|----------------|
| [Installation](/guide/installation/) | Installing on macOS, Linux, and Windows; verifying your download; auto-updates. |
| [Connecting to a database](/guide/connecting/) | Creating connection profiles, supported databases, SSH tunnels, and how your credentials are kept safe. |
| [Running queries](/guide/querying/) | The query editor, autocomplete, the results grid, transactions, and the command palette. |
| [Exploring your schema](/guide/exploring-schema/) | The schema browser, ER diagrams, table previews, the inspector, and charts. |
| [Importing & exporting data](/guide/import-export/) | Moving data in and out as CSV, JSON, SQL, and JSON-Lines. |
| [The AI assistant](/guide/ai-assistant/) | Using OpenAI, Anthropic, or Ollama, tool-call approvals, and the built-in MCP server. |
| [Managing plugins](/guide/managing-plugins/) | What plugins are, how to enable/disable and install/uninstall them, and staying safe. |
| [Keeping Verql updated](/guide/updating/) | Update channels and how Homebrew upgrades work. |
| [Troubleshooting](/guide/troubleshooting/) | Common problems and how to report a bug. |

## A quick tour

When Verql opens you'll see a three-panel workspace: a sidebar for your
connections and schema, a central tabbed area for editors and table views, and
context panels for details, charts, and the AI assistant.

A typical first session looks like:

1. [Install Verql](/guide/installation/) for your platform.
2. [Create a connection](/guide/connecting/) to your database.
3. [Browse the schema](/guide/exploring-schema/) to see what's there.
4. [Open a query tab and run some SQL](/guide/querying/).
5. [Export the results](/guide/import-export/) — or ask the [AI assistant](/guide/ai-assistant/) for help.

## Getting help

- Browse the rest of this guide using the table above.
- Hit a problem? Start with [Troubleshooting](/guide/troubleshooting/).
- Found a bug or have a feature request? Open an issue at
  [github.com/arshad-shah/verql/issues](https://github.com/arshad-shah/verql/issues).
