---
"verql": patch
---

MCP server: fix multi-byte UTF-8 corruption and cap the request body size. The
`POST /messages` handler now buffers request chunks and decodes them once, so a
non-ASCII character split across a TCP chunk boundary is no longer mangled into
replacement characters. The body is also bounded to 1 MiB (tracked by byte
length); an oversized request is answered with `413` and its connection is torn
down instead of accumulating unbounded memory in the main process.
