import { useEffect } from 'react'

/**
 * Fire `onEscape` when the Escape key is pressed while `enabled`. The one home
 * for the dismiss-on-Escape pattern that popovers, dialogs, and dropdowns each
 * hand-rolled with their own `keydown` listener. Pairs with `useClickOutside`
 * for surfaces that dismiss on both. Default `enabled` is true.
 */
export function useEscapeKey(onEscape: () => void, enabled = true): void {
  useEffect(() => {
    if (!enabled) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onEscape()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onEscape, enabled])
}
