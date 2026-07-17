import type { Meta, StoryObj } from '@storybook/react-vite'
import { Progress } from './Progress'

const meta = {
  title: 'Primitives/Feedback/Progress',
  component: Progress,
  argTypes: {
    value: { control: { type: 'range', min: 0, max: 100, step: 1 } },
    max: { control: 'number' },
    size: { control: 'inline-radio', options: ['sm', 'md', 'lg'] },
    tone: { control: 'inline-radio', options: ['default', 'accent', 'success', 'warning', 'error'] },
  },
} satisfies Meta<typeof Progress>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    value: 60,
    max: 100,
    'aria-label': 'Upload progress',
  },
  decorators: [(Story) => <div style={{ width: 320 }}><Story /></div>],
}

export const States: Story = {
  render: () => (
    <div style={{ width: 320, display: 'flex', flexDirection: 'column', gap: 12 }}>
      {[0, 25, 50, 75, 100].map((value) => (
        <div key={value}>
          <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginBottom: 4 }}>{value}%</div>
          <Progress value={value} aria-label={`Progress ${value}%`} />
        </div>
      ))}
    </div>
  ),
}

export const Sizes: Story = {
  render: () => (
    <div style={{ width: 320, display: 'flex', flexDirection: 'column', gap: 12 }}>
      {(['sm', 'md', 'lg'] as const).map((size) => (
        <div key={size}>
          <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginBottom: 4 }}>{size}</div>
          <Progress value={60} size={size} aria-label={`Progress ${size}`} />
        </div>
      ))}
    </div>
  ),
}

export const Tones: Story = {
  render: () => (
    <div style={{ width: 320, display: 'flex', flexDirection: 'column', gap: 12 }}>
      {(['default', 'accent', 'success', 'warning', 'error'] as const).map((tone) => (
        <div key={tone}>
          <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginBottom: 4 }}>{tone}</div>
          <Progress value={60} tone={tone} aria-label={`Progress ${tone}`} />
        </div>
      ))}
    </div>
  ),
}
