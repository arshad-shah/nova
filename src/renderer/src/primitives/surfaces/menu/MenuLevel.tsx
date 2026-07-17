import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  useFloating,
  useClick,
  useHover,
  useDismiss,
  useRole,
  safePolygon,
  useListNavigation,
  useTypeahead,
  useInteractions,
  useTransitionStyles,
  useFloatingTree,
  useFloatingNodeId,
  useFloatingParentNodeId,
  FloatingNode,
  FloatingPortal,
  FloatingFocusManager,
  FloatingList,
  offset,
  flip,
  shift,
  size as sizeMiddleware,
  autoUpdate,
  type Placement,
  type VirtualElement,
} from '@floating-ui/react'
import { cn } from '../../utils/cn'
import { MenuLevelContext, type MenuLevelContextValue, type MenuSize } from './menu-context'

/**
 * One level of a menu: the floating surface, its rows, and everything that
 * makes it behave like a menu.
 *
 * This is the single implementation. `DropdownMenu` (click trigger),
 * `ContextMenu` (cursor-anchored) and `Menu.Sub` (nested) all render a
 * `MenuLevel` and differ only in how they open it.
 *
 * Everything hard here is floating-ui's, not ours: list navigation, typeahead,
 * focus management, and viewport collision handling. The three menus this
 * replaces each hand-rolled a worse subset.
 */

/**
 * How this level opens.
 *   • `click`   — a trigger element toggles it (DropdownMenu).
 *   • `submenu` — hover-with-intent + ArrowRight from a parent row (Menu.Sub).
 *   • `none`    — the owner drives `open` itself (ContextMenu, MenuBar).
 *
 * This is a mode rather than injected hooks because floating-ui's interaction
 * hooks must run unconditionally at the top level of the component that owns
 * `useFloating`. They are always called here and gated with `enabled`.
 */
export type MenuTriggerMode = 'click' | 'submenu' | 'none'

export type MenuLevelProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  triggerMode?: MenuTriggerMode
  /**
   * Anchor the level to something other than a trigger element — a cursor
   * position, for `ContextMenu`. Must go through `refs.setPositionReference`;
   * floating-ui rejects a virtual element passed as `elements.reference`.
   */
  positionReference?: VirtualElement | null
  placement?: Placement
  size?: MenuSize
  className?: string
  children: React.ReactNode
  /**
   * Rendered inline (not portalled) and given the reference ref/props — the
   * trigger. `ContextMenu` has none; it anchors to a cursor position instead.
   */
  renderTrigger?: (
    ref: (node: HTMLElement | null) => void,
    props: Record<string, unknown>
  ) => React.ReactNode
  /** Nested levels return focus to their parent row rather than trapping. */
  nested?: boolean
  /**
   * Extra key handling for the surface, for owners with navigation beyond a
   * single list — the menubar moves between top-level menus with ←/→.
   * Runs after the level's own handlers; call `preventDefault` to claim a key.
   */
  onLevelKeyDown?: (e: React.KeyboardEvent) => void
  'aria-label'?: string
}

export function MenuLevel({
  open,
  onOpenChange,
  triggerMode = 'click',
  positionReference,
  placement,
  size = 'md',
  className,
  children,
  renderTrigger,
  nested = false,
  onLevelKeyDown,
  'aria-label': ariaLabel,
}: MenuLevelProps) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null)
  const [hasGutter, setHasGutter] = useState(false)

  const elementsRef = useRef<Array<HTMLElement | null>>([])
  const labelsRef = useRef<Array<string | null>>([])

  const tree = useFloatingTree()
  const nodeId = useFloatingNodeId()
  const parentId = useFloatingParentNodeId()

  const { refs, floatingStyles, context } = useFloating({
    nodeId,
    open,
    onOpenChange,
    placement: placement ?? (nested ? 'right-start' : 'bottom-start'),
    whileElementsMounted: autoUpdate,
    middleware: [
      offset(nested ? { mainAxis: -4, alignmentAxis: -4 } : 4),
      flip({ padding: 8 }),
      shift({ padding: 8 }),
      // Long lists (the connection/schema pickers) must fit the viewport and
      // scroll internally rather than overflow it.
      sizeMiddleware({
        padding: 8,
        apply({ availableHeight, elements }) {
          elements.floating.style.setProperty(
            '--menu-max-height',
            `${Math.max(96, Math.min(320, availableHeight - 8))}px`
          )
        },
      }),
    ],
  })

  // A cursor-anchored level (ContextMenu) positions against a virtual element
  // rather than a trigger node.
  useEffect(() => {
    if (positionReference) refs.setPositionReference(positionReference)
  }, [positionReference, refs])

  // Every interaction hook is called unconditionally and gated by `enabled` —
  // the Rules of Hooks forbid selecting them per trigger mode.
  const click = useClick(context, { enabled: triggerMode === 'click' })
  const hover = useHover(context, {
    enabled: triggerMode === 'submenu',
    delay: { open: 75 },
    // Lets the pointer travel diagonally into the submenu without it closing
    // as the cursor leaves the trigger row.
    handleClose: safePolygon({ blockPointerEvents: true }),
  })
  const role = useRole(context, { role: 'menu' })
  // `bubbles: false` keeps Escape/outside-click local: dismissing a submenu
  // must not tear down its parent.
  const dismiss = useDismiss(context, { bubbles: false })
  const listNavigation = useListNavigation(context, {
    listRef: elementsRef,
    activeIndex,
    nested,
    onNavigate: setActiveIndex,
    loop: true,
    focusItemOnOpen: 'auto',
  })
  const typeahead = useTypeahead(context, {
    listRef: labelsRef,
    activeIndex,
    onMatch: open ? setActiveIndex : undefined,
  })

  const { getReferenceProps, getFloatingProps, getItemProps } = useInteractions([
    click,
    hover,
    role,
    dismiss,
    listNavigation,
    typeahead,
  ])

  const { isMounted, styles: transitionStyles } = useTransitionStyles(context, {
    duration: { open: 120, close: 80 },
    // Opacity + a small rise. The previous menu used a spring
    // (cubic-bezier overshooting past 1), which reads wrong for a native menu.
    initial: { opacity: 0, transform: 'translateY(-2px)' },
    common: { transformOrigin: 'top' },
    open: { opacity: 1, transform: 'translateY(0)' },
    close: { opacity: 0, transform: 'translateY(-2px)' },
  })

  /**
   * Selecting a row closes the whole tree, not just the level it lives in.
   * Without this a nested selection leaves the ancestors hanging open.
   */
  const closeTree = useCallback(() => {
    if (tree) tree.events.emit('menu:select')
    else onOpenChange(false)
  }, [tree, onOpenChange])

  useEffect(() => {
    if (!tree) return
    const onSelect = () => onOpenChange(false)
    /** Opening a sibling submenu closes any other open sibling. */
    const onMenuOpen = (event: { nodeId: string; parentId: string | null }) => {
      if (event.nodeId !== nodeId && event.parentId === parentId) onOpenChange(false)
    }
    tree.events.on('menu:select', onSelect)
    tree.events.on('menu:open', onMenuOpen)
    return () => {
      tree.events.off('menu:select', onSelect)
      tree.events.off('menu:open', onMenuOpen)
    }
  }, [tree, nodeId, parentId, onOpenChange])

  useEffect(() => {
    if (open && tree) tree.events.emit('menu:open', { nodeId, parentId })
  }, [open, tree, nodeId, parentId])

  const reportGutter = useCallback(() => setHasGutter(true), [])

  const levelValue = useMemo(
    () => ({
      size,
      hasGutter,
      reportGutter,
      getItemProps: getItemProps as MenuLevelContextValue['getItemProps'],
      activeIndex,
      closeTree,
    }),
    [size, hasGutter, reportGutter, getItemProps, activeIndex, closeTree]
  )

  return (
    <>
      {renderTrigger?.(refs.setReference, getReferenceProps())}
      <FloatingNode id={nodeId}>
        {isMounted && (
          <FloatingPortal>
            <FloatingFocusManager
              context={context}
              modal={false}
              initialFocus={nested ? -1 : 0}
              returnFocus={!nested}
            >
              <div
                ref={refs.setFloating}
                style={{ ...floatingStyles, zIndex: 50 }}
                {...getFloatingProps({ onKeyDown: onLevelKeyDown })}
              >
                <div
                  aria-label={ariaLabel}
                  className={cn(
                    'bg-bg-elevated border border-border-default rounded-md p-1 shadow-dropdown',
                    'min-w-[7rem] max-h-[var(--menu-max-height,20rem)] overflow-y-auto',
                    className
                  )}
                  style={transitionStyles}
                >
                  <MenuLevelContext.Provider value={levelValue}>
                    <FloatingList elementsRef={elementsRef} labelsRef={labelsRef}>
                      {children}
                    </FloatingList>
                  </MenuLevelContext.Provider>
                </div>
              </div>
            </FloatingFocusManager>
          </FloatingPortal>
        )}
      </FloatingNode>
    </>
  )
}
