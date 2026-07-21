import type { ReactNode } from 'react'

/**
 * The declarative menu tree.
 *
 * Two ways to build a menu, one implementation underneath:
 *   • compound — `<Menu.Item>` etc., for rows with custom content (a colour
 *     swatch, secondary text). See `MenuItem.tsx`.
 *   • declarative — `<Menu items={tree}/>`, for data-shaped menus. The whole
 *     application menu (`shared/menus.ts`) is already a tree of this shape.
 *
 * `render-nodes.tsx` renders a tree using the compound components, so there is
 * exactly one implementation of a menu row.
 */

export type MenuTone = 'default' | 'danger'

/** A row that runs an action. */
export type MenuActionNode = {
  kind: 'item'
  id: string
  label: string
  icon?: ReactNode
  /**
   * A *resolved* accelerator string ("Ctrl+S"), rendered via `KbdGroup`.
   *
   * The primitive deliberately knows nothing about keybindings. Callers resolve
   * from the user's live bindings and re-render on rebind — `menu-model.tsx`
   * already does this with `itemAccelerator()` and a settings subscription.
   * Resolving here instead would duplicate that logic in a second place, which
   * is how the accelerator hints drift from the real bindings.
   */
  shortcut?: string
  onSelect: () => void
  disabled?: boolean
  tone?: MenuTone
}

/** A row with an independent on/off state (the View panel toggles). */
export type MenuCheckNode = {
  kind: 'check'
  id: string
  label: string
  checked: boolean
  onSelect: () => void
  disabled?: boolean
  /** Resolved accelerator string — see {@link MenuActionNode.shortcut}. */
  shortcut?: string
}

/** A row in a single-select group (the database / schema pickers). */
export type MenuRadioNode = {
  kind: 'radio'
  id: string
  label: string
  checked: boolean
  onSelect: () => void
  disabled?: boolean
  /** Rows sharing a `group` are mutually exclusive. */
  group: string
}

/** A row that opens a nested menu. Submenus nest freely. */
export type MenuSubmenuNode = {
  kind: 'submenu'
  id: string
  label: string
  icon?: ReactNode
  children: MenuNode[]
  disabled?: boolean
}

export type MenuSeparatorNode = { kind: 'separator' }

export type MenuLeafNode =
  | MenuActionNode
  | MenuCheckNode
  | MenuRadioNode
  | MenuSubmenuNode
  | MenuSeparatorNode

/**
 * A labelled group. Holds leaves only — a section cannot contain a section.
 * ARIA's `group` role expects a flat set, and nesting one would render
 * ambiguously.
 */
export type MenuSectionNode = {
  kind: 'section'
  label: string
  children: MenuLeafNode[]
}

export type MenuNode = MenuLeafNode | MenuSectionNode

/** Rows the user can focus/activate. Separators and sections are not focusable. */
export type FocusableMenuNode =
  | MenuActionNode
  | MenuCheckNode
  | MenuRadioNode
  | MenuSubmenuNode

export function isFocusable(node: MenuNode): node is FocusableMenuNode {
  return node.kind !== 'separator' && node.kind !== 'section'
}

/**
 * Flatten a tree to the rows rendered at *this* level, in visual order.
 * Sections contribute their children; submenu children belong to the submenu's
 * own level and are not included.
 *
 * Used to build the typeahead/list-navigation index, which must match the DOM
 * order of focusable rows exactly.
 */
export function flattenLevel(nodes: MenuNode[]): MenuLeafNode[] {
  return nodes.flatMap((node) => (node.kind === 'section' ? node.children : [node]))
}

/**
 * Does this level need the leading icon/check column reserved?
 *
 * The gutter is a property of the *menu*, not the row: if any row has an icon
 * or a check, every row reserves the column, otherwise labels jag left and
 * right depending on their neighbours.
 */
export function levelNeedsGutter(nodes: MenuNode[]): boolean {
  return flattenLevel(nodes).some(
    (n) =>
      (n.kind === 'item' && n.icon != null) ||
      (n.kind === 'submenu' && n.icon != null) ||
      n.kind === 'check' ||
      n.kind === 'radio'
  )
}
