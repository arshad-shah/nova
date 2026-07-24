import { useCallback, useEffect, useRef } from 'react'

/**
 * Returns a stable `() => boolean` that reports whether the component is still
 * mounted. Check it before committing an awaited result to state from a
 * callback that outlives a single effect run — a poller's `setInterval`, an
 * `ipc.on` event handler, or a shared loader also wired to a button — where the
 * effect-scoped `cancelled` flag of {@link useAsyncEffect} can't reach.
 *
 * ```ts
 * const isMounted = useIsMounted()
 * const refresh = useCallback(async () => {
 *   const status = await ipc.invoke(...)
 *   if (isMounted()) setStatus(status)
 * }, [isMounted])
 * ```
 *
 * For a plain fetch-on-dependency effect prefer {@link useAsyncEffect}, which
 * also drops responses when the dependencies change, not only on unmount.
 */
export function useIsMounted(): () => boolean {
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  return useCallback(() => mounted.current, [])
}
