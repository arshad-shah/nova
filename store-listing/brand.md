# Brand — shared source of truth

Canonical brand identity and copy for Verql. **Edit messaging here first**, then
adapt it into each store's listing file. Keep this consistent with the in-app
`<VerqlMark>` and the docs site.

## Identity

| Field | Value |
|-------|-------|
| Name | **Verql** |
| Pronunciation | "verkle" (rhymes with "circle") |
| Publisher / author | Arshad Shah |
| Bundle id (app) | `com.electron.verql` |
| MSIX identity | `Arshadshah.verql` · `CN=2ABEC305-C7D9-4693-92FC-165FCE8EEA94` |
| License | MIT (free, open source) |
| Copyright | `Copyright © 2026 Arshad Shah` |
| Category | Developer tools |

## Voice

Confident, precise, developer-to-developer. No hype, no emoji. Say what the user
can *do*, not which file changed. Stay database-agnostic — Verql is not only SQL
(Mongo, Redis), so prefer "databases / data / objects" over "tables / rows" when
speaking generally.

## Taglines

- **Primary:** Fast, extensible desktop database client.
- **One-liner:** Explore, query, and visualize every database from one workspace.
- **Short:** One client for all your databases.

## Short description (~250 chars)

> Verql is a fast, modern desktop database client for developers. Connect to
> PostgreSQL, MySQL, and SQLite out of the box — plus MongoDB, Redis, and
> Snowflake through bundled plugins — then explore, query, and visualize your
> data from one clean, keyboard-friendly workspace.

## Long description

> Verql is a fast, modern, cross-platform database client built for developers
> who live in their data.
>
> Connect in seconds and work across very different databases from a single,
> consistent workspace — PostgreSQL, MySQL, and SQLite are supported natively,
> and MongoDB, Redis, and Snowflake come bundled as plugins. Verql adapts its
> language to each one, so document and key/value stores feel native instead of
> being forced into SQL wording.
>
> Write queries faster with a focused editor (powered by Monaco) that offers
> driver-aware autocomplete and multi-tab editing, and read results in a fast,
> sortable grid that stays smooth on large datasets. Explore without writing
> queries: browse tables, collections, and keys with one click, view interactive
> entity-relationship diagrams, and chart your results.
>
> A built-in AI assistant — backed by OpenAI, Anthropic, or a fully local Ollama
> model — helps you write and understand queries on your own terms. And because
> Verql is built around a plugin system with a published SDK, you can extend it
> with your own drivers, exporters, formatters, themes, and tools.
>
> Connection secrets are stored in your operating system's secure credential
> store, not in plain text. Verql is free and open source under the MIT license.

## Feature bullets (≤200 chars each; trim per store)

- Native PostgreSQL, MySQL, and SQLite support
- MongoDB, Redis, and Snowflake via bundled plugins
- Driver-aware query editor with smart autocomplete
- Fast, sortable results grid for large datasets
- One-click data browsing for non-SQL stores
- Interactive entity-relationship (ER) diagrams
- Built-in charts to visualize query results
- AI assistant — OpenAI, Anthropic, or local Ollama
- Extensible plugin system with a published SDK
- Secure credential storage via the OS keyring
- Dark, light, and midnight themes
- Command palette and app-designed window
- Free and open source (MIT)

## Keywords / search terms (pick per store's max)

`database client`, `SQL editor`, `PostgreSQL`, `MySQL`, `SQLite`, `MongoDB`,
`Redis`, `Snowflake`, `database GUI`, `query tool`

## Colours

| Token | Value | Use |
|-------|-------|-----|
| Brand background | `#0B1220` | App/installer background, MSIX `backgroundColor` (deep end of the icon tile's navy gradient, `#182238 → #0B1220`) |
| Ribbon violet | `#7C42FB → #4157E9` | Left stroke of the ribbon-V mark |
| Ribbon cyan | `#41C0FF → #25A2F8` | Right stroke of the ribbon-V mark |
| Fold blue | `#4E79FD` (crease `#3D4CE1`) | Page-curl fold at the mark's tip; usable as a brand accent |
| Site theme colour | `#0e121b` | Web meta `theme-color` |

## Asset sources

Mark/logo source of truth is `build/icon.svg`; rasterise with `pnpm build:icons`.
See [`assets.md`](./assets.md) for the exact sizes each store needs.

## URLs

- Website: <https://verql.arshadshah.com>
- Docs / user guide: <https://verql.arshadshah.com/guide/>
- Privacy: <https://verql.arshadshah.com/privacy>
- Terms: <https://verql.arshadshah.com/terms>
- Support / issues: <https://github.com/arshad-shah/verql/issues>
- Source: <https://github.com/arshad-shah/verql>
