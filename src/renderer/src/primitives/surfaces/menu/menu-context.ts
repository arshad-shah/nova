import { createContext, useContext } from 'react'

export type MenuSize = 'sm' | 'md' | 'lg'

/**
 * State shared by every row within one menu level.
 *
 * `hasGutter` is the reason this context exists. The leading icon/check column
 * is a property of the *level*, not the row: if any row reserves it, all of
 * them must, or labels jag left and right depending on their neighbours. Rows
 * report an icon on mount (`reportGutter`) and the level flips the flag on.
 */
export type MenuLevelContextValue = {
  size: MenuSize
  hasGutter: boolean
  /** Called by a row that needs the leading column. Idempotent. */
  reportGutter: () => void
  /** Index registration for list navigation / typeahead. */
  getItemProps: (
    userProps?: React.HTMLProps<HTMLElement>
  ) => Record<string, unknown>
  activeIndex: number | null
  /** Close every menu in the tree — used after a row is activated. */
  closeTree: () => void
}

export const MenuLevelContext = createContext<MenuLevelContextValue | null>(null)

export function useMenuLevel(): MenuLevelContextValue {
  const ctx = useContext(MenuLevelContext)
  if (!ctx) {
    throw new Error(
      'Menu rows must be rendered inside a <DropdownMenu>, <ContextMenu> or <Menu.Sub>.'
    )
  }
  return ctx
}

/** Row heights per size. The gutter and type scale follow from these. */
export const MENU_SIZE = {
  sm: { row: 'h-[22px] px-1.5 text-xs gap-1.5', label: 'text-[10px]' },
  md: { row: 'h-[26px] px-2 text-xs gap-2', label: 'text-[10px]' },
  lg: { row: 'h-8 px-2.5 text-sm gap-2.5', label: 'text-[11px]' },
} as const satisfies Record<MenuSize, { row: string; label: string }>
