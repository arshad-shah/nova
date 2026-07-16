import type { Meta, StoryObj } from '@storybook/react-vite'
import { Card } from './Card'
import { GradientSurface } from './GradientSurface'
import { Button } from '../forms/Button'

const VARIANTS = ['default', 'elevated', 'outline', 'ghost', 'glass'] as const
const PADDINGS = ['none', 'sm', 'md', 'lg', 'xl'] as const
const RADII = ['md', 'lg', 'xl'] as const

const meta = {
  title: 'Primitives/Surfaces/Card',
  component: Card,
  argTypes: {
    variant: { control: 'select', options: VARIANTS },
    padding: { control: 'select', options: PADDINGS },
    radius: { control: 'inline-radio', options: RADII },
    interactive: { control: 'boolean' },
  },
} satisfies Meta<typeof Card>

export default meta
type Story = StoryObj<typeof meta>

function Body() {
  return (
    <>
      <div className="mb-1 text-[13px] font-semibold text-text-primary">Card title</div>
      <div className="text-xs leading-relaxed text-text-muted">
        This is a supporting description that provides additional information about the content.
      </div>
      <div className="mt-2 text-xs text-accent">Action ›</div>
    </>
  )
}

export const Default: Story = {
  args: { padding: 'md', children: <Body />, className: 'w-70' },
}

/** A ladder of how much the surface asserts itself, from `elevated` (lifted off
 *  the page) down to `ghost` (only the padding is real). Picking one is picking
 *  how much the container should compete with its contents — in a dense tool,
 *  usually less than you'd think. */
export const Variants: Story = {
  render: () => (
    <div className="flex flex-wrap gap-4">
      {VARIANTS.map((variant) => (
        <div key={variant} className="w-52">
          <div className="mb-2 text-[10px] text-text-muted">{variant}</div>
          <Card variant={variant}>
            <Body />
          </Card>
        </div>
      ))}
    </div>
  ),
}

/** `glass` is only meaningful ON something — over a plain background it's just
 *  a slightly lighter card. It's built from the theme's own surface token via
 *  color-mix rather than a white wash, so it doesn't invert on a light theme. */
export const Glass: Story = {
  render: () => (
    <GradientSurface intensity="bold" className="rounded-xl p-8">
      <div className="flex gap-4">
        <Card variant="glass" className="w-52">
          <Body />
        </Card>
        <Card variant="default" className="w-52">
          <Body />
        </Card>
      </div>
      <p className="mt-4 text-[10px] text-text-muted">
        glass (left) blurs what's behind it; default (right) is opaque.
      </p>
    </GradientSurface>
  ),
}

/** There is deliberately no `gradient` variant. GradientSurface already paints
 *  a theme-derived gradient, and the design law in tokens.css reserves the
 *  brand gradient for hero/splash/empty-state moments — "never on repeated
 *  actions, hovers, borders-at-large". A variant here would make breaking that
 *  one keystroke away on any card. Compose instead. */
export const BrandMoment: Story = {
  render: () => (
    <GradientSurface intensity="bold" className="w-70 rounded-xl">
      <Card variant="ghost" padding="xl">
        <Body />
      </Card>
    </GradientSurface>
  ),
}

export const Padding: Story = {
  render: () => (
    <div className="flex w-70 flex-col gap-3">
      {PADDINGS.map((padding) => (
        <Card key={padding} padding={padding}>
          <div className="text-xs text-text-primary">padding="{padding}"</div>
        </Card>
      ))}
      <p className="text-[10px] text-text-muted">
        The kit specifies 24px (`xl`). It's available but not the default — Verql is a dense SQL IDE
        and 24px on every card would inflate the whole app.
      </p>
    </div>
  ),
}

export const Radius: Story = {
  render: () => (
    <div className="flex gap-4">
      {RADII.map((radius) => (
        <div key={radius} className="w-40">
          <div className="mb-2 text-[10px] text-text-muted">radius="{radius}"</div>
          <Card radius={radius}>
            <div className="text-xs text-text-primary">Card</div>
          </Card>
        </div>
      ))}
    </div>
  ),
}

/** `interactive` supplies the hover-lift and focus-ring *styling* only — it
 *  doesn't make the card a button. A clickable card wraps it in
 *  `Button variant="bare" size="none"`, which already owns focus, keyboard and
 *  disabled; a div with role="button" reimplements half of that and gets it
 *  wrong. */
export const Interactive: Story = {
  render: () => (
    <div className="flex gap-4">
      <div className="w-52">
        <div className="mb-2 text-[10px] text-text-muted">static</div>
        <Card>
          <Body />
        </Card>
      </div>
      <div className="w-52">
        <div className="mb-2 text-[10px] text-text-muted">interactive — hover me</div>
        <Button variant="bare" size="none" className="w-full text-left">
          <Card interactive className="w-full">
            <Body />
          </Card>
        </Button>
      </div>
    </div>
  ),
}
