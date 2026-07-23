import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn, expect, userEvent, screen } from 'storybook/test'
import { ConfirmDialog } from '@/components/shell/ConfirmDialog'

/**
 * Renders the real `ConfirmDialog` from `components/shell/`. The original
 * version of this file assembled a confirm UI from Modal + Button + Text
 * primitives, which drifted from the component the app actually mounts.
 * Storybook now exercises the same code path that ships.
 */
const meta: Meta<typeof ConfirmDialog> = {
  title: 'Patterns/ConfirmDialog',
  component: ConfirmDialog,
  args: {
    open: true,
    title: 'Discard changes?',
    message: 'Query 3 has unsaved changes. Close anyway?',
    confirmLabel: 'Discard',
    cancelLabel: 'Keep editing',
    variant: 'danger',
    onCancel: fn(),
    onConfirm: fn(),
  },
}
export default meta
type Story = StoryObj<typeof ConfirmDialog>

export const Danger: Story = {
  // Fresh mocks: the meta-level onCancel/onConfirm are shared across every
  // story, so a play here must not read call counts another story's play
  // already bumped on that same fn() instance.
  args: { onConfirm: fn(), onCancel: fn() },
  play: async ({ canvas, args }) => {
    await expect(await screen.findByText('Discard changes?')).toBeVisible()
    await userEvent.click(canvas.getByRole('button', { name: 'Discard' }))
    await expect(args.onConfirm).toHaveBeenCalledTimes(1)
    await expect(args.onCancel).not.toHaveBeenCalled()
  },
}

export const Default: Story = {
  args: {
    title: 'Run this query?',
    message: 'It returned 2.3M rows last time and took 45s.',
    confirmLabel: 'Run',
    cancelLabel: 'Cancel',
    variant: 'default',
    onConfirm: fn(),
    onCancel: fn(),
  },
  play: async ({ canvas, args }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Cancel' }))
    await expect(args.onCancel).toHaveBeenCalledTimes(1)
    await expect(args.onConfirm).not.toHaveBeenCalled()
  },
}

export const NoMessage: Story = {
  args: {
    title: 'Disconnect prod-orders?',
    message: undefined,
    confirmLabel: 'Disconnect',
    variant: 'danger',
  },
}

export const Closed: Story = {
  args: { open: false },
}
