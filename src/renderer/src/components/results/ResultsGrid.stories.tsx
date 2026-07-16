import type { Meta, StoryObj } from '@storybook/react-vite'
import { ResultsGrid } from './ResultsGrid'
import type { QueryResult } from '@shared/types'

// ResultsGrid renders the real AG Grid with a QueryResult's rows/columns,
// themed from the active theme tokens and the settings store's data-display
// preferences (both have working defaults, so no seeding is needed). The grid
// needs a sized parent to lay out, so every story is wrapped in a fixed-height
// box.

const usersResult: QueryResult = {
  rows: Array.from({ length: 120 }, (_, i) => ({
    id: i + 1,
    email: `user${i + 1}@acme.dev`,
    full_name: ['Ada Lovelace', 'Alan Turing', 'Grace Hopper', 'Edsger Dijkstra'][i % 4],
    is_active: i % 3 !== 0,
    balance: Math.round(Math.random() * 100000) / 100,
    created_at: new Date(Date.UTC(2024, 0, 1 + (i % 28))).toISOString(),
    notes: i % 5 === 0 ? null : 'A reasonably long note that may be truncated by the grid based on the data-display preferences.',
  })),
  fields: [
    { name: 'id', dataType: 'int4', nullable: false },
    { name: 'email', dataType: 'text', nullable: false },
    { name: 'full_name', dataType: 'text', nullable: false },
    { name: 'is_active', dataType: 'bool', nullable: false },
    { name: 'balance', dataType: 'numeric', nullable: true },
    { name: 'created_at', dataType: 'timestamptz', nullable: true },
    { name: 'notes', dataType: 'text', nullable: true },
  ],
  rowCount: 120,
  duration: 18,
  affectedRows: 0,
}

const meta: Meta<typeof ResultsGrid> = {
  title: 'Components/Results/ResultsGrid',
  component: ResultsGrid,
  decorators: [
    (Story) => (
      <div style={{ width: 820, height: 400, maxWidth: '100%' }}>
        <Story />
      </div>
    ),
  ],
}
export default meta
type Story = StoryObj<typeof meta>

/** Mixed-type result set: numbers, booleans, dates, nulls, and long text. */
export const Default: Story = {
  args: { results: usersResult, tabId: 'sb-tab' },
}

/** A single-column, single-row result (e.g. `SELECT count(*)`). */
export const SingleValue: Story = {
  args: {
    results: {
      rows: [{ count: 48213 }],
      fields: [{ name: 'count', dataType: 'int8', nullable: false }],
      rowCount: 1,
      duration: 4,
      affectedRows: 0,
    },
    tabId: 'sb-tab',
  },
}

/** Empty result — columns present but no rows. */
export const Empty: Story = {
  args: {
    results: {
      rows: [],
      fields: [
        { name: 'id', dataType: 'int4', nullable: false },
        { name: 'email', dataType: 'text', nullable: true },
      ],
      rowCount: 0,
      duration: 2,
      affectedRows: 0,
    },
    tabId: 'sb-tab',
  },
}

/** Many columns — exercises horizontal scrolling and header layout. */
export const ManyColumns: Story = {
  args: {
    results: {
      rows: Array.from({ length: 30 }, (_, r) =>
        Object.fromEntries(Array.from({ length: 16 }, (_, c) => [`col_${c}`, `r${r}c${c}`]))
      ),
      fields: Array.from({ length: 16 }, (_, c) => ({
        name: `col_${c}`,
        dataType: 'text',
        nullable: true,
      })),
      rowCount: 30,
      duration: 9,
      affectedRows: 0,
    },
    tabId: 'sb-tab',
  },
}
