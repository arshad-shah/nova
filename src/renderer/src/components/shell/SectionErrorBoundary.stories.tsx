import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, userEvent, within } from 'storybook/test'
import { SectionErrorBoundary } from './SectionErrorBoundary'

function Boom(): never {
  throw new Error('Panel crashed while rendering')
}

const meta: Meta<typeof SectionErrorBoundary> = {
  title: 'Components/Shell/SectionErrorBoundary',
  component: SectionErrorBoundary,
  decorators: [
    (Story) => (
      <div style={{ width: 360, height: 200 }}>
        <Story />
      </div>
    ),
  ],
}
export default meta
type Story = StoryObj<typeof meta>

export const NoError: Story = {
  args: { label: 'Query Editor', children: <div>All good</div> },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    expect(canvas.getByText('All good')).toBeVisible()
  },
}

/** A crash names the section that failed and offers a Retry action. */
export const CaughtCrash: Story = {
  args: { label: 'Query Editor', children: <Boom /> },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    expect(await canvas.findByText(/Query Editor crashed/i)).toBeVisible()
    expect(canvas.getByText('Panel crashed while rendering')).toBeVisible()
    expect(canvas.getByRole('button', { name: /retry/i })).toBeVisible()
  },
}

/** A custom fallback renderer receives the error and a retry callback. */
export const CustomFallback: Story = {
  args: {
    label: 'Sidebar',
    children: <Boom />,
    fallback: (error, retry) => (
      <div>
        <span>Custom fallback: {error.message}</span>
        <button onClick={retry}>Reset now</button>
      </div>
    ),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    expect(await canvas.findByText('Custom fallback: Panel crashed while rendering')).toBeVisible()
  },
}

/** Changing `resetKey` auto-resets the boundary — a working child mounted
 *  under a new key renders again instead of staying on the stale fallback. */
export const ResetKeyRecovers: Story = {
  render: function Render() {
    const [key, setKey] = useState(0)
    return (
      <div>
        <button onClick={() => setKey((k) => k + 1)}>Change context</button>
        <SectionErrorBoundary label="Tab" resetKey={key}>
          {key === 0 ? <Boom /> : <div>Recovered content</div>}
        </SectionErrorBoundary>
      </div>
    )
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    expect(await canvas.findByText(/Tab crashed/i)).toBeVisible()

    await userEvent.click(canvas.getByRole('button', { name: 'Change context' }))
    expect(await canvas.findByText('Recovered content')).toBeVisible()
  },
}
