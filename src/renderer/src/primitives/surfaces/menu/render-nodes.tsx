import React from 'react'
import { MenuItem, MenuCheckItem, MenuRadioItem, MenuSeparator, MenuSection } from './MenuItem'
import { MenuSub } from './MenuSub'
import type { MenuNode } from './types'

/**
 * Render a declarative tree using the compound components.
 *
 * This is the whole declarative layer: `<Menu items={tree}/>` is this function
 * plus a level. There is exactly one implementation of a menu row, so the two
 * entry points cannot drift.
 */
export function renderNodes(nodes: MenuNode[]): React.ReactNode {
  return nodes.map((node, i) => {
    switch (node.kind) {
      case 'separator':
        // Separators are positional and carry no identity of their own.
        return <MenuSeparator key={`sep-${i}`} />

      case 'section':
        return (
          <MenuSection key={`section-${node.label}-${i}`} label={node.label}>
            {renderNodes(node.children)}
          </MenuSection>
        )

      case 'submenu':
        return (
          <MenuSub key={node.id} label={node.label} icon={node.icon} disabled={node.disabled}>
            {renderNodes(node.children)}
          </MenuSub>
        )

      case 'check':
        return (
          <MenuCheckItem
            key={node.id}
            label={node.label}
            checked={node.checked}
            shortcut={node.shortcut}
            disabled={node.disabled}
            onSelect={node.onSelect}
          />
        )

      case 'radio':
        return (
          <MenuRadioItem
            key={node.id}
            label={node.label}
            checked={node.checked}
            disabled={node.disabled}
            onSelect={node.onSelect}
          />
        )

      case 'item':
        return (
          <MenuItem
            key={node.id}
            label={node.label}
            icon={node.icon}
            shortcut={node.shortcut}
            disabled={node.disabled}
            tone={node.tone}
            onSelect={node.onSelect}
          />
        )
    }
  })
}
