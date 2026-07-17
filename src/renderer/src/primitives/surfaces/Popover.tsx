import React, {
  Children, cloneElement, isValidElement, useCallback,
  useEffect, useLayoutEffect, useRef, useState,
} from 'react'
import { cn } from '../utils/cn'
import { useEscapeKey } from '@/hooks/useEscapeKey'
import { clamp } from '@/lib/math'

type Placement = 'top' | 'bottom' | 'left' | 'right'

type PopoverProps = {
  /** A single React element (typically a Button or icon) that opens the popover when clicked. Its onClick/ref are wrapped, not replaced. */
  trigger: React.ReactNode
  content: React.ReactNode
  className?: string
  /** Side the panel prefers to open on. Defaults to 'top'. */
  placement?: Placement
}

/**
 * Click-to-open popover. Clones the trigger element to attach the open/close
 * handler — the caller's element keeps its visual identity and existing
 * onClick chain. Panel renders inline (as a sibling) with `position: fixed`
 * so it escapes overflow constraints without leaving the React tree, which
 * keeps tests and Storybook queries simple.
 */
export function Popover({ trigger, content, className, placement = 'top' }: PopoverProps) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const triggerRef = useRef<HTMLElement | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  const setTriggerRef = useCallback((el: HTMLElement | null) => {
    triggerRef.current = el
  }, [])

  useLayoutEffect(() => {
    if (!open) return
    const reposition = () => {
      const t = triggerRef.current?.getBoundingClientRect()
      const p = panelRef.current?.getBoundingClientRect()
      if (!t) return
      const ph = p?.height ?? 0
      const pw = p?.width ?? 0
      const gap = 6
      let top: number
      let left: number
      switch (placement) {
        case 'bottom':
          top = t.bottom + gap
          left = t.left + t.width / 2 - pw / 2
          break
        case 'left':
          top = t.top + t.height / 2 - ph / 2
          left = t.left - pw - gap
          break
        case 'right':
          top = t.top + t.height / 2 - ph / 2
          left = t.right + gap
          break
        case 'top':
        default:
          top = t.top - ph - gap
          left = t.left + t.width / 2 - pw / 2
      }
      const margin = 8
      left = clamp(left, margin, window.innerWidth - pw - margin)
      top = clamp(top, margin, window.innerHeight - ph - margin)
      setPos({ top, left })
    }
    reposition()
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(reposition) : null
    if (ro && panelRef.current) ro.observe(panelRef.current)
    window.addEventListener('resize', reposition)
    window.addEventListener('scroll', reposition, true)
    return () => {
      ro?.disconnect()
      window.removeEventListener('resize', reposition)
      window.removeEventListener('scroll', reposition, true)
    }
  }, [open, placement])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (panelRef.current?.contains(e.target as Node)) return
      if (triggerRef.current?.contains(e.target as Node)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])
  useEscapeKey(() => setOpen(false), open)

  const triggerEl = Children.only(trigger) as React.ReactElement
  if (!isValidElement(triggerEl)) {
    return null
  }
  const userOnClick = (triggerEl.props as { onClick?: (e: React.MouseEvent) => void }).onClick
  const userRef = (triggerEl as unknown as { ref?: React.Ref<HTMLElement> }).ref
  const mergedRef = (el: HTMLElement | null) => {
    setTriggerRef(el)
    if (typeof userRef === 'function') userRef(el)
    else if (userRef && typeof userRef === 'object') {
      (userRef as React.MutableRefObject<HTMLElement | null>).current = el
    }
  }
  const wrappedTrigger = cloneElement(triggerEl, {
    ref: mergedRef,
    onClick: (e: React.MouseEvent) => {
      userOnClick?.(e)
      if (!e.defaultPrevented) setOpen((o) => !o)
    },
    'aria-haspopup': 'dialog',
    'aria-expanded': open,
  } as Record<string, unknown>)

  return (
    <>
      {wrappedTrigger}
      {open ? (
        <div
          ref={panelRef}
          role="dialog"
          style={{
            position: 'fixed',
            top: pos?.top ?? -9999,
            left: pos?.left ?? -9999,
            visibility: pos ? 'visible' : 'hidden',
            zIndex: 1000,
          }}
          className={cn(
            'bg-bg-elevated border border-border-default rounded-lg p-2 shadow-[var(--shadow-dropdown)]',
            className,
          )}
        >
          {content}
        </div>
      ) : null}
    </>
  )
}
