import { describe, it, expect, vi } from 'vitest'
import React from 'react'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DropdownMenu } from '@/primitives/surfaces/DropdownMenu'
import { ContextMenu } from '@/primitives/surfaces/ContextMenu'
import { Menu } from '@/primitives/surfaces/menu'
import type { MenuNode } from '@/primitives/surfaces/menu/types'

/**
 * Behavioural tests for the menu primitive.
 *
 * These assert what a menu *does* — activation, keyboard, focus, ARIA state —
 * not that its labels appear in the DOM. A test that only checks rendering
 * passes against a menu whose rows do nothing when clicked.
 */

const openMenu = async (user: ReturnType<typeof userEvent.setup>, name = 'Open') => {
  await user.click(screen.getByRole('button', { name }))
  return screen.findByRole('menu')
}

function Harness({ items, ...rest }: { items: MenuNode[] } & Record<string, unknown>) {
  return <DropdownMenu trigger={<button>Open</button>} items={items} {...rest} />
}

describe('menu — activation', () => {
  it('calls onSelect exactly once and closes the menu', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    render(<Harness items={[{ kind: 'item', id: 'a', label: 'Run Query', onSelect }]} />)

    await openMenu(user)
    await user.click(screen.getByRole('menuitem', { name: 'Run Query' }))

    expect(onSelect).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument())
  })

  it('does NOT call onSelect for a disabled row, and keeps the menu open', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    render(
      <Harness items={[{ kind: 'item', id: 'a', label: 'Run Query', onSelect, disabled: true }]} />
    )

    await openMenu(user)
    await user.click(screen.getByRole('menuitem', { name: 'Run Query' }), { pointerEventsCheck: 0 })

    expect(onSelect).not.toHaveBeenCalled()
    expect(screen.getByRole('menu')).toBeInTheDocument()
  })

  it('marks a disabled row disabled for assistive tech', async () => {
    const user = userEvent.setup()
    render(
      <Harness
        items={[{ kind: 'item', id: 'a', label: 'Run Query', onSelect: () => {}, disabled: true }]}
      />
    )
    await openMenu(user)
    expect(screen.getByRole('menuitem', { name: 'Run Query' })).toBeDisabled()
  })

  it('toggles aria-expanded on the trigger', async () => {
    const user = userEvent.setup()
    render(<Harness items={[{ kind: 'item', id: 'a', label: 'A', onSelect: () => {} }]} />)

    const trigger = screen.getByRole('button', { name: 'Open' })
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    await user.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
  })
})

describe('menu — keyboard', () => {
  const threeItems: MenuNode[] = [
    { kind: 'item', id: 'a', label: 'Alpha', onSelect: () => {} },
    { kind: 'item', id: 'b', label: 'Beta', onSelect: () => {} },
    { kind: 'item', id: 'c', label: 'Gamma', onSelect: () => {} },
  ]

  it('activates the focused row with Enter', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    render(
      <Harness
        items={[
          { kind: 'item', id: 'a', label: 'Alpha', onSelect: () => {} },
          { kind: 'item', id: 'b', label: 'Beta', onSelect },
        ]}
      />
    )
    await openMenu(user)
    await user.keyboard('{ArrowDown}{ArrowDown}{Enter}')
    expect(onSelect).toHaveBeenCalledTimes(1)
  })

  it('closes on Escape and returns focus to the trigger', async () => {
    // Focus return is what makes a menu usable by keyboard: losing focus to
    // <body> strands the user. None of the previous menus did this.
    const user = userEvent.setup()
    render(<Harness items={threeItems} />)

    const trigger = screen.getByRole('button', { name: 'Open' })
    await openMenu(user)
    await user.keyboard('{Escape}')

    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument())
    expect(trigger).toHaveFocus()
  })

  it('skips a disabled row when arrowing', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    render(
      <Harness
        items={[
          { kind: 'item', id: 'a', label: 'Alpha', onSelect: () => {} },
          { kind: 'item', id: 'b', label: 'Beta', onSelect: () => {}, disabled: true },
          { kind: 'item', id: 'c', label: 'Gamma', onSelect },
        ]}
      />
    )
    await openMenu(user)
    // Down twice: Alpha -> (skip Beta) -> Gamma
    await user.keyboard('{ArrowDown}{ArrowDown}{Enter}')
    expect(onSelect).toHaveBeenCalledTimes(1)
  })

  it('typeahead focuses the row whose label matches what was typed', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    render(
      <Harness
        items={[
          { kind: 'item', id: 'a', label: 'Alpha', onSelect: () => {} },
          { kind: 'item', id: 'b', label: 'Beta', onSelect: () => {} },
          { kind: 'item', id: 'g', label: 'Gamma', onSelect },
        ]}
      />
    )
    await openMenu(user)
    await user.keyboard('gam')
    await user.keyboard('{Enter}')
    expect(onSelect).toHaveBeenCalledTimes(1)
  })
})

describe('menu — dismissal', () => {
  it('closes when clicking outside', async () => {
    const user = userEvent.setup()
    render(
      <div>
        <span data-testid="outside">elsewhere</span>
        <Harness items={[{ kind: 'item', id: 'a', label: 'Alpha', onSelect: () => {} }]} />
      </div>
    )
    await openMenu(user)
    await user.click(screen.getByTestId('outside'))
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument())
  })
})

describe('menu — ARIA roles and state', () => {
  it('gives a check row role=menuitemcheckbox with aria-checked reflecting state', async () => {
    const user = userEvent.setup()
    render(
      <Harness
        items={[
          { kind: 'check', id: 'on', label: 'Explorer', checked: true, onSelect: () => {} },
          { kind: 'check', id: 'off', label: 'Bottom Dock', checked: false, onSelect: () => {} },
        ]}
      />
    )
    await openMenu(user)
    expect(screen.getByRole('menuitemcheckbox', { name: 'Explorer' })).toHaveAttribute(
      'aria-checked',
      'true'
    )
    expect(screen.getByRole('menuitemcheckbox', { name: 'Bottom Dock' })).toHaveAttribute(
      'aria-checked',
      'false'
    )
  })

  it('gives radio rows role=menuitemradio with exactly one checked in a group', async () => {
    const user = userEvent.setup()
    render(
      <Harness
        items={[
          { kind: 'radio', id: 'p', label: 'public', checked: true, group: 'schema', onSelect: () => {} },
          { kind: 'radio', id: 's', label: 'sales', checked: false, group: 'schema', onSelect: () => {} },
        ]}
      />
    )
    await openMenu(user)
    const radios = screen.getAllByRole('menuitemradio')
    expect(radios).toHaveLength(2)
    expect(radios.filter((r) => r.getAttribute('aria-checked') === 'true')).toHaveLength(1)
  })

  it('wraps a run of radio rows in a role=group container named after the group', async () => {
    // ARIA requires menuitemradio rows to live inside a `group`; that container
    // is what makes them ONE mutually-exclusive set rather than N unrelated
    // radios. An earlier version of renderNodes silently dropped `group`, and
    // the aria-checked assertion above happily passed anyway — which is exactly
    // why this test exists separately.
    const user = userEvent.setup()
    render(
      <Harness
        items={[
          { kind: 'radio', id: 'p', label: 'public', checked: true, group: 'schema', onSelect: () => {} },
          { kind: 'radio', id: 's', label: 'sales', checked: false, group: 'schema', onSelect: () => {} },
        ]}
      />
    )
    await openMenu(user)
    const group = screen.getByRole('group', { name: 'schema' })
    expect(within(group).getAllByRole('menuitemradio')).toHaveLength(2)
  })

  it('keeps two different radio groups in separate containers', async () => {
    // The database picker and the schema picker are distinct single-select sets;
    // fusing them would make selecting a schema appear to deselect a database.
    const user = userEvent.setup()
    render(
      <Harness
        items={[
          { kind: 'radio', id: 'db1', label: 'main', checked: true, group: 'database', onSelect: () => {} },
          { kind: 'radio', id: 'sc1', label: 'public', checked: true, group: 'schema', onSelect: () => {} },
        ]}
      />
    )
    await openMenu(user)
    expect(within(screen.getByRole('group', { name: 'database' })).getAllByRole('menuitemradio')).toHaveLength(1)
    expect(within(screen.getByRole('group', { name: 'schema' })).getAllByRole('menuitemradio')).toHaveLength(1)
  })

  it('does not fuse same-group radios that the author separated', async () => {
    // A separator between two runs means they were split on purpose; merging
    // them back into one container would contradict what is rendered.
    const user = userEvent.setup()
    render(
      <Harness
        items={[
          { kind: 'radio', id: 'a', label: 'alpha', checked: true, group: 'g', onSelect: () => {} },
          { kind: 'separator' },
          { kind: 'radio', id: 'b', label: 'beta', checked: false, group: 'g', onSelect: () => {} },
        ]}
      />
    )
    await openMenu(user)
    expect(screen.getAllByRole('group', { name: 'g' })).toHaveLength(2)
  })

  it('renders a section as an accessible group, not as a menu row', async () => {
    // A section label must not be announced as if it were selectable.
    const user = userEvent.setup()
    render(
      <Harness
        items={[
          {
            kind: 'section',
            label: 'Connection',
            children: [{ kind: 'item', id: 'a', label: 'Open', onSelect: () => {} }],
          },
        ]}
      />
    )
    await openMenu(user)
    const group = screen.getByRole('group', { name: 'Connection' })
    expect(within(group).getByRole('menuitem', { name: 'Open' })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'Connection' })).not.toBeInTheDocument()
  })

  it('renders a separator with role=separator and no menu row', async () => {
    const user = userEvent.setup()
    render(
      <Harness
        items={[
          { kind: 'item', id: 'a', label: 'Alpha', onSelect: () => {} },
          { kind: 'separator' },
          { kind: 'item', id: 'b', label: 'Beta', onSelect: () => {} },
        ]}
      />
    )
    await openMenu(user)
    expect(screen.getByRole('separator')).toBeInTheDocument()
    expect(screen.getAllByRole('menuitem')).toHaveLength(2)
  })
})

describe('menu — submenus', () => {
  const tree: MenuNode[] = [
    { kind: 'item', id: 'a', label: 'Alpha', onSelect: () => {} },
    {
      kind: 'submenu',
      id: 'export',
      label: 'Export',
      children: [
        { kind: 'item', id: 'csv', label: 'CSV', onSelect: () => {} },
        { kind: 'item', id: 'json', label: 'JSON', onSelect: () => {} },
      ],
    },
  ]

  it('opens a submenu with ArrowRight and focuses its first row', async () => {
    const user = userEvent.setup()
    render(<Harness items={tree} />)
    await openMenu(user)

    await user.keyboard('{ArrowDown}{ArrowDown}{ArrowRight}')
    await waitFor(() => expect(screen.getByRole('menuitem', { name: 'CSV' })).toBeInTheDocument())
  })

  it('selecting a nested row closes the WHOLE tree, not just the submenu', async () => {
    // The classic nested-menu bug: the submenu closes and the root is left
    // hanging open over the app.
    const user = userEvent.setup()
    const onSelect = vi.fn()
    render(
      <Harness
        items={[
          {
            kind: 'submenu',
            id: 'export',
            label: 'Export',
            children: [{ kind: 'item', id: 'csv', label: 'CSV', onSelect }],
          },
        ]}
      />
    )
    await openMenu(user)
    await user.keyboard('{ArrowDown}{ArrowRight}')
    await waitFor(() => expect(screen.getByRole('menuitem', { name: 'CSV' })).toBeInTheDocument())

    await user.click(screen.getByRole('menuitem', { name: 'CSV' }))

    expect(onSelect).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument())
  })

  it('a submenu trigger does not close the tree when it opens', async () => {
    const user = userEvent.setup()
    render(<Harness items={tree} />)
    await openMenu(user)
    await user.keyboard('{ArrowDown}{ArrowDown}{ArrowRight}')
    // Root menu is still mounted alongside the submenu.
    await waitFor(() => expect(screen.getAllByRole('menu').length).toBeGreaterThan(1))
  })
})

describe('menu — the icon gutter is a property of the level', () => {
  // If any row reserves the leading column, all of them must, or labels jag
  // left and right depending on their neighbours.

  it('reserves the gutter on every row when only one row has an icon', async () => {
    const user = userEvent.setup()
    render(
      <Harness
        items={[
          { kind: 'item', id: 'a', label: 'Alpha', onSelect: () => {}, icon: <svg /> },
          { kind: 'item', id: 'b', label: 'Beta', onSelect: () => {} },
        ]}
      />
    )
    await openMenu(user)
    const rows = screen.getAllByRole('menuitem')
    for (const row of rows) {
      expect(row.querySelector('[aria-hidden="true"]')).not.toBeNull()
    }
  })

  it('reserves no gutter when no row has an icon or a check', async () => {
    const user = userEvent.setup()
    render(
      <Harness
        items={[
          { kind: 'item', id: 'a', label: 'Alpha', onSelect: () => {} },
          { kind: 'item', id: 'b', label: 'Beta', onSelect: () => {} },
        ]}
      />
    )
    await openMenu(user)
    for (const row of screen.getAllByRole('menuitem')) {
      expect(row.querySelector('[aria-hidden="true"]')).toBeNull()
    }
  })

  it('reserves the gutter on an UNCHECKED row so the label does not shift when ticked', async () => {
    const user = userEvent.setup()
    render(
      <Harness
        items={[{ kind: 'check', id: 'off', label: 'Bottom Dock', checked: false, onSelect: () => {} }]}
      />
    )
    await openMenu(user)
    const row = screen.getByRole('menuitemcheckbox', { name: 'Bottom Dock' })
    expect(row.querySelector('[aria-hidden="true"]')).not.toBeNull()
  })
})

describe('ContextMenu', () => {
  const items: MenuNode[] = [{ kind: 'item', id: 'copy', label: 'Copy Name', onSelect: () => {} }]

  it('opens on right-click', async () => {
    // The previous test for this component rendered its children and never
    // right-clicked — the one interaction it exists for was untested.
    const user = userEvent.setup()
    render(
      <ContextMenu items={items}>
        <div>target</div>
      </ContextMenu>
    )
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    await user.pointer({ keys: '[MouseRight]', target: screen.getByText('target') })
    expect(await screen.findByRole('menu')).toBeInTheDocument()
  })

  it('does NOT open on left-click', async () => {
    const user = userEvent.setup()
    render(
      <ContextMenu items={items}>
        <div>target</div>
      </ContextMenu>
    )
    await user.click(screen.getByText('target'))
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('runs the row action and closes', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    render(
      <ContextMenu items={[{ kind: 'item', id: 'copy', label: 'Copy Name', onSelect }]}>
        <div>target</div>
      </ContextMenu>
    )
    await user.pointer({ keys: '[MouseRight]', target: screen.getByText('target') })
    await user.click(await screen.findByRole('menuitem', { name: 'Copy Name' }))
    expect(onSelect).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument())
  })

  it('closes on Escape', async () => {
    const user = userEvent.setup()
    render(
      <ContextMenu items={items}>
        <div>target</div>
      </ContextMenu>
    )
    await user.pointer({ keys: '[MouseRight]', target: screen.getByText('target') })
    await screen.findByRole('menu')
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument())
  })

  it('only the innermost menu opens when targets are nested', async () => {
    // Right-clicking a column must not also open the table's menu.
    const user = userEvent.setup()
    render(
      <ContextMenu items={[{ kind: 'item', id: 'outer', label: 'Outer Action', onSelect: () => {} }]}>
        <div>
          outer
          <ContextMenu items={[{ kind: 'item', id: 'inner', label: 'Inner Action', onSelect: () => {} }]}>
            <div>inner target</div>
          </ContextMenu>
        </div>
      </ContextMenu>
    )
    await user.pointer({ keys: '[MouseRight]', target: screen.getByText('inner target') })
    expect(await screen.findByRole('menuitem', { name: 'Inner Action' })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'Outer Action' })).not.toBeInTheDocument()
  })
})

describe('menu — compound API', () => {
  it('renders and activates rows built from compound components', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    render(
      <DropdownMenu trigger={<button>Open</button>}>
        <Menu.Item label="Save" shortcut="Ctrl+S" onSelect={onSelect} />
        <Menu.Separator />
        <Menu.Item label="Delete" tone="danger" onSelect={() => {}} />
      </DropdownMenu>
    )
    await openMenu(user)
    await user.click(screen.getByRole('menuitem', { name: /Save/ }))
    expect(onSelect).toHaveBeenCalledTimes(1)
  })

  it('throws a legible error when a row is rendered outside a menu', () => {
    // Guards the context contract: a bare <Menu.Item> should fail loudly at the
    // call-site rather than silently render a dead button.
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => render(<Menu.Item label="Orphan" onSelect={() => {}} />)).toThrow(
      /must be rendered inside/i
    )
    spy.mockRestore()
  })
})
