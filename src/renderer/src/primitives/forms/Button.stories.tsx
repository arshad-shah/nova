import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn, expect, userEvent } from 'storybook/test'
import { Play, Save, Trash2 } from 'lucide-react'
import { Button } from './Button'

const VARIANTS = ['solid', 'subtle', 'outline', 'ghost', 'error'] as const
const SIZES = ['xs', 'sm', 'md', 'lg', 'xl'] as const

const meta: Meta<typeof Button> = {
  title: 'Primitives/Forms/Button',
  component: Button,
  argTypes: {
    variant: {
      control: 'select',
      options: [...VARIANTS, 'bare'],
    },
    size: {
      control: 'select',
      options: [...SIZES, 'none'],
    },
    disabled: { control: 'boolean' },
    loading: { control: 'boolean' },
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

/** Every variant against every size. The variants are a hierarchy, not a
 *  palette: `solid` is the one action a screen is asking for, `subtle` is its
 *  companion, `outline`/`ghost` are chrome, `error` is destructive. */
export const Variants: Story = {
  render: () => (
    <div className="flex flex-col gap-6">
      {VARIANTS.map((variant) => (
        <div key={variant} className="flex items-center gap-3">
          <span className="w-16 text-xs text-text-muted">{variant}</span>
          {SIZES.map((size) => (
            <Button key={size} variant={variant} size={size}>
              {size}
            </Button>
          ))}
        </div>
      ))}
    </div>
  ),
}

/** `subtle` is the action colour at a quieter weight — a wash of the hue,
 *  labelled in the hue. It pairs with `solid` for a secondary action in the
 *  same task, where `outline` would read as unrelated chrome and a second
 *  `solid` would compete for the click. */
export const SubtlePairing: Story = {
  render: () => (
    <div className="flex items-center gap-2">
      <Button variant="solid" className="flex items-center gap-1.5">
        <Play size={13} />
        Run query
      </Button>
      <Button variant="subtle" className="flex items-center gap-1.5">
        <Save size={13} />
        Save
      </Button>
      <Button variant="ghost">Cancel</Button>
    </div>
  ),
}

/** `loading` shows a spinner and stops accepting clicks. The label is hidden
 *  rather than removed, so the button keeps its exact width — a button that
 *  resizes the moment you click it drags its neighbours out from under the
 *  cursor. Compare each pair: the widths match. */
export const Loading: Story = {
  render: () => (
    <div className="flex flex-col gap-4">
      {(['solid', 'subtle', 'outline', 'error'] as const).map((variant) => (
        <div key={variant} className="flex items-center gap-3">
          <span className="w-16 text-xs text-text-muted">{variant}</span>
          <Button variant={variant} className="flex items-center gap-1.5">
            <Play size={13} />
            Run query
          </Button>
          <Button variant={variant} loading className="flex items-center gap-1.5">
            <Play size={13} />
            Run query
          </Button>
        </div>
      ))}
      <div className="flex items-center gap-3">
        <span className="w-16 text-xs text-text-muted">sizes</span>
        {SIZES.map((size) => (
          <Button key={size} loading size={size} variant="solid">
            {size}
          </Button>
        ))}
      </div>
    </div>
  ),
  play: async ({ canvas }) => {
    // A loading button must be inert: busy to assistive tech, and unclickable
    // so an in-flight action can't be fired twice.
    const busy = canvas.getAllByRole('button', { busy: true })
    await expect(busy.length).toBeGreaterThan(0)
    await expect(busy[0]).toBeDisabled()
  },
}

/** `error` is a surface red that white text sits on — deliberately not the
 *  same red as error *text*, which is too light to carry a label. */
export const Destructive: Story = {
  render: () => (
    <div className="flex items-center gap-3">
      <Button variant="error" className="flex items-center gap-1.5">
        <Trash2 size={13} />
        Drop table
      </Button>
      <Button variant="error" loading className="flex items-center gap-1.5">
        <Trash2 size={13} />
        Drop table
      </Button>
      <Button variant="error" disabled className="flex items-center gap-1.5">
        <Trash2 size={13} />
        Drop table
      </Button>
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

/** Every state a button can be in, across the variants that render chrome. */
export const States: Story = {
  render: () => (
    <div className="flex flex-col gap-4">
      {VARIANTS.map((variant) => (
        <div key={variant} className="flex items-center gap-3">
          <span className="w-16 text-xs text-text-muted">{variant}</span>
          <Button variant={variant}>Default</Button>
          <Button variant={variant} disabled>
            Disabled
          </Button>
          <Button variant={variant} loading>
            Loading
          </Button>
        </div>
      ))}
      <p className="text-xs text-text-muted">
        Focus rings are keyboard-only — tab through the row above to see them.
      </p>
    </div>
  ),
}
