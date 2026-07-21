import React, { useCallback, useState } from 'react'
import { FloatingTree, useFloatingParentNodeId } from '@floating-ui/react'
import { MenuLevel } from './menu/MenuLevel'
import { renderNodes } from './menu/render-nodes'
import type { MenuNode } from './menu/types'
import type { MenuSize } from './menu/menu-context'

/**
 * A menu opened by clicking a trigger.
 *
 * Two ways to fill it, one implementation underneath:
 *
 *   // declarative — for data-shaped menus
 *   <DropdownMenu trigger={<Button/>} items={[{kind:'item', id:'a', label:'A', onSelect}]} />
 *
 *   // compound — for rows with custom content
 *   <DropdownMenu trigger={<Button/>}>
 *     <Menu.Item label="Save" shortcut="Ctrl+S" onSelect={save} />
 *     <Menu.Separator />
 *     <Menu.Sub label="Export"><Menu.Item label="CSV" onSelect={csv} /></Menu.Sub>
 *   </DropdownMenu>
 */
export type DropdownMenuProps = {
  trigger: React.ReactElement
  /** Declarative tree. Mutually exclusive with `children`. */
  items?: MenuNode[]
  children?: React.ReactNode
  size?: MenuSize
  className?: string
  /**
   * Controlled open state. Omit to let the menu own it.
   *
   * Needed when something outside the trigger has to open the menu — e.g. an
   * action in one menu that opens another. Pair with
   * {@link DropdownMenuProps.onOpenChange}, or the menu cannot close itself.
   */
  open?: boolean
  /** Called whenever the menu wants to open or close. Required if `open` is passed. */
  onOpenChange?: (open: boolean) => void
  /** Accessible name for the menu surface. */
  'aria-label'?: string
}

function DropdownMenuImpl({
  trigger,
  items,
  children,
  size = 'md',
  className,
  open: controlledOpen,
  onOpenChange,
  'aria-label': ariaLabel,
}: DropdownMenuProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false)
  const isControlled = controlledOpen !== undefined
  const open = isControlled ? controlledOpen : uncontrolledOpen

  const setOpen = useCallback(
    (next: boolean) => {
      if (!isControlled) setUncontrolledOpen(next)
      onOpenChange?.(next)
    },
    [isControlled, onOpenChange]
  )

  return (
    <MenuLevel
      triggerMode="click"
      open={open}
      onOpenChange={setOpen}
      size={size}
      className={className}
      aria-label={ariaLabel}
      renderTrigger={(ref, props) =>
        React.cloneElement(trigger as React.ReactElement<Record<string, unknown>>, {
          ref,
          ...props,
        })
      }
    >
      {items ? renderNodes(items) : children}
    </MenuLevel>
  )
}

export function DropdownMenu(props: DropdownMenuProps) {
  // Submenus talk to their ancestors through the tree. A root must provide one;
  // a DropdownMenu nested inside another menu must not start a second.
  const parentId = useFloatingParentNodeId()
  if (parentId != null) return <DropdownMenuImpl {...props} />
  return (
    <FloatingTree>
      <DropdownMenuImpl {...props} />
    </FloatingTree>
  )
}
