import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import { ModelPicker } from './ModelPicker'
import type { AIProviderInfo, AIModelInfo } from '@shared/ai-types'

const providers: AIProviderInfo[] = [
  { id: 'anthropic', name: 'Anthropic' },
  { id: 'openai', name: 'OpenAI' },
]

const models: AIModelInfo[] = [
  { id: 'claude-opus', name: 'Claude Opus', contextWindow: 200_000, capabilities: ['chat', 'tool-calling'] },
  { id: 'claude-sonnet', name: 'Claude Sonnet', contextWindow: 200_000, capabilities: ['chat', 'tool-calling'] },
  { id: 'gpt-4o', name: 'GPT-4o', contextWindow: 128_000, capabilities: ['chat', 'tool-calling'] },
]

const meta: Meta<typeof ModelPicker> = {
  title: 'Components/AI/ModelPicker',
  component: ModelPicker,
  args: {
    onSelect: fn(),
    onSelectProvider: fn(),
  },
  decorators: [
    (Story) => (
      // ModelPicker owns its own trigger + Popover positioning; give it a
      // host with headroom so the upward-opening panel renders in-frame.
      <div style={{ position: 'relative', width: 320, height: 320, display: 'flex', alignItems: 'flex-end' }}>
        <Story />
      </div>
    ),
  ],
}
export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    providers,
    models,
    activeModel: 'claude-opus',
    activeModelName: 'Claude Opus',
  },
}

export const SingleProvider: Story = {
  args: {
    providers: [providers[0]],
    models: models.slice(0, 2),
    activeModel: 'claude-sonnet',
    activeModelName: 'Claude Sonnet',
  },
}

export const Empty: Story = {
  args: {
    providers: [],
    models: [],
    activeModel: null,
    activeModelName: 'No model selected',
  },
}
