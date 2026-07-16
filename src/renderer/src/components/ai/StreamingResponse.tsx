import { Sparkles } from 'lucide-react'
import { useAIStore } from '@/stores/ai'
import { Text } from '@/primitives/typography/Text'
import { Box } from '@/primitives/layout/Box'
import { Avatar } from '@/primitives/data-display/Avatar'
import { MarkdownContent } from './MarkdownContent'
import { useTranslation } from '@/i18n/I18nProvider'

/**
 * Single slot for "the assistant is producing a response". Mounts as soon as
 * the user sends a message (driven by isAwaitingResponse), then morphs into
 * the streaming markdown card when text starts arriving. Same chrome before
 * and during, so the transition has no visual jump.
 */
export function StreamingResponse() {
  const { t } = useTranslation()
  const isAwaiting = useAIStore((s) => s.isAwaitingResponse)
  const streaming = useAIStore((s) => s.streamingContent)

  if (!isAwaiting && !streaming) return null

  const hasText = streaming.length > 0

  return (
    <Box className="group flex gap-2 mb-2.5">
      <Avatar
        name={t('aiui.chat.assistant')}
        size="sm"
        icon={<Sparkles className="h-3.5 w-3.5" />}
        className="mt-0.5"
      />
      <Box className="min-w-0 max-w-[88%] flex-1">
        <Box className="rounded-xl rounded-tl-sm border border-border-default bg-bg-secondary px-3 py-2">
          {hasText ? (
            <>
              <MarkdownContent content={streaming} />
              <Box as="span" className="inline-block w-0.5 h-4 bg-accent animate-[cursor-pulse_1s_ease-in-out_infinite] ml-0.5 align-text-bottom rounded-full" />
            </>
          ) : (
            <SkeletonLines />
          )}
        </Box>
      </Box>
    </Box>
  )
}

function SkeletonLines() {
  const { t } = useTranslation()
  return (
    <Box className="space-y-1.5 py-1">
      <Box className="h-2.5 rounded bg-bg-tertiary animate-pulse w-[90%]" />
      <Box className="h-2.5 rounded bg-bg-tertiary animate-pulse w-[75%]" />
      <Box className="h-2.5 rounded bg-bg-tertiary animate-pulse w-[60%]" />
      <Text size="xs" color="muted" className="pt-1 block">{t('aiui.chat.working')}</Text>
    </Box>
  )
}
