import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, userEvent, screen } from 'storybook/test'
import { Copy, ExternalLink, Pencil, Trash2 } from 'lucide-react'
import { ContextMenu } from './ContextMenu'
import type { MenuNode } from './menu/types'

const meta = {
  title: 'Primitives/Surfaces/ContextMenu',
  component: ContextMenu,
  parameters: {
    docs: {
      description: {
        component:
          'A menu opened by right-clicking its children. Anchored to a virtual reference at the ' +
          'cursor, so it gets the same collision handling as every other menu and flips into view ' +
          'near a screen edge. Shares its core with `DropdownMenu` and the app menu bar, so it has ' +
          'keyboard navigation, typeahead and focus return.',
      },
    },
  },
} satisfies Meta<typeof ContextMenu>

export default meta
type Story = StoryObj<typeof meta>

const target = (label: string, width = 280) => (
  <div
    style={{
      width,
      height: 120,
      border: '2px dashed var(--color-border-default)',
      borderRadius: 8,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: 13,
      color: 'var(--color-text-secondary)',
      userSelect: 'none',
    }}
  >
    {label}
  </div>
)

const onOpenInNewTab = fn()

export const Default: Story = {
  render: () => (
    <ContextMenu
      items={[
        { kind: 'item', id: 'open', label: 'Open in new tab', icon: <ExternalLink size={14} />, onSelect: onOpenInNewTab },
        { kind: 'item', id: 'copy', label: 'Copy path', icon: <Copy size={14} />, onSelect: fn() },
        { kind: 'item', id: 'rename', label: 'Rename', icon: <Pencil size={14} />, onSelect: fn() },
        { kind: 'separator' },
        { kind: 'item', id: 'delete', label: 'Delete', icon: <Trash2 size={14} />, tone: 'danger', onSelect: fn() },
      ]}
    >
      {target('Right-click here to open context menu')}
    </ContextMenu>
  ),
  play: async ({ canvas }) => {
    await userEvent.pointer({
      keys: '[MouseRight]',
      target: canvas.getByText('Right-click here to open context menu'),
    })
    // The menu renders in a FloatingPortal (document.body), so query via screen
    // rather than the story canvas.
    const item = await screen.findByRole('menuitem', { name: 'Open in new tab' })
    await expect(item).toBeVisible()
    await userEvent.click(item)
    await expect(onOpenInNewTab).toHaveBeenCalledTimes(1)
  },
}

const sizeItems: MenuNode[] = [
  { kind: 'item', id: 'open', label: 'Open in new tab', onSelect: fn() },
  { kind: 'item', id: 'copy', label: 'Copy path', onSelect: fn() },
  { kind: 'item', id: 'rename', label: 'Rename', onSelect: fn() },
]

export const Sizes: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: 24 }}>
      {(['sm', 'md', 'lg'] as const).map((size) => (
        <ContextMenu key={size} size={size} items={sizeItems}>
          {target(`Right-click — size="${size}"`, 200)}
        </ContextMenu>
      ))}
    </div>
  ),
}

export const WithDisabledItems: Story = {
  render: () => (
    <ContextMenu
      items={[
        { kind: 'item', id: 'open', label: 'Open in new tab', onSelect: fn() },
        { kind: 'item', id: 'copy', label: 'Copy path', onSelect: fn() },
        { kind: 'item', id: 'rename', label: 'Rename', onSelect: fn(), disabled: true },
        { kind: 'item', id: 'delete', label: 'Delete', onSelect: fn(), disabled: true, tone: 'danger' },
      ]}
    >
      {target('Right-click to see disabled items')}
    </ContextMenu>
  ),
  play: async ({ canvas }) => {
    await userEvent.pointer({
      keys: '[MouseRight]',
      target: canvas.getByText('Right-click to see disabled items'),
    })
    await expect(await screen.findByRole('menuitem', { name: 'Rename' })).toBeDisabled()
    await expect(screen.getByRole('menuitem', { name: 'Delete' })).toBeDisabled()
    await expect(screen.getByRole('menuitem', { name: 'Open in new tab' })).not.toBeDisabled()
  },
}

/**
 * Nested targets: only the innermost menu opens. Right-clicking a column must
 * not also open its table's menu.
 */
export const NestedTargets: Story = {
  render: () => (
    <ContextMenu items={[{ kind: 'item', id: 'outer', label: 'Table action', onSelect: fn() }]}>
      <div
        style={{
          padding: 24,
          border: '2px dashed var(--color-border-default)',
          borderRadius: 8,
          fontSize: 13,
          color: 'var(--color-text-secondary)',
        }}
      >
        Outer (table)
        <ContextMenu items={[{ kind: 'item', id: 'inner', label: 'Column action', onSelect: fn() }]}>
          <div
            style={{
              marginTop: 12,
              padding: 16,
              border: '2px dashed var(--color-accent)',
              borderRadius: 6,
              color: 'var(--color-text-primary)',
            }}
          >
            Inner (column) — right-click me
          </div>
        </ContextMenu>
      </div>
    </ContextMenu>
  ),
  play: async ({ canvas }) => {
    await userEvent.pointer({
      keys: '[MouseRight]',
      target: canvas.getByText('Inner (column) — right-click me'),
    })
    await expect(await screen.findByRole('menuitem', { name: 'Column action' })).toBeVisible()
    await expect(screen.queryByRole('menuitem', { name: 'Table action' })).toBeNull()
  },
}
