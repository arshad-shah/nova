import React from 'react'
import { Button } from '@/primitives'
import { cn } from '@/primitives/utils/cn'
import { MenuLevel } from '@/primitives/surfaces/menu/MenuLevel'
import { renderNodes } from '@/primitives/surfaces/menu/render-nodes'
import type { MenuNode } from '@/primitives/surfaces/menu/types'
import { useMenus, type MenuDef, type MenuItemDef } from './menu-model'
import { useMenubar, type Menubar } from './useMenubar'

/**
 * App-designed application menu bar (File / Edit / View / Query / Help) for the
 * custom title bar on Windows & Linux, driven by the declarative tree in
 * `menu-model.tsx`. macOS keeps its native menu and never renders this (gated
 * in TitleBar).
 *
 * The surface, the rows, ↑/↓/Home/End, typeahead and focus return come from the
 * shared menu primitive — this file used to hand-roll all of it, which is why
 * it drifted from `DropdownMenu` and ended up the nicest menu in the app while
 * not being the primitive. What remains here is only what is genuinely
 * menubar-specific: cross-menu hover switching and ←/→, in {@link useMenubar}.
 */
export function MenuBar() {
  const menus = useMenus()
  const menubar = useMenubar(menus.length)

  return (
    <div className="no-drag flex items-stretch h-full" role="menubar">
      {menus.map((menu, i) => (
        <TopMenu key={menu.label} menu={menu} index={i} menubar={menubar} />
      ))}
    </div>
  )
}

/**
 * Adapt one menu-model item to a menu node.
 *
 * `enabled()` is evaluated here — at render, when the menu opens — matching the
 * previous behaviour and the contract documented on `MenuItemDef`.
 */
function toNode(item: MenuItemDef, index: number, close: () => void): MenuNode {
  if (item.kind === 'separator') return { kind: 'separator' }
  const Icon = item.icon
  return {
    kind: 'item',
    // Labels are unique within a menu and stable across renders; the index
    // keeps the key unique if two ever collide.
    id: `${item.label}-${index}`,
    label: item.label,
    icon: Icon ? <Icon size={14} aria-hidden="true" /> : undefined,
    shortcut: item.accelerator,
    disabled: item.enabled ? !item.enabled() : false,
    tone: item.danger ? 'danger' : undefined,
    onSelect: () => {
      item.run()
      close()
    },
  }
}

function TopMenu({
  menu,
  index,
  menubar,
}: {
  menu: MenuDef
  index: number
  menubar: Menubar
}) {
  const isOpen = menubar.isOpen(index)

  const onTriggerKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowRight') {
      e.preventDefault()
      menubar.moveSibling(index, 1)
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault()
      menubar.moveSibling(index, -1)
    }
  }

  // ←/→ move between top-level menus. ↑/↓/Home/End/typeahead are the level's.
  const onLevelKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowRight') {
      e.preventDefault()
      menubar.moveSibling(index, 1)
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault()
      menubar.moveSibling(index, -1)
    }
  }

  return (
    <MenuLevel
      triggerMode="none"
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) menubar.close()
      }}
      size="lg"
      aria-label={menu.label}
      className="min-w-[15rem]"
      onLevelKeyDown={onLevelKeyDown}
      renderTrigger={(ref, props) => (
        <Button
          variant="bare"
          size="none"
          ref={(el: HTMLButtonElement | null) => {
            ref(el)
            menubar.registerTrigger(index)(el)
          }}
          type="button"
          role="menuitem"
          aria-haspopup="menu"
          aria-expanded={isOpen}
          className={cn(
            'flex items-center px-2.5 text-xs text-text-secondary transition-colors',
            'hover:bg-active hover:text-text-primary focus-visible:outline-none focus-visible:bg-active',
            isOpen && 'bg-active text-text-primary'
          )}
          {...props}
          // Compose with the level's own reference handlers rather than
          // replacing them — useListNavigation puts ArrowDown-to-open on
          // onKeyDown, and spreading `props` then overwriting it would silently
          // drop that.
          onClick={(e: React.MouseEvent) => {
            ;(props.onClick as ((e: React.MouseEvent) => void) | undefined)?.(e)
            menubar.toggle(index)
          }}
          // While a menu is open, hovering a sibling switches to it.
          onMouseEnter={(e: React.MouseEvent) => {
            ;(props.onMouseEnter as ((e: React.MouseEvent) => void) | undefined)?.(e)
            menubar.hover(index)
          }}
          onKeyDown={(e: React.KeyboardEvent) => {
            ;(props.onKeyDown as ((e: React.KeyboardEvent) => void) | undefined)?.(e)
            if (!e.defaultPrevented) onTriggerKeyDown(e)
          }}
        >
          {menu.label}
        </Button>
      )}
    >
      {renderNodes(menu.items.map((item, k) => toNode(item, k, () => menubar.close())))}
    </MenuLevel>
  )
}
