import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn, expect, userEvent } from 'storybook/test'
import { Button } from './Button'

const meta: Meta<typeof Button> = {
  title: 'Primitives/Forms/Button',
  component: Button,
  argTypes: {
    variant: {
      control: 'select',
      options: ['solid', 'outline', 'ghost', 'error', 'bare'],
    },
    size: {
      control: 'select',
      options: ['xs', 'sm', 'md', 'lg', 'xl', 'none'],
    },
    disabled: { control: 'boolean' },
  },
}
export default meta
type Story = StoryObj<typeof Button>

export const Default: Story = {
  args: { children: 'Button', variant: 'solid', size: 'md', onClick: fn() },
  play: async ({ args, canvas }) => {
    const button = canvas.getByRole('button', { name: /button/i })
    await userEvent.click(button)
    await expect(args.onClick).toHaveBeenCalledOnce()
  },
}

export const Variants: Story = {
  render: () => (
    <div className="flex flex-col gap-6">
      {(['solid', 'outline', 'ghost', 'error'] as const).map((variant) => (
        <div key={variant} className="flex items-center gap-3">
          <span className="w-16 text-xs text-text-muted">{variant}</span>
          {(['xs', 'sm', 'md', 'lg', 'xl'] as const).map((size) => (
            <Button key={size} variant={variant} size={size}>
              {size}
            </Button>
          ))}
        </div>
      ))}
    </div>
  ),
}

/** `bare` + `size="none"` strips every bit of chrome — no fill, no text
 *  colour, no height/padding/radius — so the caller owns the whole look. It
 *  exists so a bespoke clickable (a row, a tab, a chip) can stay inside the
 *  design system instead of dropping to a native `<button>`, and still get the
 *  focus ring and disabled handling for free. */
export const Bare: Story = {
  render: () => (
    <div className="flex items-center gap-4">
      <Button variant="bare" size="none" className="text-xs text-text-muted hover:text-text-primary">
        bare + none
      </Button>
      <Button
        variant="bare"
        size="none"
        className="flex items-center gap-2 rounded-lg border border-border-default bg-bg-secondary px-3 py-2 text-xs text-text-primary hover:bg-hover"
      >
        caller-owned chrome
      </Button>
      <Button variant="bare" size="none" disabled className="text-xs text-text-primary">
        disabled
      </Button>
    </div>
  ),
}

export const States: Story = {
  render: () => (
    <div className="flex items-center gap-3">
      <Button>Default</Button>
      <Button disabled>Disabled</Button>
    </div>
  ),
}
