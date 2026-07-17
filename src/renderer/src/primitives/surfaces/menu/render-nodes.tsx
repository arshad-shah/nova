import React from 'react'
import {
  MenuItem,
  MenuCheckItem,
  MenuRadioItem,
  MenuRadioGroup,
  MenuSeparator,
  MenuSection,
} from './MenuItem'
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
  return renderRuns(nodes)
}

/**
 * Radio rows carry a `group`, and ARIA requires the rows of one single-select
 * set to live inside a `role="group"` container — that container is what makes
 * them mutually exclusive rather than N unrelated radios.
 *
 * So consecutive radios sharing a `group` are collected into one
 * {@link MenuRadioGroup}. Consecutive is deliberate: a separator or a plain row
 * between two runs of the same group means the author split them visually, and
 * fusing them back into one container would contradict the rendering.
 */
function renderRuns(nodes: MenuNode[]): React.ReactNode {
  const out: React.ReactNode[] = []
  let i = 0

  while (i < nodes.length) {
    const node = nodes[i]

    if (node.kind === 'radio') {
      const { group } = node
      const run: Extract<MenuNode, { kind: 'radio' }>[] = []
      while (i < nodes.length) {
        const next = nodes[i]
        if (next.kind !== 'radio' || next.group !== group) break
        run.push(next)
        i++
      }
      out.push(
        <MenuRadioGroup key={`radiogroup-${group}-${run[0].id}`} label={group}>
          {run.map((r) => (
            <MenuRadioItem
              key={r.id}
              label={r.label}
              checked={r.checked}
              disabled={r.disabled}
              onSelect={r.onSelect}
            />
          ))}
        </MenuRadioGroup>
      )
      continue
    }

    out.push(renderNode(node, i))
    i++
  }

  return out
}

/** Every node kind except `radio`, which `renderRuns` owns so it can group them. */
function renderNode(node: Exclude<MenuNode, { kind: 'radio' }>, i: number): React.ReactNode {
  switch (node.kind) {
    case 'separator':
      // Separators are positional and carry no identity of their own.
      return <MenuSeparator key={`sep-${i}`} />

    case 'section':
      return (
        <MenuSection key={`section-${node.label}-${i}`} label={node.label}>
          {renderRuns(node.children)}
        </MenuSection>
      )

    case 'submenu':
      return (
        <MenuSub key={node.id} label={node.label} icon={node.icon} disabled={node.disabled}>
          {renderRuns(node.children)}
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
}
