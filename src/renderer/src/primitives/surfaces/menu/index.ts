/**
 * The menu module: one floating-ui core, three roots.
 *
 * `DropdownMenu` (click), `ContextMenu` (cursor) and `MenuBar` all render a
 * `MenuLevel`. Do not hand-roll a fourth — the `role="menu"` containment audit
 * in `tests/unit/audit/menu-single-implementation.test.ts` fails CI if you do.
 */
export { MenuLevel, type MenuLevelProps, type MenuTriggerMode } from './MenuLevel'
export {
  MenuItem,
  MenuCheckItem,
  MenuRadioItem,
  MenuSeparator,
  MenuSection,
  MenuRow,
  type MenuItemProps,
  type MenuCheckItemProps,
  type MenuRadioItemProps,
  type MenuSectionProps,
} from './MenuItem'
export { MenuSub, type MenuSubProps } from './MenuSub'
export { renderNodes } from './render-nodes'
export { useMenuLevel, type MenuSize } from './menu-context'
export {
  flattenLevel,
  levelNeedsGutter,
  isFocusable,
  type MenuNode,
  type MenuLeafNode,
  type MenuSectionNode,
  type MenuActionNode,
  type MenuCheckNode,
  type MenuRadioNode,
  type MenuSubmenuNode,
  type MenuSeparatorNode,
  type MenuTone,
  type FocusableMenuNode,
} from './types'

import { MenuItem, MenuCheckItem, MenuRadioItem, MenuSeparator, MenuSection } from './MenuItem'
import { MenuSub } from './MenuSub'

/**
 * Compound namespace, so call-sites read as a menu rather than as a pile of
 * imports: `<Menu.Item/>`, `<Menu.Sub/>`, `<Menu.Separator/>`.
 */
export const Menu = {
  Item: MenuItem,
  CheckItem: MenuCheckItem,
  RadioItem: MenuRadioItem,
  Separator: MenuSeparator,
  Section: MenuSection,
  Sub: MenuSub,
}
