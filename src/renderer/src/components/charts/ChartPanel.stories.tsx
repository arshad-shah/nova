import type { Meta, StoryObj } from '@storybook/react-vite'
import { ChartPanel } from './ChartPanel'
import type { QueryResult } from '@shared/types'

const categorical: QueryResult = {
  fields: [
    { name: 'region', dataType: 'text', nullable: false },
    { name: 'revenue', dataType: 'numeric', nullable: false },
  ],
  rows: [
    { region: 'North', revenue: 4200 },
    { region: 'South', revenue: 3100 },
    { region: 'East', revenue: 5400 },
    { region: 'West', revenue: 2800 },
  ],
  rowCount: 4,
  duration: 12,
  affectedRows: 0,
}

const timeseries: QueryResult = {
  fields: [
    { name: 'day', dataType: 'date', nullable: false },
    { name: 'signups', dataType: 'integer', nullable: false },
  ],
  rows: [
    { day: '2026-01-01', signups: 120 },
    { day: '2026-01-02', signups: 180 },
    { day: '2026-01-03', signups: 150 },
    { day: '2026-01-04', signups: 240 },
  ],
  rowCount: 4,
  duration: 9,
  affectedRows: 0,
}

const singleColumn: QueryResult = {
  fields: [{ name: 'id', dataType: 'integer', nullable: false }],
  rows: [{ id: 1 }, { id: 2 }, { id: 3 }],
  rowCount: 3,
  duration: 3,
  affectedRows: 0,
}

const meta: Meta<typeof ChartPanel> = {
  title: 'Components/Charts/ChartPanel',
  component: ChartPanel,
  decorators: [
    (Story) => (
      <div style={{ width: 720, height: 420 }}>
        <Story />
      </div>
    ),
  ],
}
export default meta
type Story = StoryObj<typeof meta>

/** Categorical result — auto-detects a bar chart, with type/axis controls. */
export const Categorical: Story = {
  args: { results: categorical },
}

/** Date + numeric result — auto-detects a line chart. */
export const TimeSeries: Story = {
  args: { results: timeseries },
}

/** Fewer than two columns — shows the "needs two columns" hint. */
export const NotEnoughColumns: Story = {
  args: { results: singleColumn },
}
