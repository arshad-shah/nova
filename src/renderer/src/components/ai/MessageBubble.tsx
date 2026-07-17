import { Sparkles, Copy, Check, RotateCcw, AlertTriangle, GitBranch } from 'lucide-react'
import { useClipboard } from '@/hooks/useClipboard'
import type { AIChatMessage } from '@shared/ai-types'
import { Text } from '@/primitives/typography/Text'
import { Box } from '@/primitives/layout/Box'
import { IconButton } from '@/primitives/forms/Button'
import { Avatar } from '@/primitives/data-display/Avatar'
import { useAIStore } from '@/stores/ai'
import { useTranslation } from '@/i18n/I18nProvider'
import { MarkdownContent } from './MarkdownContent'
import { isWideMessageContent } from './message-content-width'

interface MessageBubbleProps {
  message: AIChatMessage
}

function BranchButton({ messageId }: { messageId: string }) {
  const { t } = useTranslation()
  const branchConversation = useAIStore((s) => s.branchConversation)
  const isStreaming = useAIStore((s) => s.isStreaming)
  return (
    <IconButton
      label={t('aiui.chat.branch')}
      variant="ghost"
      size="xs"
      disabled={isStreaming}
      onClick={() => void branchConversation(messageId)}
    >
      <GitBranch className="h-3 w-3" />
    </IconButton>
  )
}

function CopyButton({ content }: { content: string }) {
  const { t } = useTranslation()
  const { copied, copy } = useClipboard()
  return (
    <IconButton
      label={copied ? t('aiui.chat.copied') : t('aiui.chat.copyMessage')}
      variant="ghost"
      size="xs"
      onClick={() => copy(content)}
    >
      {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
    </IconButton>
  )
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const { t } = useTranslation()
  const isUser = message.role === 'user'
  const isError = message.role === 'assistant' && message.isError === true
  const retryLast = useAIStore((s) => s.retryLast)
  const isStreaming = useAIStore((s) => s.isStreaming)

  if (isUser) {
    return (
      <Box className="group flex justify-end mb-2.5">
        <Box className="max-w-[82%]">
          {/* Tail toward the right edge (rounded-tr-sm) so it reads as the user's. */}
          <Box className="rounded-xl rounded-tr-sm bg-accent-emphasis px-3 py-2">
            <Text size="sm" className="text-action-fg whitespace-pre-wrap">{message.content}</Text>
          </Box>
          <Box className="flex justify-end gap-1 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <BranchButton messageId={message.id} />
            <CopyButton content={message.content} />
          </Box>
        </Box>
      </Box>
    )
  }

  const wide = !isError && isWideMessageContent(message.content)

  return (
    <Box className="group flex gap-2 mb-2.5">
      <Avatar
        name={t('aiui.chat.assistant')}
        size="sm"
        tone={isError ? 'error' : 'accent'}
        icon={isError ? <AlertTriangle className="h-3.5 w-3.5" /> : <Sparkles className="h-3.5 w-3.5" />}
        className="mt-0.5"
      />
      <Box className={wide ? 'flex-1 min-w-0' : 'min-w-0 max-w-[82%]'}>
        {/* Tail toward the avatar (rounded-tl-sm) so the bubble emanates from it. */}
        <Box
          className={`rounded-xl rounded-tl-sm border px-3 py-2 max-w-full ${wide ? 'block' : 'inline-block'} ${
            isError ? 'border-error/30 bg-error/10' : 'border-border-default bg-bg-secondary'
          }`}
        >
          {isError ? (
            <Text size="sm" color="error" className="whitespace-pre-wrap">{message.content}</Text>
          ) : (
            <MarkdownContent content={message.content} />
          )}
        </Box>
        <Box className="flex gap-1 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <CopyButton content={message.content} />
          <IconButton label={t('aiui.chat.retry')} variant="ghost" size="xs" disabled={isStreaming} onClick={retryLast}>
            <RotateCcw className="h-3 w-3" />
          </IconButton>
          {!isError && <BranchButton messageId={message.id} />}
        </Box>
      </Box>
    </Box>
  )
}
