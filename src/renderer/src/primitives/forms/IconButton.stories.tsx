import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn, expect, userEvent } from 'storybook/test'
import { Settings, X, Star, RefreshCw, Trash2 } from 'lucide-react'
import { IconButton } from './Button'

const VARIANTS = ['solid', 'subtle', 'outline', 'ghost', 'error'] as const
const SIZES = ['xs', 'sm', 'md', 'lg', 'xl'] as const

const meta: Meta<typeof IconButton> = {
  title: 'Primitives/Forms/IconButton',
  component: IconButton,
  argTypes: {
    variant: {
      control: 'select',
      options: [...VARIANTS, 'tab-action', 'bare'],
    },
    size: {
      control: 'select',
      options: [...SIZES, 'tab-action', 'none'],
    },
    shape: { control: 'inline-radio', options: ['square', 'circle'] },
    disabled: { control: 'boolean' },
    loading: { control: 'boolean' },
  },
}
export default meta
type Story = StoryObj<typeof IconButton>

export const Default: Story = {
  args: {
    variant: 'ghost',
    size: 'md',
    shape: 'square',
    label: 'Settings',
    children: <Settings size={15} />,
    onClick: fn(),
  },
  play: async ({ args, canvas }) => {
    const button = canvas.getByRole('button', { name: /settings/i })
    await userEvent.click(button)
    await expect(args.onClick).toHaveBeenCalledOnce()
  },
}

/** The variant set is kept in step with Button's — the two are the same
 *  control with and without a label. */
export const Variants: Story = {
  render: () => (
    <div className="flex flex-col gap-6">
      {VARIANTS.map((variant) => (
        <div key={variant} className="flex items-center gap-3">
          <span className="w-16 text-xs text-text-muted">{variant}</span>
          {SIZES.map((size) => (
            <IconButton key={size} variant={variant} size={size} label={`${variant} ${size}`}>
              <X size={14} />
            </IconButton>
          ))}
        </div>
      ))}
    </div>
  ),
}

/** `shape` is its own axis, independent of `size`: an avatar menu and a
 *  toolbar button are the same 32px box, and only one of them is a pill. */
export const Shapes: Story = {
  render: () => (
    <div className="flex flex-col gap-6">
      {(['square', 'circle'] as const).map((shape) => (
        <div key={shape} className="flex items-center gap-3">
          <span className="w-16 text-xs text-text-muted">{shape}</span>
          {SIZES.map((size) => (
            <IconButton
              key={size}
              shape={shape}
              size={size}
              variant="solid"
              label={`${shape} ${size}`}
            >
              <Star size={14} />
            </IconButton>
          ))}
        </div>
      ))}
    </div>
  ),
}

/** `loading` swaps the icon for a spinner. There's no width to preserve —
 *  the box is fixed by `size` — so the spinner simply stands in. */
export const Loading: Story = {
  render: () => (
    <div className="flex items-center gap-3">
      {VARIANTS.map((variant) => (
        <IconButton key={variant} variant={variant} loading label={`Refreshing (${variant})`}>
          <RefreshCw size={14} />
        </IconButton>
      ))}
    </div>
  ),
  play: async ({ canvas }) => {
    const busy = canvas.getAllByRole('button', { busy: true })
    await expect(busy.length).toBeGreaterThan(0)
    await expect(busy[0]).toBeDisabled()
  },
}

/** `tab-action` is the close affordance on a tab: a 16px circular hit area
 *  that only colours up on hover, so a row of tabs doesn't read as a row of
 *  buttons. */
export const TabAction: Story = {
  render: () => (
    <div className="flex items-center gap-2 rounded-md bg-bg-secondary px-3 py-2">
      <span className="text-xs text-text-primary">users.sql</span>
      <IconButton variant="tab-action" size="tab-action" label="Close users.sql">
        <X size={10} />
      </IconButton>
    </div>
  ),
}

export const States: Story = {
  render: () => (
    <div className="flex flex-col gap-4">
      {VARIANTS.map((variant) => (
        <div key={variant} className="flex items-center gap-3">
          <span className="w-16 text-xs text-text-muted">{variant}</span>
          <IconButton variant={variant} label={`${variant} default`}>
            <Trash2 size={14} />
          </IconButton>
          <IconButton variant={variant} disabled label={`${variant} disabled`}>
            <Trash2 size={14} />
          </IconButton>
          <IconButton variant={variant} loading label={`${variant} loading`}>
            <Trash2 size={14} />
          </IconButton>
        </div>
      ))}
      <p className="text-xs text-text-muted">
        Focus rings are keyboard-only — tab through the rows above to see them.
      </p>
    </div>
  ),
}
