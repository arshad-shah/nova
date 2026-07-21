# Importing & exporting data

Verql can move data in and out of your databases in several common formats.
These formats are **plugin contributions** — they're added by bundled plugins
rather than baked into the core — which is why the available formats can grow as
you add plugins.

[← Back to the User Guide](./README.md)

## Supported formats

| Format | Export | Import | Notes |
|--------|:------:|:------:|-------|
| **CSV** | ✔ | ✔ | Comma-separated values, for spreadsheets and tooling. |
| **JSON** | ✔ | | Structured data. (MongoDB and Redis contribute their own JSON export variants; there is no generic JSON importer.) |
| **SQL** | ✔ | ✔ | `INSERT` statements (and DDL where applicable) using dialect-aware identifier quoting. Contributed per relational driver (PostgreSQL, MySQL, SQLite, Snowflake). |
| **JSON-Lines** | ✔ | | One JSON object per line — MongoDB's export format for document data. |

> The exact set of formats offered depends on the active connection and which
> plugins are enabled. Relational databases get SQL export/import; document and
> key-value stores get the formats that fit them.

## Exporting data

1. Hover a table in the schema browser and click its **Export** action — this
   offers every format your driver contributes (CSV, JSON, SQL, JSON-Lines,
   ...) and exports the table's full contents. For a quick export of just a
   query's result set, use the CSV / JSON buttons in the query results
   toolbar instead.
2. Pick the format.
3. Save the file.

Because SQL export uses the active driver's own identifier-quoting rules, the
output is valid for that database's dialect.

## Importing data

1. Click the **Import** action at the top of the schema browser.
2. Choose the format and, for a data format like CSV, the target table to
   load into.
3. Confirm — Verql then asks you to pick the source file and runs the import.

When importing CSV into a table, Verql adapts to the active driver's quoting and
placeholder style, so the same import path works across relational databases. If
some rows can't be written, those per-row failures are reported back to you
rather than silently dropped — so a partial import is never mistaken for a
complete one.

---

Next: [The AI assistant →](./ai-assistant.md)
