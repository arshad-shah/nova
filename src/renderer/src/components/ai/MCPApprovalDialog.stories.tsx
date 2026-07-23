import type { Meta, StoryObj } from '@storybook/react-vite'
import { useEffect } from 'react'
import { MCPApprovalDialog } from './MCPApprovalDialog'
import { useAIStore } from '@/stores/ai'
import type { MCPApprovalRequest } from '@shared/mcp'

function stubElectronAPI() {
  ;(window as unknown as { electronAPI: unknown }).electronAPI = {
    invoke: async () => undefined,
    on: () => () => {},
  }
}

function seed(req: MCPApprovalRequest | null) {
  return function StoreSeeder() {
    useEffect(() => {
      stubElectronAPI()
      useAIStore.setState({ mcpPendingApproval: req })
    }, [])
    return <MCPApprovalDialog />
  }
}

const meta: Meta<typeof MCPApprovalDialog> = {
  title: 'Components/AI/MCPApprovalDialog',
  component: MCPApprovalDialog,
}
export default meta
type Story = StoryObj<typeof meta>

export const WriteRequest: Story = {
  render: seed({
    requestId: 'req-1',
    toolId: 'execute_query',
    toolName: 'execute_query',
    statement: 'DELETE FROM sessions WHERE expires_at < now();',
    language: 'sql',
    permission: 'write',
  }),
}

export const ReadRequest: Story = {
  render: seed({
    requestId: 'req-2',
    toolId: 'execute_query',
    toolName: 'execute_query',
    statement: 'SELECT id, email FROM users ORDER BY created_at DESC LIMIT 50;',
    language: 'sql',
    permission: 'read',
  }),
}

// A non-SQL tool call: the payload is the tool's params, shown in the tool's own
// terms (JSON) rather than mislabeled and highlighted as SQL.
export const NonSqlRequest: Story = {
  render: seed({
    requestId: 'req-3',
    toolId: 'redis_command',
    toolName: 'redis_command',
    statement: JSON.stringify({ command: 'DEL', key: 'session:abc' }, null, 2),
    language: 'json',
    permission: 'write',
  }),
}

export const Hidden: Story = {
  render: seed(null),
}
