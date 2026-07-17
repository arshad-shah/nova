import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import type { QueryTab, TableTab } from '@shared/types'
import { TabItem } from './TabItem'

function makeQueryTab(overrides: Partial<QueryTab> = {}): QueryTab {
  return {
    id: 'q1',
    type: 'query',
    title: 'SELECT * FROM users',
    connectionId: 'conn-1',
    schema: 'public',
    sql: 'SELECT 1;',
    results: null,
    isExecuting: false,
    error: null,
    isDirty: false,
    ...overrides,
  }
}

function makeTableTab(overrides: Partial<TableTab> = {}): TableTab {
  return {
    id: 't1',
    type: 'table',
    title: 'users',
    connectionId: 'conn-1',
    tableName: 'users',
    schema: 'public',
    ...overrides,
  }
}

const noopDrag = fn()

const meta: Meta<typeof TabItem> = {
  title: 'Components/Shell/TabBar/TabItem',
  component: TabItem,
  parameters: { layout: 'centered' },
  args: {
    index: 0,
    isDragged: false,
    isDropTarget: false,
    contextMenuItems: [
      { label: 'Close', onSelect: fn() },
      { label: 'Close Others', onSelect: fn() },
    ],
    onActivate: fn(),
    onClose: fn(),
    onDragStart: noopDrag,
    onDragOver: noopDrag,
    onDragEnd: fn(),
    tabIndex: 0,
    onFocus: fn(),
  },
  decorators: [
    (Story) => (
      <div className="flex items-end h-(--tab-bar-h) bg-bg-secondary px-2">
        <Story />
      </div>
    ),
  ],
}
export default meta
type Story = StoryObj<typeof meta>

export const ActiveQuery: Story = {
  args: { tab: makeQueryTab(), isActive: true },
}

export const InactiveQuery: Story = {
  args: { tab: makeQueryTab({ title: 'Background query' }), isActive: false },
}

export const DirtyQuery: Story = {
  args: { tab: makeQueryTab({ title: 'Unsaved query', isDirty: true }), isActive: true },
}

export const TableTabStory: Story = {
  name: 'Table Tab',
  args: { tab: makeTableTab(), isActive: false },
}

export const DropTarget: Story = {
  args: { tab: makeQueryTab(), isActive: false, isDropTarget: true },
}
