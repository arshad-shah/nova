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
    // says more about the story than the component. This decorator supplies
    // that real ancestor so the a11y gate above (`error`, not the repo-default
    // `todo`) checks the same structure the app actually renders — including
    // ContextMenu's presentational wrapper between `tab` and its children,
    // which TabBar.stories also renders inside a real tablist and so equally
    // covers; this file's TabItem-focused stories aren't uniquely gating that
    // rule, they're just where TabItem itself is exercised in isolation.
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
