import { useRef, useState } from 'react'
import {
  useFloating, useDismiss, useRole, useInteractions, useTransitionStyles,
  offset, flip, shift, autoUpdate, FloatingPortal,
} from '@floating-ui/react'
import { Box, KbdGroup, Button } from '@/primitives'
import { cn } from '@/primitives/utils/cn'
import { useMenus, type MenuDef, type MenuItemDef } from './menu-model'

/**
 * App-designed application menu bar (File / Edit / View / Query / Help) for the
 * custom title bar on Windows & Linux. Replaces the native submenu popups with
 * our own dropdowns (DropdownMenu look) + KbdGroup shortcut hints, driven by the
 * declarative tree in `menu-model.tsx`. macOS keeps its native menu and never
 * renders this (gated in TitleBar).
 *
 * Menubar UX: click a top-level to open; while any menu is open, hovering
 * another top-level switches to it; ←/→ move between menus, ↑/↓ move the focused
 * item, Enter runs, Esc / outside-click closes.
 */
export function MenuBar() {
  const menus = useMenus()
  const [openIndex, setOpenIndex] = useState<number | null>(null)
  const triggerRefs = useRef<(HTMLButtonElement | null)[]>([])

  const focusTrigger = (i: number) => triggerRefs.current[i]?.focus()

  return (
    <div className="no-drag flex items-stretch h-full" role="menubar">
      {menus.map((menu, i) => (
        <TopMenu
          key={menu.label}
          menu={menu}
          isOpen={openIndex === i}
          anyOpen={openIndex !== null}
          setRef={(el) => { triggerRefs.current[i] = el }}
          onToggle={() => setOpenIndex((cur) => (cur === i ? null : i))}
          onHoverOpen={() => setOpenIndex(i)}
          onClose={(refocus) => { setOpenIndex(null); if (refocus) focusTrigger(i) }}
          onSibling={(dir) => {
            const next = (i + dir + menus.length) % menus.length
            setOpenIndex(next)
            focusTrigger(next)
          }}
        />
      ))}
    </div>
  )
}

function TopMenu({
  menu, isOpen, anyOpen, setRef, onToggle, onHoverOpen, onClose, onSibling,
}: {
  menu: MenuDef
  isOpen: boolean
  anyOpen: boolean
  setRef: (el: HTMLButtonElement | null) => void
  onToggle: () => void
  onHoverOpen: () => void
  onClose: (refocus: boolean) => void
  onSibling: (dir: -1 | 1) => void
}) {
  const { refs, floatingStyles, context } = useFloating({
    placement: 'bottom-start',
    open: isOpen,
    onOpenChange: (o) => { if (!o) onClose(false) },
    whileElementsMounted: autoUpdate,
    middleware: [offset(4), flip({ padding: 8 }), shift({ padding: 8 })],
  })
  const dismiss = useDismiss(context)
  const role = useRole(context, { role: 'menu' })
  const { getReferenceProps, getFloatingProps } = useInteractions([dismiss, role])
  const { isMounted, styles: transitionStyles } = useTransitionStyles(context, {
    duration: { open: 130, close: 90 },
    initial: { opacity: 0, transform: 'scaleY(0.96)' },
    common: { transformOrigin: 'top', transitionTimingFunction: 'cubic-bezier(0.34,1.56,0.64,1)' },
    open: { opacity: 1, transform: 'scaleY(1)' },
  })

  const itemEls = (): HTMLElement[] =>
    Array.from(
      (refs.floating.current?.querySelectorAll('[role="menuitem"]:not([disabled])') ?? []) as NodeListOf<HTMLElement>
    )

  const focusFirst = () => requestAnimationFrame(() => itemEls()[0]?.focus())

  const onTriggerKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault(); if (!isOpen) onToggle(); focusFirst()
    } else if (e.key === 'ArrowRight') { e.preventDefault(); onSibling(1) }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); onSibling(-1) }
  }

  const onMenuKeyDown = (e: React.KeyboardEvent) => {
    const els = itemEls()
    if (els.length === 0) return
    const cur = els.indexOf(document.activeElement as HTMLElement)
    if (e.key === 'ArrowDown') { e.preventDefault(); els[(cur + 1) % els.length]?.focus() }
    else if (e.key === 'ArrowUp') { e.preventDefault(); els[(cur - 1 + els.length) % els.length]?.focus() }
    else if (e.key === 'Home') { e.preventDefault(); els[0]?.focus() }
    else if (e.key === 'End') { e.preventDefault(); els[els.length - 1]?.focus() }
    else if (e.key === 'ArrowRight') { e.preventDefault(); onSibling(1) }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); onSibling(-1) }
  }

  return (
    <>
      <Button
        variant="bare"
        size="none"
        ref={(el) => { refs.setReference(el); setRef(el) }}
        type="button"
        role="menuitem"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        className={cn(
          'flex items-center px-2.5 text-xs text-text-secondary transition-colors',
          'hover:bg-white/10 hover:text-text-primary focus-visible:outline-none focus-visible:bg-white/10',
          isOpen && 'bg-white/10 text-text-primary'
        )}
        {...getReferenceProps({
          onClick: onToggle,
          onMouseEnter: () => { if (anyOpen && !isOpen) onHoverOpen() },
          onKeyDown: onTriggerKeyDown,
        })}
      >
        {menu.label}
      </Button>

      {isMounted && (
        <FloatingPortal>
          <Box ref={refs.setFloating} style={{ ...floatingStyles, zIndex: 50 }} {...getFloatingProps({ onKeyDown: onMenuKeyDown })}>
            <Box
              role="menu"
              aria-label={menu.label}
              className="min-w-[15rem] bg-bg-elevated border border-border-default rounded-lg shadow-dropdown py-1.5 px-1.5"
              style={transitionStyles}
            >
              {menu.items.map((item, k) => (
                <MenuRow key={k} item={item} onRun={() => onClose(false)} />
              ))}
            </Box>
          </Box>
        </FloatingPortal>
      )}
    </>
  )
}

function MenuRow({ item, onRun }: { item: MenuItemDef; onRun: () => void }) {
  if (item.kind === 'separator') {
    return <Box role="separator" className="h-px bg-border-default my-1.5 mx-1" />
  }
  const disabled = item.enabled ? !item.enabled() : false
  const Icon = item.icon
  return (
    <Button
      variant="bare"
      size="none"
      role="menuitem"
      disabled={disabled}
      onClick={() => { item.run(); onRun() }}
      className={cn(
        'flex w-full items-center gap-2.5 px-2.5 py-1.5 rounded-md text-sm text-left whitespace-nowrap transition-colors',
        'hover:bg-hover focus:bg-hover focus:outline-none disabled:opacity-40 disabled:pointer-events-none',
        item.danger && 'text-error'
      )}
    >
      {Icon && <Icon size={15} className={cn('shrink-0', item.danger ? 'text-error' : 'text-text-tertiary')} aria-hidden="true" />}
      <Box as="span" className="flex-1">{item.label}</Box>
      {item.accelerator && <KbdGroup accelerator={item.accelerator} size="sm" className="shrink-0" />}
    </Button>
  )
}
