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
  // See TabBar.stories.tsx: the global a11y gate is 'todo' (report, never
  // fail). This component's whole point is an accessible tab strip, so it
  // gates itself.
  parameters: { layout: 'centered', a11y: { test: 'error' } },
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
    // A tab is only ever rendered inside a tablist — [role=tab] has a required
    // parent, and a bare TabItem is an `aria-required-parent` violation that
    // says more about the story than the component. Rendering the real context
    // also makes these stories the gate on that rule: TabBar.stories cannot
    // catch a regression in ContextMenu's presentational wrapper, because
    // there the tablist is a real ancestor either way.
    (Story) => (
      <div
        role="tablist"
        aria-label="Open tabs"
        className="flex items-end h-(--tab-bar-h) bg-bg-secondary px-2"
      >
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
