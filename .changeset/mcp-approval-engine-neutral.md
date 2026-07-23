---
"verql": patch
---

MCP tool-call approvals now describe non-SQL drivers in their own terms. The
approval prompt previously exposed a field named `sql` and, for any driver that
was not SQL (MongoDB, Redis, …), stuffed the tool's parameters into it as a JSON
blob highlighted as SQL — mislabeling what the user was being asked to grant. The
approval contract is now engine-neutral (an opaque `statement` plus the
`language` to highlight it in), so a Mongo or Redis command shows verbatim, in
its own syntax, and a guard test keeps the contract from drifting back to SQL.
