import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { TabCloseGuard } from './TabCloseGuard'
import { tabActions, type TabActions } from '@/stores/tab-actions'

function withTab(id: string, actions: TabActions) {
  tabActions.register(id, actions)
}

const meta: Meta<typeof TabCloseGuard> = {
  title: 'Components/Shell/TabCloseGuard',
  component: TabCloseGuard,
  args: {
    txnQueue: [],
    dirtyBatch: [],
    resolveHead: fn(),
    clearBatch: fn(),
    closeTab: fn(),
  },
}
export default meta
type Story = StoryObj<typeof meta>

/** No pending closes — renders nothing. */
export const Idle: Story = {
  play: async ({ canvasElement }) => {
    expect(canvasElement.querySelector('[role="dialog"]')).toBeNull()
  },
}

/** One dirty (unsaved) tab: singular confirm copy, "Discard changes" closes it. */
export const SingleDirtyTab: Story = {
  beforeEach: () => {
    withTab('q1', { label: 'Untitled Query' })
  },
  args: { dirtyBatch: ['q1'] },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    expect(await canvas.findByText('Unsaved changes')).toBeVisible()
    await userEvent.click(canvas.getByRole('button', { name: /discard changes/i }))
    expect(args.clearBatch).toHaveBeenCalled()
    // Called via `dirtyBatch.forEach(closeTab)`, so it also receives the
    // index and array — assert on the tab id, the first argument.
    expect(args.closeTab.mock.calls[0]?.[0]).toBe('q1')
  },
}

/** Multiple dirty tabs share one combined confirm, listing every label. */
export const MultipleDirtyTabs: Story = {
  beforeEach: () => {
    withTab('q1', { label: 'Query 1' })
    withTab('q2', { label: 'Query 2' })
  },
  args: { dirtyBatch: ['q1', 'q2'] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    expect(await canvas.findByText(/Query 1, Query 2/)).toBeVisible()
  },
}

/** Cancelling a dirty-tab confirm keeps editing (calls clearBatch, no close). */
export const CancelKeepsEditing: Story = {
  beforeEach: () => {
    withTab('q1', { label: 'Untitled Query' })
  },
  args: { dirtyBatch: ['q1'] },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.click(await canvas.findByRole('button', { name: /keep editing/i }))
    expect(args.clearBatch).toHaveBeenCalled()
    expect(args.closeTab).not.toHaveBeenCalled()
  },
}

/** An open transaction is confirmed one at a time; committing calls
 *  commitTransaction then closes the tab. */
export const TransactionCommit: Story = {
  beforeEach: () => {
    withTab('t1', { label: 'Query with TX', commitTransaction: fn().mockResolvedValue(undefined) })
  },
  args: { txnQueue: ['t1'] },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    expect(await canvas.findByText('Open transaction')).toBeVisible()
    await userEvent.click(canvas.getByRole('button', { name: /commit/i }))
    expect(tabActions.get('t1')?.commitTransaction).toHaveBeenCalled()
    expect(args.resolveHead).toHaveBeenCalled()
    expect(args.closeTab).toHaveBeenCalledWith('t1')
  },
}
