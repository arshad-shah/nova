---
"verql": patch
---

Guard renderer async effects against stale resolution so a response for a
previous connection, plugin, or table can no longer land late and overwrite
fresher state. Switching connections quickly in the query toolbar could let
connection A's database/schema list populate connection B's selector (and
auto-select a database that doesn't exist on B); the schema and plugin/table
browse surfaces had the same class of race, and several pollers/lifecycle
refreshers could `setState` after their pane had closed.

Two small dependency-free hooks now state the pattern once: `useAsyncEffect`
(cancels a fetch-on-dependency effect when its dependencies change or the
component unmounts) and `useIsMounted` (an unmount probe for stable pollers and
event-driven refreshers whose async lives outside a single effect run). Every
previously unguarded async effect across the renderer adopts one of them.
