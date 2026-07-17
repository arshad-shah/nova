import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect } from 'storybook/test'
import { StatusDot } from './StatusDot'

const SIZES = ['xs', 'sm', 'md'] as const
const TONES = ['success', 'warning', 'error', 'muted', 'accent', 'info'] as const

const meta = {
  title: 'Primitives/Feedback/StatusDot',
  component: StatusDot,
  argTypes: {
    size: { control: 'select', options: SIZES },
    tone: { control: 'select', options: TONES },
    pulse: { control: 'boolean' },
    glow: { control: 'boolean' },
    label: { control: 'text' },
  },
} satisfies Meta<typeof StatusDot>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    size: 'sm',
    tone: 'success',
  },
}

/** Every tone at every size — the full grid a caller can reach for. */
export const Sizes: Story = {
  render: () => (
    <div className="flex flex-col gap-3">
      {TONES.map((tone) => (
        <div key={tone} className="flex items-center gap-3">
          <span className="w-14 text-xs text-text-secondary">{tone}</span>
          {SIZES.map((size) => (
            <StatusDot key={size} size={size} tone={tone} />
          ))}
        </div>
      ))}
    </div>
  ),
}

/** Six tones — `tone` is what it MEANS, matching `Badge`/`Alert`'s vocabulary. */
export const Tones: Story = {
  render: () => (
    <div className="flex items-center gap-3">
      {TONES.map((tone) => (
        <StatusDot key={tone} tone={tone} size="md" />
      ))}
    </div>
  ),
}

/** `pulse` says "live/changing right now"; `glow` says "this is the one that
 *  matters" — a halo, not an animation. Independent of each other. */
export const PulseAndGlow: Story = {
  render: () => (
    <div className="flex items-center gap-6">
      <div className="flex items-center gap-2">
        <StatusDot tone="success" size="md" />
        <span className="text-xs text-text-secondary">plain</span>
      </div>
      <div className="flex items-center gap-2">
        <StatusDot tone="success" size="md" pulse />
        <span className="text-xs text-text-secondary">pulse</span>
      </div>
      <div className="flex items-center gap-2">
        <StatusDot tone="success" size="md" glow />
        <span className="text-xs text-text-secondary">glow</span>
      </div>
      <div className="flex items-center gap-2">
        <StatusDot tone="success" size="md" pulse glow />
        <span className="text-xs text-text-secondary">pulse + glow</span>
      </div>
    </div>
  ),
}

/** Decorative by default (`aria-hidden`). Passing `label` makes the dot the
 *  sole carrier of the information: it becomes `role="status"` with that
 *  accessible name instead of being hidden. */
export const AccessibleLabel: Story = {
  args: {
    tone: 'error',
    size: 'md',
    label: 'Disconnected',
  },
  play: async ({ canvas }) => {
    const dot = await canvas.findByRole('status', { name: 'Disconnected' })
    await expect(dot).toBeInTheDocument()
  },
}
