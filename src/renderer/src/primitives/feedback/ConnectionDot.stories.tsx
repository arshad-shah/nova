import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect } from 'storybook/test'
import { ConnectionDot } from './ConnectionDot'

const SIZES = ['sm', 'md'] as const
const STATES = ['neutral', 'connected', 'disconnected'] as const

const meta = {
  title: 'Primitives/Feedback/ConnectionDot',
  component: ConnectionDot,
  argTypes: {
    size: { control: 'select', options: SIZES },
    state: { control: 'select', options: STATES },
    color: { control: 'color' },
    label: { control: 'text' },
  },
} satisfies Meta<typeof ConnectionDot>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    size: 'sm',
    state: 'neutral',
  },
}

/** Every state at every size, using each state's own fallback colour (no
 *  `color` passed) — this is what a connection with no custom colour looks
 *  like in each context. */
export const States: Story = {
  render: () => (
    <div className="flex flex-col gap-3">
      {STATES.map((state) => (
        <div key={state} className="flex items-center gap-3">
          <span className="w-24 text-xs text-text-secondary">{state}</span>
          {SIZES.map((size) => (
            <ConnectionDot key={size} size={size} state={state} />
          ))}
        </div>
      ))}
    </div>
  ),
}

/** A custom connection colour always wins over the state's fallback — only
 *  the `connected` glow / `disconnected` dimming+ring are still driven by
 *  `state`. */
export const CustomColor: Story = {
  render: () => (
    <div className="flex flex-col gap-3">
      {STATES.map((state) => (
        <div key={state} className="flex items-center gap-3">
          <span className="w-24 text-xs text-text-secondary">{state}</span>
          <ConnectionDot size="md" state={state} color="#ff7a45" />
        </div>
      ))}
    </div>
  ),
}

/** `neutral` — the connection picker's own list, where the surrounding UI
 *  already conveys connection state; falls back to accent, no ring/glow. */
export const Neutral: Story = {
  args: {
    size: 'sm',
    state: 'neutral',
  },
}

/** `connected` — falls back to success, with a colour-matched halo. */
export const Connected: Story = {
  args: {
    size: 'md',
    state: 'connected',
  },
}

/** `disconnected` — falls back to the disabled text color, dimmed to 45%
 *  opacity with a faint inset ring instead of a glow. */
export const Disconnected: Story = {
  args: {
    size: 'md',
    state: 'disconnected',
  },
}

/** Decorative by default (`aria-hidden`, inherited from `StatusDot`). Passing
 *  `label` makes the dot the sole carrier of the information. */
export const AccessibleLabel: Story = {
  args: {
    state: 'connected',
    size: 'md',
    label: 'Connected',
  },
  play: async ({ canvas }) => {
    const dot = await canvas.findByRole('status', { name: 'Connected' })
    await expect(dot).toBeInTheDocument()
  },
}
