import type { Meta, StoryObj } from '@storybook/react-vite'
import { useEffect } from 'react'
import { expect, within } from 'storybook/test'
import { ChatPanel } from './ChatPanel'
import { useAIStore, type Conversation } from '@/stores/ai'
import { useUiStore } from '@/stores/ui'
import type { AIChatMessage, AIModelInfo, AIProviderInfo } from '@shared/ai-types'

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

const conversations: Conversation[] = [
  { id: 'c1', title: 'Schema overview', messages: [], stats: { totalInputTokens: 0, totalOutputTokens: 0, toolCallCount: 0 }, createdAt: 1, updatedAt: 1 },
]

function seed(messages: AIChatMessage[], used: number) {
  return function StoreSeeder() {
    useEffect(() => {
      stubElectronAPI()
      useUiStore.setState({ secondarySidebarVisible: true, secondaryActivePanel: 'plugin:ai-chat' })
      useAIStore.setState({
        activeModel: 'claude-opus',
        activeProvider: provider,
        providers: [provider],
        models,
        conversations,
        activeConversationId: 'c1',
        messages,
        isAwaitingResponse: false,
        isStreaming: false,
        streamingContent: '',
        isCompacting: false,
        pendingApproval: null,
        permissionProfile: 'ask-write',
        sessionStats: { totalInputTokens: used, totalOutputTokens: 0, toolCallCount: 0 },
      })
    }, [])
    return <ChatPanel />
  }
}

const conversation: AIChatMessage[] = [
  { id: '1', role: 'user', content: 'Summarize the schema for me', timestamp: 1 },
  { id: '2', role: 'assistant', content: 'There are **12 tables**. The core ones are `users`, `orders`, and `products`.', timestamp: 2 },
]

const meta: Meta<typeof ChatPanel> = {
  title: 'Components/AI/ChatPanel',
  component: ChatPanel,
  decorators: [
    (Story) => (
      <div style={{ width: 400, height: 640 }}>
        <Story />
      </div>
    ),
  ],
}
export default meta
type Story = StoryObj<typeof meta>

export const Empty: Story = { render: seed([], 8_000) }
export const WithConversation: Story = {
  render: seed(conversation, 42_000),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(await canvas.findByText(/12 tables/)).toBeVisible()
  },
}
