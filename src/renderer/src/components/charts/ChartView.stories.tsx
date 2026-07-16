import type { Meta, StoryObj } from '@storybook/react-vite'
import { ChartView } from './ChartView'

const categorical = [
  { region: 'North', revenue: 4200 },
  { region: 'South', revenue: 3100 },
  { region: 'East', revenue: 5400 },
  { region: 'West', revenue: 2800 },
  { region: 'Central', revenue: 3900 },
]

const timeseries = [
  { day: '2026-01-01', signups: 120 },
  { day: '2026-01-02', signups: 180 },
  { day: '2026-01-03', signups: 150 },
  { day: '2026-01-04', signups: 240 },
  { day: '2026-01-05', signups: 300 },
]

const scatter = [
  { weight: 1.2, price: 19 },
  { weight: 2.4, price: 31 },
  { weight: 3.1, price: 44 },
  { weight: 4.8, price: 52 },
  { weight: 5.0, price: 70 },
]

const meta: Meta<typeof ChartView> = {
  title: 'Components/Charts/ChartView',
  component: ChartView,
  decorators: [
    (Story) => (
      <div style={{ width: 560, height: 320 }}>
        <Story />
      </div>
    ),
  ],
}
export default meta
type Story = StoryObj<typeof meta>

/** Categorical revenue by region. */
export const BarChart: Story = {
  args: { type: 'bar', data: categorical, xKey: 'region', yKey: 'revenue' },
}

/** Daily signups over time. */
export const LineChart: Story = {
  args: { type: 'line', data: timeseries, xKey: 'day', yKey: 'signups' },
}

/** Revenue share by region. */
export const PieChart: Story = {
  args: { type: 'pie', data: categorical, xKey: 'region', yKey: 'revenue' },
}

/** Two numeric dimensions plotted against each other. */
export const ScatterChart: Story = {
  args: { type: 'scatter', data: scatter, xKey: 'weight', yKey: 'price' },
}

/** No chartable shape / empty data — renders the "no chart available" message. */
export const Empty: Story = {
  args: { type: 'none', data: [], xKey: '', yKey: '' },
}
