// shared/ai-types.ts

// The main-process AI plugin registers a tool under this id (ai/internal/index.ts);
// the renderer's ToolCallCard resolves calls to it back to a friendly App-Action
// title. Centralised here so the two sides of that IPC-tool-call boundary can't drift.
export const PERFORM_APP_ACTION_TOOL_ID = 'perform_app_action'

export interface AIChatMessage {
  id: string
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  toolCalls?: AIToolCallRequest[]
  toolCallId?: string
  timestamp: number
  /** Set on assistant messages that report an error, for distinct styling. */
  isError?: boolean
}

export interface AIToolCallRequest {
  id: string
  name: string
  arguments: string // JSON string
}

export interface AIChatChunk {
  type: 'text' | 'tool-call' | 'done' | 'error'
  content?: string
  toolCall?: AIToolCallRequest
  error?: string
}

export interface AIApprovalRequest {
  requestId: string
  toolName: string
  toolDescription: string
  parameters: Record<string, unknown>
  display: string // Human-readable preview
}

export interface AIToolCallResult {
  toolCallId: string
  toolName: string
  success: boolean
  data: unknown
  display?: string
}

export interface AITokenUsage {
  inputTokens: number
  outputTokens: number
}

export type AIStreamEvent =
  | { type: 'chunk'; content: string }
  | { type: 'tool-call'; toolCall: AIToolCallRequest }
  | { type: 'tool-result'; result: AIToolCallResult }
  | { type: 'approval-request'; request: AIApprovalRequest }
  | { type: 'done'; usage?: AITokenUsage }
  | { type: 'error'; error: string }

export interface AIModelInfo {
  id: string
  name: string
  contextWindow: number
  capabilities: ('chat' | 'tool-calling')[]
  /** Relative price rank within the provider (0 = cheapest); omitted when unknown. */
  costTier?: number
}

export interface AIProviderInfo {
  id: string
  name: string
}

export interface AIChatStartRequest {
  message: string
  connectionId?: string
  connectionMeta?: { type: string; driverName: string }
  /** Catalog of available in-app actions, so the AI can offer deep links. */
  appActionsCatalog?: string
  /** Summary of saved connections and their connected state, so the AI can
   *  tell an existing connection from one that needs creating. */
  connectionsSummary?: string
  /** Recent errors/warnings from the notification center, so the AI can
   *  summarize the latest problems and point the user to the right panel. */
  notificationsSummary?: string
}
