import React, { useCallback, useRef, useState } from 'react'
import { FloatingTree, useFloatingParentNodeId, type VirtualElement } from '@floating-ui/react'
import { MenuLevel } from './menu/MenuLevel'
import { renderNodes } from './menu/render-nodes'
import type { MenuNode } from './menu/types'
import type { MenuSize } from './menu/menu-context'

/**
 * A menu opened by right-clicking its children.
 *
 * Anchored to a virtual reference at the cursor, so it gets the same `flip` /
 * `shift` collision handling as every other menu — the previous implementation
 * positioned with raw `top`/`left` and overflowed the viewport on a right-click
 * near a screen edge.
 */
export type ContextMenuProps = {
  /** Declarative tree. Mutually exclusive with `menu`. */
  items?: MenuNode[]
  /** Compound content. */
  menu?: React.ReactNode
  size?: MenuSize
  className?: string
  children: React.ReactNode
  'aria-label'?: string
}

function ContextMenuImpl({
  items,
  menu,
  size = 'md',
  className,
  children,
  'aria-label': ariaLabel,
}: ContextMenuProps) {
  const [open, setOpen] = useState(false)
  const positionRef = useRef({ x: 0, y: 0 })

  // A zero-size rect at the cursor. Recreated per open so floating-ui re-reads
  // the position; `getBoundingClientRect` closes over the latest coordinates.
  const [positionReference, setPositionReference] = useState<VirtualElement | null>(null)

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    // Nested targets each have their own ContextMenu; only the innermost should
    // open. Without this, right-clicking a column would also open the table's menu.
    e.stopPropagation()
    positionRef.current = { x: e.clientX, y: e.clientY }
    setPositionReference({
      getBoundingClientRect() {
        const { x, y } = positionRef.current
        return { width: 0, height: 0, x, y, top: y, left: x, right: x, bottom: y } as DOMRect
      },
    })
    setOpen(true)
  }, [])

  return (
    <>
      <div onContextMenu={handleContextMenu} className="contents">
        {children}
      </div>
      <MenuLevel
        triggerMode="none"
        open={open}
        onOpenChange={setOpen}
        placement="right-start"
        size={size}
        className={className}
        aria-label={ariaLabel}
        positionReference={positionReference}
      >
        {items ? renderNodes(items) : menu}
      </MenuLevel>
    </>
  )
}

export function ContextMenu(props: ContextMenuProps) {
  const parentId = useFloatingParentNodeId()
  if (parentId != null) return <ContextMenuImpl {...props} />
  return (
    <FloatingTree>
      <ContextMenuImpl {...props} />
    </FloatingTree>
  )
}
