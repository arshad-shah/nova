import { useCallback, useRef, useState } from 'react'

/**
 * Coordination for a menubar: which top-level menu is open, and moving between
 * them.
 *
 * This is deliberately NOT in the menu primitive. A menubar is the only surface
 * where opening one menu closes a sibling, where hovering a sibling while any
 * menu is open switches to it, and where ←/→ move between menus rather than
 * between submenu levels. Everything else — the surface, the rows, ↑/↓/Home/End,
 * typeahead, focus return — is the shared core.
 */
export type Menubar = {
  openIndex: number | null
  isOpen: (index: number) => boolean
  /** True while any menu is open: hovering a sibling should then switch to it. */
  anyOpen: boolean
  registerTrigger: (index: number) => (el: HTMLButtonElement | null) => void
  toggle: (index: number) => void
  /** Hovering a trigger switches menus only when one is already open. */
  hover: (index: number) => void
  close: (opts?: { refocus?: number }) => void
  /** Move to an adjacent menu, wrapping at both ends. */
  moveSibling: (from: number, dir: -1 | 1) => void
}

export function useMenubar(count: number): Menubar {
  const [openIndex, setOpenIndex] = useState<number | null>(null)
  const triggerRefs = useRef<(HTMLButtonElement | null)[]>([])

  const focusTrigger = useCallback((i: number) => triggerRefs.current[i]?.focus(), [])

  const registerTrigger = useCallback(
    (index: number) => (el: HTMLButtonElement | null) => {
      triggerRefs.current[index] = el
    },
    []
  )

  const toggle = useCallback((index: number) => {
    setOpenIndex((cur) => (cur === index ? null : index))
  }, [])

  const hover = useCallback((index: number) => {
    // Only switch if a menu is already open — hovering the bar at rest must not
    // open anything.
    setOpenIndex((cur) => (cur === null ? cur : index))
  }, [])

  const close = useCallback(
    (opts?: { refocus?: number }) => {
      setOpenIndex(null)
      if (opts?.refocus != null) focusTrigger(opts.refocus)
    },
    [focusTrigger]
  )

  const moveSibling = useCallback(
    (from: number, dir: -1 | 1) => {
      if (count === 0) return
      const next = (from + dir + count) % count
      setOpenIndex(next)
      focusTrigger(next)
    },
    [count, focusTrigger]
  )

  return {
    openIndex,
    isOpen: (index) => openIndex === index,
    anyOpen: openIndex !== null,
    registerTrigger,
    toggle,
    hover,
    close,
    moveSibling,
  }
}
