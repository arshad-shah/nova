---
"verql": patch
---

The theme and AI stores no longer throw when a plugin/IPC contribution list
resolves to a non-array (previously `themes:list` or the AI provider/model lists
resolving `undefined` surfaced as a `TypeError`); they now degrade to an empty
list. Alongside this, the test suite is green again (7 failures fixed) and
coverage is collected from both the unit and Storybook browser projects and
merged into one gated report.
