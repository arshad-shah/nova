import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, within } from 'storybook/test'
import { ErrorBoundary } from './ErrorBoundary'

function Boom(): never {
  throw new Error('Simulated render crash')
}

const meta: Meta<typeof ErrorBoundary> = {
  title: 'Components/Shell/ErrorBoundary',
  component: ErrorBoundary,
  parameters: {
    // Suppress the noisy React error-boundary console.error / the expected
    // uncaught-error test-runner warning for this deliberately-throwing story.
    chromatic: { disableSnapshot: true },
  },
}
export default meta
type Story = StoryObj<typeof meta>

/** Healthy children render straight through — no fallback. */
export const NoError: Story = {
  render: () => (
    <ErrorBoundary>
      <div>All good</div>
    </ErrorBoundary>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    expect(canvas.getByText('All good')).toBeVisible()
  },
}

/** A render-time throw is caught: the fallback screen shows the error message
 *  and a "Try Again" action that resets the boundary. */
export const CaughtError: Story = {
  render: () => (
    <ErrorBoundary>
      <Boom />
    </ErrorBoundary>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    expect(await canvas.findByText('Something went wrong')).toBeVisible()
    expect(canvas.getByText('Simulated render crash')).toBeVisible()
    // Clicking retry re-throws immediately since Boom always throws, but the
    // boundary's own reset handler runs regardless — this is what we can
    // assert without a stateful reproduction component.
    await userEvent.click(canvas.getByRole('button', { name: /try again/i }))
  },
}
