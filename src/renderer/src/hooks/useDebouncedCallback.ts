import { useCallback, useEffect, useRef } from 'react'

/**
 * Returns a debounced wrapper around `callback` that delays invocation until
 * `delay` ms after the last call. The one home for the `useRef` timer +
 * `clearTimeout`/`setTimeout` dance that filter inputs and typeahead each
 * hand-rolled. The pending timer is cleared on unmount. The latest `callback`
 * is always used, so callers don't need to memoize it.
 */
export function useDebouncedCallback<A extends unknown[]>(
  callback: (...args: A) => void,
  delay: number,
): (...args: A) => void {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const latest = useRef(callback)
  latest.current = callback

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    [],
  )

  return useCallback(
    (...args: A) => {
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => latest.current(...args), delay)
    },
    [delay],
  )
}
