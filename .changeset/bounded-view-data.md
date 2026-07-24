---
"verql": minor
---

Bound the "View data" table browse so a huge table no longer loads whole into
memory (#213). The relational reader (`createRelationalGetTableData`) now fetches
a page at a time using a driver-aware paging clause — a new `pagination` driver
capability (`limit-offset` or `offset-fetch`) instead of a hardcoded `LIMIT`.
The page size is a new General setting, **Max Rows to View** (`maxViewDataRows`,
default 500); when a table has more rows the grid header shows "Showing first N
rows" and a **Load more** button that pages in the next batch. Export is
unchanged — it deliberately stays an unbounded read (streaming export is tracked
separately).
