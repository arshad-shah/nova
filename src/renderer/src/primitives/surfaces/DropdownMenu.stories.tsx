import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn, expect, userEvent, screen } from 'storybook/test'
import { useState } from 'react'
import {
  ChevronDown,
  Database,
  Plus,
  Download,
  Trash2,
  Settings,
  FileJson,
  FileSpreadsheet,
} from 'lucide-react'
import { DropdownMenu } from './DropdownMenu'
import { Menu } from './menu'
import type { MenuNode } from './menu/types'
import { Button } from '../forms/Button'

const meta = {
  title: 'Primitives/Surfaces/DropdownMenu',
  component: DropdownMenu,
  parameters: {
    docs: {
      description: {
        component:
          'A menu opened by clicking a trigger. Fill it either declaratively with an `items` tree ' +
          '(for data-shaped menus, like the application menu) or with compound `Menu.*` children ' +
          '(for rows needing custom content). Both render the same implementation. `ContextMenu` ' +
          'and the app menu bar share the same core.',
      },
    },
  },
} satisfies Meta<typeof DropdownMenu>

export default meta
type Story = StoryObj<typeof meta>

const trigger = (label = 'Actions') => (
  <Button variant="outline">
    {label} <ChevronDown size={12} className="inline" />
  </Button>
)

const onRun = fn()

export const Default: Story = {
  render: () => (
    <DropdownMenu
      trigger={trigger()}
      items={[
        { kind: 'item', id: 'run', label: 'Run', onSelect: onRun },
        { kind: 'item', id: 'new-tab', label: 'New Tab', onSelect: fn() },
      ]}
    />
  ),
  play: async ({ canvas }) => {
    const user = userEvent.setup()
    await user.click(canvas.getByRole('button', { name: /actions/i }))
    // The menu renders in a FloatingPortal (document.body), so query via screen
    // rather than the story canvas.
    await user.click(await screen.findByRole('menuitem', { name: 'Run' }))
    await expect(onRun).toHaveBeenCalled()
  },
}

/** Every node kind at once — roughly the shape a real application menu takes. */
export const EveryNodeKind: Story = {
  render: function EveryNodeKindStory() {
    const [explorer, setExplorer] = useState(true)
    const [dock, setDock] = useState(false)
    const items: MenuNode[] = [
      {
        kind: 'section',
        label: 'Connection',
        children: [
          {
            kind: 'item',
            id: 'open',
            label: 'Open Connection',
            icon: <Database size={14} />,
            shortcut: 'CmdOrCtrl+O',
            onSelect: fn(),
          },
          {
            kind: 'item',
            id: 'new',
            label: 'New Query Tab',
            icon: <Plus size={14} />,
            shortcut: 'CmdOrCtrl+T',
            onSelect: fn(),
          },
        ],
      },
      { kind: 'separator' },
      {
        kind: 'section',
        label: 'View',
        children: [
          {
            kind: 'check',
            id: 'explorer',
            label: 'Show Explorer',
            checked: explorer,
            shortcut: 'CmdOrCtrl+B',
            onSelect: () => setExplorer((v) => !v),
          },
          {
            kind: 'check',
            id: 'dock',
            label: 'Bottom Dock',
            checked: dock,
            shortcut: 'CmdOrCtrl+J',
            onSelect: () => setDock((v) => !v),
          },
        ],
      },
      { kind: 'separator' },
      {
        kind: 'submenu',
        id: 'export',
        label: 'Export Results',
        icon: <Download size={14} />,
        children: [
          { kind: 'item', id: 'csv', label: 'CSV', icon: <FileSpreadsheet size={14} />, onSelect: fn() },
          { kind: 'item', id: 'json', label: 'JSON', icon: <FileJson size={14} />, onSelect: fn() },
        ],
      },
      { kind: 'separator' },
      {
        kind: 'item',
        id: 'delete',
        label: 'Delete Connection',
        icon: <Trash2 size={14} />,
        tone: 'danger',
        onSelect: fn(),
      },
    ]
    return <DropdownMenu trigger={trigger('Menu')} items={items} aria-label="Example menu" />
  },
}

/**
 * Radio rows form one mutually-exclusive set. Each `group` becomes a
 * `role="group"` container — that container is what makes them a set rather
 * than N unrelated radios.
 */
export const RadioGroups: Story = {
  render: function RadioGroupsStory() {
    const [db, setDb] = useState('main')
    const [schema, setSchema] = useState('public')
    const items: MenuNode[] = [
      ...['main', 'analytics'].map<MenuNode>((name) => ({
        kind: 'radio',
        id: `db-${name}`,
        group: 'Database',
        label: name,
        checked: db === name,
        onSelect: () => setDb(name),
      })),
      { kind: 'separator' },
      ...['public', 'sales', 'audit'].map<MenuNode>((name) => ({
        kind: 'radio',
        id: `schema-${name}`,
        group: 'Schema',
        label: name,
        checked: schema === name,
        onSelect: () => setSchema(name),
      })),
    ]
    return <DropdownMenu trigger={trigger(`${db} / ${schema}`)} items={items} />
  },
}

export const Sizes: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: 16 }}>
      {(['sm', 'md', 'lg'] as const).map((size) => (
        <DropdownMenu
          key={size}
          size={size}
          trigger={trigger(`size="${size}"`)}
          items={[
            {
              kind: 'item',
              id: 'run',
              label: 'Run',
              icon: <Database size={14} />,
              shortcut: 'CmdOrCtrl+Enter',
              onSelect: fn(),
            },
            { kind: 'item', id: 'settings', label: 'Settings', icon: <Settings size={14} />, onSelect: fn() },
          ]}
        />
      ))}
    </div>
  ),
}

/**
 * The icon gutter is a property of the LEVEL, not the row: if any row reserves
 * the leading column, every row does — otherwise labels jag left and right
 * depending on whether their neighbour happens to have an icon.
 */
export const IconGutterAlignment: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: 16 }}>
      <DropdownMenu
        trigger={trigger('Mixed icons')}
        items={[
          { kind: 'item', id: 'a', label: 'Has an icon', icon: <Database size={14} />, onSelect: fn() },
          { kind: 'item', id: 'b', label: 'Has none — still aligned', onSelect: fn() },
        ]}
      />
      <DropdownMenu
        trigger={trigger('No icons')}
        items={[
          { kind: 'item', id: 'a', label: 'No gutter reserved', onSelect: fn() },
          { kind: 'item', id: 'b', label: 'Tight against the edge', onSelect: fn() },
        ]}
      />
    </div>
  ),
}

export const Disabled: Story = {
  render: () => (
    <DropdownMenu
      trigger={trigger('Options')}
      items={[
        { kind: 'item', id: 'rename', label: 'Rename', onSelect: fn() },
        { kind: 'item', id: 'move', label: 'Move (unavailable)', onSelect: fn(), disabled: true },
        { kind: 'item', id: 'delete', label: 'Delete', tone: 'danger', onSelect: fn() },
      ]}
    />
  ),
}

/** Long lists cap their height against the viewport and scroll internally. */
export const LongList: Story = {
  render: () => (
    <DropdownMenu
      trigger={trigger('40 schemas')}
      items={Array.from({ length: 40 }, (_, i) => ({
        kind: 'item' as const,
        id: `schema-${i}`,
        label: `schema_${String(i).padStart(2, '0')}`,
        onSelect: fn(),
      }))}
    />
  ),
}

/** Compound children, for rows needing content a data tree cannot express. */
export const CompoundApi: Story = {
  render: () => (
    <DropdownMenu trigger={trigger('Connections')}>
      <Menu.Section label="Connected">
        <Menu.Item label="Production" onSelect={fn()}>
          <span className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full" style={{ background: 'var(--color-success)' }} />
            Production
            <span className="text-text-muted">· main</span>
          </span>
        </Menu.Item>
      </Menu.Section>
      <Menu.Separator />
      <Menu.RadioGroup label="Schema">
        <Menu.RadioItem label="public" checked onSelect={fn()} />
        <Menu.RadioItem label="sales" checked={false} onSelect={fn()} />
      </Menu.RadioGroup>
    </DropdownMenu>
  ),
}

/**
 * Controlled open, for when something other than the trigger must open the menu
 * — e.g. an action in one menu opening another.
 */
export const Controlled: Story = {
  render: function ControlledStory() {
    const [open, setOpen] = useState(false)
    return (
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <Button variant="outline" onClick={() => setOpen(true)}>
          Open from outside
        </Button>
        <DropdownMenu
          trigger={trigger('Its own trigger')}
          open={open}
          onOpenChange={setOpen}
          items={[{ kind: 'item', id: 'a', label: 'Alpha', onSelect: fn() }]}
        />
      </div>
    )
  },
}
