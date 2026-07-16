import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn, expect, userEvent } from 'storybook/test'
import { Toast } from './Toast'

const VARIANTS = ['success', 'info', 'warning', 'error', 'neutral'] as const

const meta = {
  title: 'Primitives/Feedback/Toast',
  component: Toast,
  argTypes: {
    variant: { control: 'select', options: VARIANTS },
    title: { control: 'text' },
    description: { control: 'text' },
    duration: { control: 'number' },
    loading: { control: 'boolean' },
  },
  decorators: [(Story) => <div className="w-95"><Story /></div>],
} satisfies Meta<typeof Toast>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    variant: 'success',
    title: 'Changes saved',
    description: 'Your profile has been updated.',
    onDismiss: fn(),
  },
  play: async ({ canvas, args }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Dismiss' }))
    await expect(args.onDismiss).toHaveBeenCalled()
  },
}

/** Five variants on ONE neutral surface — only the mark is coloured.
 *
 *  That's the difference from Alert, and it's deliberate: an Alert sits in
 *  content and has to be found, so it wears its colour. A toast already has
 *  your attention, and five stacked in five different colours is a fruit
 *  salad. Both read their tone from `feedback/severity.ts`, so a warning is
 *  the same warning in each — they differ in how much of it they wear. */
export const Variants: Story = {
  args: { title: '' },
  render: () => (
    <div className="flex flex-col gap-2">
      {([
        { variant: 'success', title: 'Query executed successfully' },
        { variant: 'info', title: 'New version available' },
        { variant: 'warning', title: 'SSL certificate expires in 7 days' },
        { variant: 'error', title: 'Connection failed', description: 'Check your credentials and try again.' },
        { variant: 'neutral', title: 'Data has been updated.' },
      ] as const).map((t) => (
        <Toast key={t.variant} {...t} onDismiss={fn()} />
      ))}
    </div>
  ),
}

/** Anatomy: mark, content, action, dismiss. `description` is optional — a
 *  one-line toast is the common case and shouldn't be padded out to two.
 *  The dismiss X is quiet until hovered: the toast expires on its own, so the
 *  close shouldn't compete with the message. */
export const Anatomy: Story = {
  args: { title: '' },
  render: () => (
    <div className="flex flex-col gap-2">
      <Toast variant="success" title="Title only" onDismiss={fn()} />
      <Toast
        variant="success"
        title="Title message"
        description="Supporting description goes here."
        onDismiss={fn()}
      />
      <Toast
        variant="success"
        title="With an action"
        description="Your changes were saved."
        action={{ label: 'Undo', onClick: fn() }}
        onDismiss={fn()}
      />
      {/* No onDismiss -> no close button. For a toast the caller owns. */}
      <Toast variant="info" title="No dismiss button" description="The caller controls this one." />
    </div>
  ),
}

/** One action, never two. A toast the user has to make a decision in is a
 *  dialog wearing a toast's clothes. */
export const WithAction: Story = {
  args: { title: '' },
  render: () => (
    <div className="flex flex-col gap-2">
      <Toast variant="success" title="Changes saved" action={{ label: 'Undo', onClick: fn() }} onDismiss={fn()} />
      <Toast variant="error" title="Something went wrong" action={{ label: 'Retry', onClick: fn() }} onDismiss={fn()} />
      <Toast variant="warning" title="Your session will expire soon" action={{ label: 'Extend', onClick: fn() }} onDismiss={fn()} />
      <Toast variant="info" title="Maintenance scheduled for tonight" action={{ label: 'Learn more', onClick: fn() }} onDismiss={fn()} />
    </div>
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('button', { name: 'Undo' })).toBeInTheDocument()
  },
}

/** `duration` renders the track and starts the clock. Hovering pauses it and
 *  resumes where it left off — a toast you're reading shouldn't expire under
 *  your eyes. Omit `duration` to make it persistent. */
export const AutoDismiss: Story = {
  name: 'Auto-dismiss (hover to pause)',
  args: {
    variant: 'success',
    title: 'Saved',
    description: 'Auto-dismisses in 6s. Hover to pause the countdown.',
    duration: 6000,
    onDismiss: fn(),
  },
}

export const Persistent: Story = {
  args: { title: '' },
  render: () => (
    <div className="flex flex-col gap-2">
      <Toast variant="error" title="Persistent" description="No duration — no track, no timer." onDismiss={fn()} />
      <Toast
        variant="info"
        loading
        title="Uploading 3 files…"
        description="2.4 MB of 5 MB"
        onDismiss={fn()}
      />
    </div>
  ),
}

/** What the app actually raises. These are the real shapes from the toast
 *  store, which models title + optional message + persistent. */
export const RealExamples: Story = {
  args: { title: '' },
  render: () => (
    <div className="flex flex-col gap-2">
      <Toast
        variant="success"
        title="Connected"
        description="prod-replica · app@10.2.0.4:5432/orders"
        duration={5000}
        onDismiss={fn()}
      />
      <Toast
        variant="error"
        title="Query failed"
        description={'syntax error at or near "SELCT"\nLINE 1: SELCT * FROM orders'}
        onDismiss={fn()}
      />
      <Toast variant="info" loading title="Restoring 12 tabs…" onDismiss={fn()} />
      <Toast
        variant="warning"
        title="Plugin needs a restart"
        description="db-tools was deactivated."
        action={{ label: 'Restart', onClick: fn() }}
        onDismiss={fn()}
      />
    </div>
  ),
}
