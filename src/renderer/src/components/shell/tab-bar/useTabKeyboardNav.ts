import { useCallback, useState, type KeyboardEvent } from 'react'
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

  // The roving tab stop: whatever the user last focused, else the active tab.
  // Falling back to active is what makes one Tab keypress land somewhere sane.
  const rovingId = focusedId ?? activeTabId

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
      document.querySelector<HTMLElement>(`[data-tab-id="${id}"]`)?.focus()
      return
    }

    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()   // Space would otherwise scroll the strip
      onActivate(tabs[current].id)
      return
    }

    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault()
      onClose(tabs[current].id)
    }
  }, [tabs, rovingId, onActivate, onClose, scrollIntoView])

  const tabIndexFor = useCallback(
    (id: string): 0 | -1 => (id === rovingId ? 0 : -1),
    [rovingId],
  )

  const onTabFocus = useCallback((id: string) => setFocusedId(id), [])

  return { onKeyDown, tabIndexFor, onTabFocus }
}
