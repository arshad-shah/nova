---
"verql": patch
---

Driver capability declarations and adapter implementations can no longer
silently disagree. A driver advertises features as serializable data on its
factory (`session`, `explain`) that the renderer gates on, and implements the
matching optional methods on its adapter that the glue calls — but nothing
linked the two, so a driver could declare a transaction capability it never
implemented (a toolbar button that crashed on use) or implement one it never
declared (a feature that silently never appeared). The adapter factory now
validates, in both directions, that each declaration maps to its adapter
methods when it builds an adapter — the single point every connection passes
through: a mismatch is an actionable error naming the capability, the offending
method, and the fix, so the connect fails clearly instead of crashing later
when the declared feature is used.
