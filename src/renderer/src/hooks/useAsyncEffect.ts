import { useEffect, type DependencyList } from 'react'

/**
 * Run an async function as an effect, guarded against stale resolution.
 *
 * The one home for the `let cancelled = false` / cleanup dance that every async
 * effect hand-rolled (fetch on a dependency, then commit the result to state).
 * Without the guard, a response for the previous dependencies can land after
 * they've changed and overwrite fresher state — switch connections quickly and
 * connection A's schema list populates connection B's selector.
 *
 * `effect` receives an `isCancelled()` probe: check it before committing any
 * awaited result to state, and bail if it returns `true`. The effect is marked
 * cancelled when the dependencies change or the component unmounts.
 *
 * ```ts
 * useAsyncEffect(async (isCancelled) => {
 *   const result = await fetchThing(id)
 *   if (!isCancelled()) setThing(result)
 * }, [id])
 * ```
 *
 * This ignores stale responses rather than aborting them at the transport
 * layer — the platform client cannot carry an `AbortSignal` today (follow-up).
 * Any synchronous prologue (early-return resets like `setThing([])`) runs
 * during the effect and needs no guard; only post-`await` commits do.
 *
 * A rejecting effect is swallowed rather than left as an unhandled rejection —
 * the guard is a backstop; effects that care about failures handle them inline.
 */
export function useAsyncEffect(
  effect: (isCancelled: () => boolean) => void | Promise<void>,
  deps: DependencyList,
): void {
  useEffect(() => {
    let cancelled = false
    Promise.resolve(effect(() => cancelled)).catch(() => {})
    return () => {
      cancelled = true
    }
  }, deps)
}
