import type { Meta, StoryObj } from '@storybook/react-vite'
import { ResultsPanel } from './ResultsPanel'
import type { QueryResult } from '@shared/types'

// ResultsPanel composes the grid + status bar (and, when a tabId/sql is given,
// the plugin actions slot + AI explain strip). With the global electronAPI stub
// and no seeded plugin contributions / explanation, the plugin slot and explain
// strip render nothing, so the panel shows the grid over the status bar — its
// core layout. The grid needs a sized parent, so each story has a fixed-height
// wrapper.

const result: QueryResult = {
  rows: Array.from({ length: 80 }, (_, i) => ({
    id: i + 1,
    product: ['Widget', 'Gadget', 'Sprocket'][i % 3],
    price: Math.round(Math.random() * 10000) / 100,
    in_stock: i % 4 !== 0,
  })),
  fields: [
    { name: 'id', dataType: 'int4', nullable: false },
    { name: 'product', dataType: 'text', nullable: false },
    { name: 'price', dataType: 'numeric', nullable: true },
    { name: 'in_stock', dataType: 'bool', nullable: false },
  ],
  rowCount: 80,
  duration: 21,
  affectedRows: 0,
}

const meta: Meta<typeof ResultsPanel> = {
  title: 'Components/Results/ResultsPanel',
  component: ResultsPanel,
  decorators: [
    (Story) => (
      <div style={{ width: 820, height: 440, maxWidth: '100%', border: '1px solid var(--color-border-default)' }}>
        <Story />
      </div>
    ),
  ],
}
export default meta
type Story = StoryObj<typeof meta>

/** Grid + status bar for a SELECT result, with no tab context (no plugin slot). */
export const Default: Story = {
  args: { results: result },
}

/** With a tab + sql context — the plugin actions slot and explain strip are
 *  present but empty here (no contributions / explanation seeded). */
export const WithTabContext: Story = {
  args: {
    results: result,
    tabId: 'sb-tab',
    sql: 'SELECT id, product, price, in_stock FROM products;',
  },
}

/** A write statement result — status bar surfaces affected rows over an empty grid. */
export const WriteResult: Story = {
  args: {
    results: {
      rows: [],
      fields: [],
      rowCount: 0,
      duration: 33,
      affectedRows: 12,
    },
  },
}
