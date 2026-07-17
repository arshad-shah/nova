import React, { useState } from 'react'
import { MenuLevel } from './MenuLevel'
import { MenuRow, SubmenuChevron } from './MenuItem'
import { useMenuLevel } from './menu-context'

export type MenuSubProps = {
  label: string
  icon?: React.ReactNode
  disabled?: boolean
  children: React.ReactNode
}

/**
 * A nested menu. The trigger is an ordinary row that opens a child `MenuLevel`.
 *
 * Opens on hover (with `safePolygon`, so travelling diagonally toward the
 * submenu doesn't snap it shut) and on ArrowRight; ArrowLeft closes it and
 * returns focus to this row. Both come from the child level's
 * `useListNavigation({ nested: true })`.
 */
export function MenuSub({ label, icon, disabled, children }: MenuSubProps) {
  const [open, setOpen] = useState(false)
  const parentLevel = useMenuLevel()

  return (
    <MenuLevel
      nested
      triggerMode="submenu"
      open={open}
      onOpenChange={setOpen}
      size={parentLevel.size}
      aria-label={label}
      renderTrigger={(ref, props) => (
        <MenuRow
          role="menuitem"
          label={label}
          gutter={icon}
          needsGutter={icon != null}
          disabled={disabled}
          trailing={<SubmenuChevron />}
          // Opening a level is not an activation: this row must never close the tree.
          suppressClose
          triggerRef={ref}
          triggerProps={props}
        />
      )}
    >
      {children}
    </MenuLevel>
  )
}
