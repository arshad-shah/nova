---
"verql": patch
---

Route all renderer backend access through a single platform client. Renderer
code now reaches the main process via `import { ipc } from '@/platform/client'`
(`ipc.invoke` / `ipc.on` / `ipc.optional` / `ipc.available()` / `ipc.platform()`)
instead of touching `window.electronAPI` directly, giving one chokepoint where
cross-cutting concerns (error normalization, activity logging, retry,
cancellation, instrumentation) can be added once rather than per call site.
`useIpcQuery` is built on top of the same client. Behaviour is unchanged; an
architecture guard (`renderer-backend-access-through-platform`) now fails the
build if the bridge is referenced anywhere outside the platform layer.
