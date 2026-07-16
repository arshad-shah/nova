import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn, expect, userEvent } from 'storybook/test'
import { Alert } from './Alert'
import { Button } from '../forms/Button'
import { Badge } from '../data-display/Badge'

const VARIANTS = ['info', 'success', 'warning', 'error', 'neutral', 'update'] as const

const meta = {
  title: 'Primitives/Feedback/Alert',
  component: Alert,
  argTypes: {
    variant: { control: 'select', options: VARIANTS },
    type: { control: 'inline-radio', options: ['default', 'filled'] },
    title: { control: 'text' },
  },
  decorators: [(Story) => <div className="w-125"><Story /></div>],
} satisfies Meta<typeof Alert>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    variant: 'info',
    title: 'Information',
    children: 'Here is some information.',
    onClose: fn(),
  },
  play: async ({ canvas, args }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Close alert' }))
    await expect(args.onClose).toHaveBeenCalled()
  },
}

/** Six tones, resolved from `feedback/severity.ts` — the same table Toast reads
 *  from, so a warning is the same warning in both. Before that table existed,
 *  Alert tinted `info` with the accent (purple) while its own border used
 *  `--color-info` (cyan). */
export const Variants: Story = {
  args: { children: null },
  render: () => (
    <div className="flex flex-col gap-2">
      {VARIANTS.map((variant) => (
        <Alert key={variant} variant={variant} title={variant}>
          Here is some information.
        </Alert>
      ))}
    </div>
  ),
}

/** `type="filled"` is what used to be a whole second primitive.
 *
 *  `Banner` was Alert with different padding and no title. It had zero app
 *  usages while AutoCompactBanner hand-rolled a worse copy of it, and the two
 *  disagreed about `info`. `filled` is its job: solid, railed and tighter — a
 *  strip across a region that has to hold its own against everything below it. */
export const Filled: Story = {
  args: { children: null },
  render: () => (
    <div className="flex flex-col gap-2">
      {VARIANTS.map((variant) => (
        <Alert
          key={variant}
          variant={variant}
          type="filled"
          action={{ label: 'Learn more', onClick: fn() }}
          onClose={fn()}
        >
          {variant === 'update'
            ? "We've updated our Terms of Service."
            : 'Scheduled maintenance on May 25, 2:00 AM UTC.'}
        </Alert>
      ))}
    </div>
  ),
}

/** Most alerts are one line — 4 of the app's 7 pass no title. So an untitled
 *  body carries the line and stays primary; only a body *under* a title is a
 *  supporting line and gets muted. Without that rule an untitled error would
 *  render as muted grey text with a red dot. */
export const TitleAndBody: Story = {
  args: { children: null },
  render: () => (
    <div className="flex flex-col gap-2">
      <Alert variant="error">Plugin failed to activate: missing entry point.</Alert>
      <Alert variant="error" title="Plugin failed to activate">
        Missing entry point.
      </Alert>
      <Alert variant="info" title="Information">
        Your plan includes 10GB of storage. You&apos;ve used 6.2GB (62%).
      </Alert>
    </div>
  ),
}

/** The `{label, onClick}` action gets the tone's colour and a chevron for free.
 *  A node is still accepted where a caller genuinely needs two buttons. */
export const Actions: Story = {
  args: { children: null },
  render: () => (
    <div className="flex flex-col gap-2">
      <Alert variant="info" title="Information" action={{ label: 'View details', onClick: fn() }}>
        Here is some information.
      </Alert>
      <Alert variant="error" title="Error" action={{ label: 'Try again', onClick: fn() }}>
        Something went wrong.
      </Alert>
      <Alert
        variant="warning"
        type="filled"
        action={
          <>
            <Button size="xs" variant="solid">Run</Button>
            <Button size="xs" variant="ghost">Decline</Button>
          </>
        }
      >
        Allow the assistant to run this action?
      </Alert>
    </div>
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('button', { name: /view details/i })).toBeInTheDocument()
    await expect(canvas.getByRole('button', { name: 'Decline' })).toBeInTheDocument()
  },
}

/** The body is a slot, not a `<Text>`. The query-error view puts a whole
 *  subtree in here — paragraphs, a hint well, a code badge, a disclosure button
 *  — and a `<Text>` wrapper would nest block elements and buttons inside a span. */
export const RichBody: Story = {
  args: { children: null },
  render: () => (
    <Alert variant="error" title='syntax error at or near "SELCT"'>
      <p className="leading-relaxed">The driver rejected the statement before it ran.</p>
      <div className="mt-2 rounded-md bg-bg-inset px-3 py-2">
        <p className="text-text-secondary">Did you mean SELECT?</p>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <Badge tone="error">42601</Badge>
        <Button variant="bare" size="none" className="text-xs text-text-muted hover:text-text-primary">
          Show driver message
        </Button>
      </div>
    </Alert>
  ),
}

export const Dismissible: Story = {
  args: {
    variant: 'success',
    title: 'Success',
    children: 'Your changes were saved.',
    onClose: fn(),
  },
}
