import { Text } from '@/primitives/typography/Text'
import { Box } from '@/primitives/layout/Box'
import { Button } from '@/primitives/forms/Button'
import { useTranslation } from '@/i18n/I18nProvider'
import type { AIApprovalRequest } from '@shared/ai-types'

interface ApprovalCardContentProps {
  approval: AIApprovalRequest
  onRespond: (requestId: string, approved: boolean) => void
}

export function ApprovalCardContent({ approval, onRespond }: ApprovalCardContentProps) {
  const { t } = useTranslation()
  return (
    <Box className="mx-2 mb-3 flex items-center gap-3 rounded-lg border border-warning/30 bg-warning/5 px-3 py-2">
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="shrink-0 text-warning">
        <path d="M8 1L1 14h14L8 1z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
        <path d="M8 6v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="8" cy="11.5" r="0.75" fill="currentColor" />
      </svg>
      <Text size="xs" color="secondary" className="flex-1">
        {t('aiui.approval.allowAction')}
      </Text>
      <Box className="flex gap-1.5 shrink-0">
        <Button
          variant="solid"
          size="xs"
          onClick={() => onRespond(approval.requestId, true)}
        >
          {t('aiui.approval.run')}
        </Button>
        <Button
          variant="ghost"
          size="xs"
          onClick={() => onRespond(approval.requestId, false)}
        >
          {t('aiui.approval.decline')}
        </Button>
      </Box>
    </Box>
  )
}

