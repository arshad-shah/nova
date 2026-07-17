import React, { useState } from 'react'
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
  /** Accessible name for the menu surface. */
  'aria-label'?: string
}

function DropdownMenuImpl({
  trigger,
  items,
  children,
  size = 'md',
  className,
  'aria-label': ariaLabel,
}: DropdownMenuProps) {
  const [open, setOpen] = useState(false)

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
