import type { Meta, StoryObj } from '@storybook/react-vite'
import { useEffect } from 'react'
import { expect, screen, userEvent, within } from 'storybook/test'
import { AIStatusSegment } from './AIStatusSegment'
import { useAIStore } from '@/stores/ai'
import type { AIModelInfo, AIProviderInfo } from '@shared/ai-types'

function stubElectronAPI() {
  ;(window as unknown as { electronAPI: unknown }).electronAPI = {
    invoke: async () => [],
    on: () => () => {},
  }
}

const models: AIModelInfo[] = [
  { id: 'claude-opus', name: 'Claude Opus', contextWindow: 200_000, capabilities: ['chat', 'tool-calling'] },
]
const provider: AIProviderInfo = { id: 'anthropic', name: 'Anthropic' }

function seed(patch: {
  isStreaming?: boolean
  used?: number
  toolCallCount?: number
  permissionProfile?: 'read-only' | 'ask-write' | 'auto'
}) {
  return function StoreSeeder() {
    useEffect(() => {
      stubElectronAPI()
      useAIStore.setState({
        isStreaming: patch.isStreaming ?? false,
        activeModel: 'claude-opus',
        activeProvider: provider,
        models,
        sessionStats: {
          totalInputTokens: patch.used ?? 24_000,
          totalOutputTokens: 0,
          toolCallCount: patch.toolCallCount ?? 3,
        },
        permissionProfile: patch.permissionProfile ?? 'ask-write',
      })
    }, [])
    return (
      // Status-bar segments are full-height; give the host a bar-like height.
      <div style={{ height: 28, display: 'flex', alignItems: 'stretch', background: 'var(--color-bg-secondary)' }}>
        <AIStatusSegment />
      </div>
    )
  }
}

const meta: Meta<typeof AIStatusSegment> = {
  title: 'Components/AI/AIStatusSegment',
  component: AIStatusSegment,
}
export default meta
type Story = StoryObj<typeof meta>

export const Idle: Story = { render: seed({}) }
export const Streaming: Story = { render: seed({ isStreaming: true, used: 120_000 }) }
export const NearLimit: Story = { render: seed({ used: 190_000, permissionProfile: 'auto' }) }

export const PopoverOpen: Story = {
  render: seed({ used: 80_000, permissionProfile: 'read-only' }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    // The trigger is a status-bar segment (a div with aria-haspopup), not a
    // button — query it by its accessible name.
    const trigger = canvas.getByLabelText('AI status')
    await userEvent.click(trigger)
    // Popover content portals to document.body — assert it opened by finding a
    // row that only exists inside the popover.
    await expect(await screen.findByText('Provider')).toBeVisible()
  },
}
