---
title: Running queries
description: The editor, autocomplete, the results grid, transactions, and the command palette.
sidebar:
  order: 3
---

Once you're [connected](/guide/connecting/), you write and run queries in a query
tab. This page covers the editor, the results grid, transactions, and the
command palette.

[← Back to the User Guide](/guide/)

## The editor

Verql's editor is powered by **Monaco** (the same engine behind VS Code), so it
feels familiar: syntax highlighting, multiple cursors, find-and-replace, and so
on. The language adapts to your connection — SQL for relational databases, and
the appropriate language for non-SQL drivers (JSON for MongoDB, plain text for
Redis, and so on).

### Autocomplete

As you type, the editor suggests:

- Keywords and commands for your connection — SQL keywords for relational
  databases, operation names for MongoDB, commands for Redis
- Object and field names pulled from the live schema of your connection
  (tables and columns, or their driver-specific equivalents)

This means completions reflect *your* database, not a generic word list. If
suggestions look stale, reconnecting refreshes the schema cache.

## Opening a query tab and running a query

- Open a new query tab with **Cmd/Ctrl+T** (the default New Tab shortcut —
  rebindable in Settings).
- Write your query, then run it. The results appear in the grid below the editor.

You can keep several query tabs open at once, each against the same or different
connections.

## The results grid

Query results are shown in an **AG Grid** table. From there you can:

- Scroll, sort, and resize columns
- Select rows and cells
- Feed results into the [chart panel](/guide/exploring-schema/#chart-panel) or
  [export them](/guide/import-export/)

Selecting a row also updates the [inspector](/guide/exploring-schema/#the-inspector-panel),
which shows that row's values in a readable layout.

## Transactions

For **PostgreSQL** and **SQLite** connections, each query tab can run inside a
transaction instead of auto-committing every statement. A transaction toolbar
gives you:

| Control | What it does |
|---------|--------------|
| **Auto-commit toggle** | Turn auto-commit off to start running statements inside a transaction. |
| **Commit** | Make the transaction's changes permanent. |
| **Rollback** | Discard everything since the transaction began. |
| **Isolation level** | Choose the transaction's isolation level. |
| **Read-only** | Run the transaction in read-only mode for safe exploration. |

A connection can also default to manual-commit via a per-connection
**Auto-commit by default** setting. If you try to close a tab while a transaction
is still open, Verql prompts you to commit or roll back first so you don't lose
track of pending changes.

> Transaction controls are available today for PostgreSQL and SQLite. Other
> drivers can light up the same toolbar as they add support.

## The command palette

Press **Cmd/Ctrl+Shift+P** to open the command palette. It surfaces editor
actions, app commands, and any commands added by plugins — a fast way to find a
feature without hunting through menus. Start typing to filter, then press Enter
to run.

---

Next: [Exploring your schema →](/guide/exploring-schema/)
