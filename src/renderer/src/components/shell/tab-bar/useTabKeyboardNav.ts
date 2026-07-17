import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react'
import type { Tab } from '@shared/types'
import { usePendingClose } from '@/stores/tab-actions'

/**
 * Which tab index a navigation key moves focus to. Pure and exported so the
 * arrow/Home/End contract is testable without a DOM.
 *
 * Returns null when the key isn't a navigation key (the caller handles
 * activation and close separately) or when there are no tabs.
 *
 * Deliberately does not wrap: a tab strip is a finite list, and wrapping from
 * the last tab to the first reads as a jump rather than a step.
 */
export function nextFocusIndex(current: number, key: string, count: number): number | null {
  if (count === 0) return null
  switch (key) {
    case 'ArrowRight': return Math.min(current + 1, count - 1)
    case 'ArrowLeft':  return Math.max(current - 1, 0)
    case 'Home':       return 0
    case 'End':        return count - 1
    default:           return null
  }
}

/**
 * Which tab id the roving tab stop should point at. Pure and exported so the
 * reconciliation is testable without a DOM.
 *
 * `focusedId` is whatever the user last focused, but a tab can disappear out
 * from under it (Delete, the X button, or the context menu). If we kept
 * pointing at a closed tab's id, `tabIndexFor` would return -1 for every tab
 * in the strip — zero tab stops, unreachable by Tab, and it never self-heals
 * without a mouse click. Falling back to the active tab whenever the focused
 * id no longer exists in `tabs` guarantees exactly one tab is always tabbable.
 *
 * The `activeTabId` fallback is itself checked against `tabs` rather than
 * trusted blindly: "tabs exist implies one is active" is an invariant held
 * elsewhere (the tabs store), not something this function can assume without
 * becoming contingent on it. When `tabs` is non-empty this always returns a
 * live id — never null — so the one-tab-stop invariant is total, not
 * dependent on the active-tab invariant holding.
 */
export function resolveRovingId(
  focusedId: string | null,
  activeTabId: string | null,
  tabs: Tab[],
): string | null {
  if (focusedId && tabs.some(t => t.id === focusedId)) return focusedId
  if (activeTabId && tabs.some(t => t.id === activeTabId)) return activeTabId
  return tabs[0]?.id ?? null
}

/**
 * A keyboard-initiated close is "pending" from the moment Delete/Backspace is
 * pressed until we know, unambiguously, how it ended:
 *
 *   - 'closed'    the tab is gone from `tabs` — the close went through (with
 *                 or without a confirm dialog in between). Focus should move
 *                 to the recorded neighbor.
 *   - 'cancelled' the tab is still in `tabs` AND it's no longer awaiting a
 *                 confirm answer (`dirtyBatch`/`txnQueue`) — the user backed
 *                 out of the dialog. Nothing to restore; the pending close is
 *                 done and must not fire later for an unrelated close of the
 *                 same tab (mouse X, context menu, Cmd+W).
 *   - 'pending'   still in `tabs` and still awaiting confirmation — leave it
 *                 armed.
 *
 * Pure and exported for the same reason as `resolveRovingId`: this is the
 * bit of logic that bounds `pendingCloseRef`'s lifetime, and it's testable
 * without a DOM or a dialog.
 */
export type PendingCloseResolution = 'closed' | 'cancelled' | 'pending'

export function resolvePendingClose(
  pending: { closingId: string; neighborId: string | null } | null,
  tabs: Tab[],
  dirtyBatch: string[],
  txnQueue: string[],
): PendingCloseResolution | null {
  if (!pending) return null
  if (!tabs.some(t => t.id === pending.closingId)) return 'closed'
  const awaitingConfirm = dirtyBatch.includes(pending.closingId) || txnQueue.includes(pending.closingId)
  return awaitingConfirm ? 'pending' : 'cancelled'
}

interface Options {
  tabs: Tab[]
  activeTabId: string | null
  onActivate: (id: string) => void
  onClose: (id: string) => void
  scrollIntoView: (id: string) => void
}

/**
 * Roving-tabindex keyboard navigation for the tab strip.
 *
 * Manual activation (APG tablist pattern): arrows move focus, Enter/Space
 * activates. Auto-activation would mount a real editor and open a DB session
 * on every arrow keypress, so focus and selection are deliberately separate.
 *
 * One Tab keypress enters the strip and lands on the active tab; another
 * leaves it — the strip is one tab stop, not N.
 */
export function useTabKeyboardNav({ tabs, activeTabId, onActivate, onClose, scrollIntoView }: Options) {
  const [focusedId, setFocusedId] = useState<string | null>(null)

  // See resolveRovingId: reconciles focusedId against the live tabs list so a
  // closed tab can never strand the strip with zero tab stops.
  const rovingId = resolveRovingId(focusedId, activeTabId, tabs)

  // Tracks a keyboard-initiated close that's in flight. `onClose` routes
  // through requestCloseTab, which may pop a confirm dialog and not actually
  // close the tab synchronously (or at all) — so we can't move focus right
  // after calling it. Instead we record where focus should land *if* the
  // close goes through, and the effect below watches `tabs` (plus the confirm
  // dialog's own pending state) for the interaction to resolve before moving
  // real DOM focus.
  //
  // Bounded lifetime: `resolvePendingClose` (see above) is what keeps this
  // sound. A ref that's armed by Delete but fires close-source-agnostically
  // would, on Cancel, stay armed forever and later steal focus from wherever
  // the user is typing when the *same* tab finally closes by some unrelated
  // path (mouse X, context menu, Cmd+W). Watching `dirtyBatch`/`txnQueue`
  // lets us tell "cancelled" apart from "still awaiting an answer" without
  // guessing from DOM focus, which the confirm dialog also moves around on
  // its own (native <dialog> auto-restores focus on close).
  const pendingCloseRef = useRef<{ closingId: string; neighborId: string | null } | null>(null)
  const dirtyBatch = usePendingClose(s => s.dirtyBatch)
  const txnQueue = usePendingClose(s => s.txnQueue)

  useEffect(() => {
    const resolution = resolvePendingClose(pendingCloseRef.current, tabs, dirtyBatch, txnQueue)
    if (resolution === null || resolution === 'pending') return

    const pending = pendingCloseRef.current
    pendingCloseRef.current = null
    if (resolution === 'cancelled' || !pending) return // nothing to restore; the tab is still open

    const targetId = pending.neighborId && tabs.some(t => t.id === pending.neighborId)
      ? pending.neighborId
      : (activeTabId && tabs.some(t => t.id === activeTabId) ? activeTabId : null)
    if (!targetId) return
    setFocusedId(targetId)
    scrollIntoView(targetId)
    document.querySelector<HTMLElement>(`[data-tab-id="${targetId}"]`)?.focus({ preventScroll: true })
  }, [tabs, dirtyBatch, txnQueue, activeTabId, scrollIntoView])

  const onKeyDown = useCallback((e: KeyboardEvent) => {
    // The close button sits inside the trough with tabIndex={-1} (out of the
    // Tab sequence) but a mouse click can still focus it directly. Without
    // this check, Enter on a focused close button both fires the button's
    // own click (closing that button's tab) AND bubbles up here to activate
    // whatever tab currently owns the roving tab stop — possibly a different
    // tab. Bail out and let the button handle its own keydown.
    if ((e.target as HTMLElement).closest?.('[data-tab-close-button]')) return

    const current = tabs.findIndex(t => t.id === rovingId)
    if (current === -1) return

    // Any navigation-relevant key other than the close key ends the previous
    // keyboard-close interaction, if one was still pending: the user has
    // moved on within the strip. This is a cheap extra bound on top of
    // `resolvePendingClose` — belt and braces, not load-bearing on its own.
    if (e.key !== 'Delete' && e.key !== 'Backspace') {
      pendingCloseRef.current = null
    }

    const next = nextFocusIndex(current, e.key, tabs.length)
    if (next !== null) {
      e.preventDefault()
      const id = tabs[next].id
      setFocusedId(id)
      scrollIntoView(id)
      // Move real DOM focus so the focus ring and screen readers follow.
      // preventScroll: scrollIntoView above already animates the trough;
      // focus()'s own implicit scroll is instant and would fight it.
      document.querySelector<HTMLElement>(`[data-tab-id="${id}"]`)?.focus({ preventScroll: true })
      return
    }

    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()   // Space would otherwise scroll the strip
      onActivate(tabs[current].id)
      return
    }

    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault()
      const closingId = tabs[current].id
      // Prefer the next tab (it slides into this index once the closed tab
      // is gone); fall back to the previous one when closing the last tab.
      const neighborId = tabs[current + 1]?.id ?? tabs[current - 1]?.id ?? null
      pendingCloseRef.current = { closingId, neighborId }
      onClose(closingId)
    }
  }, [tabs, rovingId, onActivate, onClose, scrollIntoView])

  const tabIndexFor = useCallback(
    (id: string): 0 | -1 => (id === rovingId ? 0 : -1),
    [rovingId],
  )

  const onTabFocus = useCallback((id: string) => setFocusedId(id), [])

  return { onKeyDown, tabIndexFor, onTabFocus }
}
