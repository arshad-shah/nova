---
"verql": patch
---

Type the main → renderer broadcast event seam end-to-end. Listener registration
(`window.electronAPI.on`) is now generic over `keyof IpcEventMap`, so the event
constant constrains the callback payload — a wrong-arity or wrong-typed listener
is a compile error instead of a silent runtime mismatch. The per-window emit
path gains a typed `sendTo(webContents, event, …)` helper (sibling to
`broadcast`), and the three remaining raw `webContents.send` call sites route
through it. This also corrects the `AI_CHAT_EVENT` payload contract, which
declared a single `[event]` argument while both emitter and listener have always
used two (`[streamId, event]`); the wire behaviour is unchanged. A new guard
test (`ipc-event-seam-typed`) keeps `IpcEventShapes` and `IPC_EVENTS` in
bijection and fails if the listener seam ever reverts to a bare `string` key.
