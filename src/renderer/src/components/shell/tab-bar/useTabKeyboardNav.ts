import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react'
import type { Tab } from '@shared/types'

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
 */
export function resolveRovingId(
  focusedId: string | null,
  activeTabId: string | null,
  tabs: Tab[],
): string | null {
  return focusedId && tabs.some(t => t.id === focusedId) ? focusedId : activeTabId
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
  // close goes through, and the effect below watches `tabs` for the closing
  // tab to actually disappear before moving real DOM focus.
  const pendingCloseRef = useRef<{ closingId: string; neighborId: string | null } | null>(null)

  useEffect(() => {
    const pending = pendingCloseRef.current
    if (!pending) return
    if (tabs.some(t => t.id === pending.closingId)) return // not closed yet (or the dialog was cancelled)

    pendingCloseRef.current = null
    const targetId = pending.neighborId && tabs.some(t => t.id === pending.neighborId)
      ? pending.neighborId
      : activeTabId
    if (!targetId) return
    setFocusedId(targetId)
    scrollIntoView(targetId)
    document.querySelector<HTMLElement>(`[data-tab-id="${targetId}"]`)?.focus({ preventScroll: true })
  }, [tabs, activeTabId, scrollIntoView])

  const onKeyDown = useCallback((e: KeyboardEvent) => {
    const current = tabs.findIndex(t => t.id === rovingId)
    if (current === -1) return

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
