---
"verql": patch
---

Docs: audit every page against the source and fix what had drifted.

Every document in `docs/` and its `site/` counterpart was checked one at a time,
claim by claim, against the actual code — roughly 650 factual claims verified,
64 corrections. Each page was then re-checked by a second pass whose job was to
assume the first had been lazy, and to read the diff for errors the audit itself
introduced.

The user guide had drifted furthest, and in the way that matters most: it still
told Windows users to download and run an unsigned `.exe`, and to verify it.
That installer does not exist — Verql ships on Windows through the Microsoft
Store, which updates and signs itself. The Linux Homebrew formula was missing
from the update instructions entirely.

`docs/plugin-audit.md` is pure status ("fully wired" / "partly wired" / "not
wired") and so rots fastest; every marker was re-derived from source, and 12 were
wrong.

The menu and design-system sections were deliberately left alone — they are being
rewritten in #146 and are documented there.
