---
"verql": patch
"@verql/plugin-sdk": patch
---

Unify the two divergent SQL statement splitters into one shared walk (#199). The
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
