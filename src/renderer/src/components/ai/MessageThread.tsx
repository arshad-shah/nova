import { useRef, useEffect, useMemo } from 'react'
import { Sparkles } from 'lucide-react'
import { useAIStore } from '@/stores/ai'
import { useConnectionsStore, useActiveProfile } from '@/stores/connections'
import { ScrollArea } from '@/primitives/layout/ScrollArea'
import { Box } from '@/primitives/layout/Box'
import { Text } from '@/primitives/typography/Text'
import { MessageBubble } from './MessageBubble'
import { ToolCallCard } from './ToolCallCard'
import { StreamingResponse } from './StreamingResponse'
import type { AIChatMessage } from '@shared/ai-types'
import { useTranslation } from '@/i18n/I18nProvider'
import type { MessageKey } from '@shared/i18n'

const SUGGESTIONS: MessageKey[] = [
  'aiui.chat.suggestionSummarizeSchema',
  'aiui.chat.suggestionLargestTables',
  'aiui.chat.suggestionSlowQueries',
  'aiui.chat.suggestionRelationships',
]

function EmptyState() {
  const { t } = useTranslation()
  const sendMessage = useAIStore(s => s.sendMessage)
  const activeConnectionId = useConnectionsStore(s => s.activeConnectionId)
  const conn = useActiveProfile()

  const ask = (text: string) => {
    const meta = conn ? { type: conn.type, driverName: conn.type } : undefined
    sendMessage(text, activeConnectionId ?? undefined, meta)
  }

  return (
    <Box className="flex flex-col items-center justify-center h-full gap-4 px-4 text-center">
      <Box className="flex flex-col items-center gap-2">
        <Box as="span" className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-accent/10 text-accent ring-1 ring-border-default">
          <Sparkles className="h-4 w-4" />
        </Box>
        <Text size="sm" color="secondary">{t('aiui.chat.emptyPrompt')}</Text>
      </Box>
      <Box className="flex flex-wrap justify-center gap-1.5 max-w-[300px]">
        {SUGGESTIONS.map(key => {
          const text = t(key)
          return (
            <button
              key={key}
              type="button"
              onClick={() => ask(text)}
              className="rounded-md border border-border-default px-2 py-1 text-xs text-text-secondary hover:bg-hover hover:text-text-primary transition-colors"
            >
              {text}
            </button>
          )
        })}
      </Box>
    </Box>
  )
}

export function MessageThread() {
  const messages = useAIStore(s => s.messages)
  const isAwaiting = useAIStore(s => s.isAwaitingResponse)
  const streamingContent = useAIStore(s => s.streamingContent)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingContent, isAwaiting])

  // Build a map of toolCallId → result message, and a set of result message IDs to skip
  const { resultMap, resultIds } = useMemo(() => {
    const rMap = new Map<string, AIChatMessage>()
    const rIds = new Set<string>()
    for (const msg of messages) {
      if (msg.role === 'tool' && msg.toolCallId) {
        rMap.set(msg.toolCallId, msg)
        rIds.add(msg.id)
      }
    }
    return { resultMap: rMap, resultIds: rIds }
  }, [messages])

  return (
    <ScrollArea direction="vertical" className="flex-1 p-3">
      {messages.length === 0 && !isAwaiting && !streamingContent && <EmptyState />}
      {messages.map(msg => {
        // Skip standalone tool-result messages — they're shown inside ToolCallCard
        if (resultIds.has(msg.id)) return null

        if (msg.toolCalls?.length) {
          const toolCallId = msg.toolCalls[0].id
          const result = resultMap.get(toolCallId)
          return <ToolCallCard key={msg.id} message={msg} result={result} />
        }

        return <MessageBubble key={msg.id} message={msg} />
      })}
      <StreamingResponse />
      <Box ref={bottomRef} />
    </ScrollArea>
  )
}
