import { describe, it, expect } from 'vitest'
import {
  flattenLevel,
  levelNeedsGutter,
  isFocusable,
  type MenuNode,
} from '@/primitives/surfaces/menu/types'

const action = (id: string, extra: Record<string, unknown> = {}): MenuNode => ({
  kind: 'item',
  id,
  label: id,
  onSelect: () => {},
  ...extra,
})

describe('flattenLevel', () => {
  it('returns leaves untouched, in order', () => {
    const nodes = [action('a'), { kind: 'separator' } as const, action('b')]
    expect(flattenLevel(nodes).map((n) => n.kind)).toEqual(['item', 'separator', 'item'])
  })

  it('splices section children into the level in visual order', () => {
    const nodes: MenuNode[] = [
      action('first'),
      { kind: 'section', label: 'Group', children: [action('in-a'), action('in-b')] as never },
      action('last'),
    ]
    // The section wrapper itself is not a row; its children are rows at this level.
    expect(flattenLevel(nodes).map((n) => (n as { id: string }).id)).toEqual([
      'first',
      'in-a',
      'in-b',
      'last',
    ])
  })

  it('does NOT descend into submenu children', () => {
    // Submenu children live at their own level. Including them here would
    // desynchronise the typeahead/list-navigation index from the rendered DOM.
    const nodes: MenuNode[] = [
      {
        kind: 'submenu',
        id: 'export',
        label: 'Export',
        children: [action('csv'), action('json')],
      },
    ]
    const flat = flattenLevel(nodes)
    expect(flat).toHaveLength(1)
    expect(flat[0].kind).toBe('submenu')
  })

  it('returns an empty array for an empty level', () => {
    expect(flattenLevel([])).toEqual([])
  })
})

describe('levelNeedsGutter', () => {
  // The gutter is a property of the MENU, not the row. If any row has an icon
  // or a check, every row reserves the column — otherwise labels jag left and
  // right depending on their neighbours.

  it('is false when no row has an icon or a check', () => {
    expect(levelNeedsGutter([action('a'), action('b')])).toBe(false)
  })

  it('is true when ANY row has an icon, even if most do not', () => {
    expect(levelNeedsGutter([action('a'), action('b', { icon: 'x' }), action('c')])).toBe(true)
  })

  it('is true when a check row is present even with no icons anywhere', () => {
    const nodes: MenuNode[] = [
      action('plain'),
      { kind: 'check', id: 'c', label: 'Toggle', checked: false, onSelect: () => {} },
    ]
    expect(levelNeedsGutter(nodes)).toBe(true)
  })

  it('is true for a radio row (it renders a tick in the gutter)', () => {
    const nodes: MenuNode[] = [
      { kind: 'radio', id: 'r', label: 'Schema', checked: true, onSelect: () => {}, group: 'g' },
    ]
    expect(levelNeedsGutter(nodes)).toBe(true)
  })

  it('sees icons on rows nested inside a section', () => {
    // Regression guard: sections are containers, so a naive `nodes.some()` that
    // does not flatten would miss an icon inside a section and mis-align the level.
    const nodes: MenuNode[] = [
      action('plain'),
      { kind: 'section', label: 'G', children: [action('icony', { icon: 'x' })] as never },
    ]
    expect(levelNeedsGutter(nodes)).toBe(true)
  })

  it('is true for a submenu row carrying an icon', () => {
    const nodes: MenuNode[] = [
      { kind: 'submenu', id: 's', label: 'More', icon: 'x', children: [action('a')] },
    ]
    expect(levelNeedsGutter(nodes)).toBe(true)
  })

  it('ignores a submenu WITHOUT an icon (a chevron is not a gutter)', () => {
    // The chevron sits on the trailing edge, so it must not force a leading gutter.
    const nodes: MenuNode[] = [
      { kind: 'submenu', id: 's', label: 'More', children: [action('a')] },
    ]
    expect(levelNeedsGutter(nodes)).toBe(false)
  })

  it('does not let a separator alone force a gutter', () => {
    expect(levelNeedsGutter([action('a'), { kind: 'separator' }])).toBe(false)
  })

  it('is false for an empty level', () => {
    expect(levelNeedsGutter([])).toBe(false)
  })
})

describe('isFocusable', () => {
  it('rejects separators and sections; accepts every row kind', () => {
    expect(isFocusable({ kind: 'separator' })).toBe(false)
    expect(isFocusable({ kind: 'section', label: 'G', children: [] })).toBe(false)
    expect(isFocusable(action('a'))).toBe(true)
    expect(
      isFocusable({ kind: 'check', id: 'c', label: 'c', checked: false, onSelect: () => {} })
    ).toBe(true)
    expect(
      isFocusable({ kind: 'radio', id: 'r', label: 'r', checked: false, onSelect: () => {}, group: 'g' })
    ).toBe(true)
    expect(isFocusable({ kind: 'submenu', id: 's', label: 's', children: [] })).toBe(true)
  })
})
