---
"verql": patch
---

Security: `isWriteQuery` now strips SQL comments with a string-aware scan
instead of two literal-blind regexes. A comment marker (`/*`, `--`, `$$`)
inside a quoted string is treated as data rather than opening a phantom
comment, so a write hidden after such a marker — e.g.
`SELECT '/*' AS a; DELETE FROM users; SELECT '*/' AS b` — is no longer
mis-classified as a read and can no longer slip past the write-approval gate
on the MCP server or the AI assistant. Input the scanner cannot confidently
tokenise (unterminated quote, unbalanced block comment) is treated as a write
(fail closed).
