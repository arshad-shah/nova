import type { IpcChannelMap, IpcEventMap } from '@shared/ipc'

/**
 * The **one** renderer chokepoint for backend (main-process) access.
 *
 * Historically ~89 renderer files reached for `window.electronAPI.invoke`
 * directly, so there was nowhere to add cross-cutting behaviour (error
 * normalization, logging, retry, cancellation, instrumentation) without editing
 * every call site, and the sanctioned `useIpcQuery` hook competed with the raw
 * idiom for the same operation. This module owns all access to the preload
 * bridge; everything else in `src/renderer/src` goes through it. The invariant
 * is executable — see `tests/unit/audit/renderer-backend-access-through-platform.test.ts`
 * (introduced with #165), which fails if `window.electronAPI` is touched
 * anywhere outside this `platform/` directory.
 *
 * Type inference is preserved exactly: `invoke`/`on` are generic over the same
 * `IpcChannelMap`/`IpcEventMap` keys the bridge uses, so per-channel argument
 * and return types flow through unchanged — no widening to `any`.
 */

/** The shape exposed by the preload bridge (`window.electronAPI`). Derived from
 *  the global `Window` augmentation so this stays in lockstep with preload
 *  without a cross-process import. */
type Bridge = typeof window.electronAPI

/**
 * Read the preload bridge lazily on *every* access. Reading it once at module
 * load would capture `undefined` under Storybook / unit tests, whose stubs
 * assign `window.electronAPI` after this module is imported (ES import
 * evaluation runs before a story body). Lazy reads honour those stubs.
 */
function bridge(): Bridge | undefined {
  if (typeof window === 'undefined') return undefined
  return (window as { electronAPI?: Bridge }).electronAPI
}

/** Normalize any thrown/rejected value into an `Error`, so every caller can
 *  rely on `catch (e: Error)`. IPC rejections already arrive as `Error`s and
 *  pass through untouched; only non-`Error` reasons are wrapped. */
function normalizeError(reason: unknown): Error {
  if (reason instanceof Error) return reason
  return new Error(typeof reason === 'string' ? reason : String(reason))
}

/** True when the backend bridge is present (i.e. running inside Electron, or a
 *  test/story that stubbed it). Replaces ad-hoc `!!window.electronAPI` and
 *  `typeof window !== 'undefined' && window.electronAPI` presence checks. */
export function isBackendAvailable(): boolean {
  return bridge() !== undefined
}

/**
 * Invoke a typed IPC channel. Rejects with a normalized `Error` when the
 * backend is unavailable, so `await`ing callers hit their `catch` rather than a
 * synchronous `TypeError`. This is the sanctioned replacement for
 * `window.electronAPI.invoke(...)`.
 */
export async function invoke<K extends keyof IpcChannelMap>(
  channel: K,
  ...args: IpcChannelMap[K]['args']
): Promise<IpcChannelMap[K]['return']> {
  const api = bridge()
  if (!api) {
    throw new Error(
      `Backend unavailable: cannot invoke "${String(channel)}" outside Electron.`,
    )
  }
  try {
    return await api.invoke(channel, ...args)
  } catch (reason) {
    throw normalizeError(reason)
  }
}

/**
 * Fire-and-forget invoke that **no-ops** when the backend is unavailable,
 * returning `undefined` instead of a rejected promise. The exact seam for the
 * former `window.electronAPI?.invoke(...)` idiom (fire-and-forget writes,
 * best-effort diagnostics) that must not throw outside Electron: it returns the
 * bridge's raw promise untouched, so callers that `void` the result get the same
 * behaviour they had before — no added rejection hop. Callers that DO care about
 * failures should `await ipc.invoke(...)` (which normalizes) instead.
 */
export function invokeOptional<K extends keyof IpcChannelMap>(
  channel: K,
  ...args: IpcChannelMap[K]['args']
): Promise<IpcChannelMap[K]['return']> | undefined {
  const api = bridge()
  if (!api) return undefined
  return api.invoke(channel, ...args)
}

/**
 * Subscribe to a typed main→renderer broadcast event; returns an unsubscribe
 * function. When the backend is unavailable the subscription is a no-op and the
 * returned unsubscribe is safe to call. Replaces `window.electronAPI.on(...)`.
 */
export function on<E extends keyof IpcEventMap>(
  event: E,
  callback: (...args: IpcEventMap[E]) => void,
): () => void {
  const api = bridge()
  if (!api) return () => {}
  return api.on(event, callback)
}

/** Host platform (e.g. `'darwin'`), or `'web'` outside Electron. The seam for
 *  `window.electronAPI?.platform`. */
export function hostPlatform(): NodeJS.Platform | 'web' {
  return bridge()?.platform ?? 'web'
}

/**
 * Namespaced aggregate — the ergonomic import for call sites:
 * `import { ipc } from '@/platform/client'` then `ipc.invoke(...)`,
 * `ipc.on(...)`, `ipc.optional(...)`, `ipc.available()`, `ipc.platform()`.
 */
export const ipc = {
  available: isBackendAvailable,
  invoke,
  optional: invokeOptional,
  on,
  platform: hostPlatform,
} as const
