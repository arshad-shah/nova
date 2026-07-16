import { Alert } from '@/primitives/feedback/Alert'
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
    // An inline warning that has to be answered before the assistant proceeds,
    // so `filled` — it must hold its own against the conversation around it.
    // The hand-drawn warning triangle is the severity mark now, and the two
    // buttons are why `action` still takes a node.
    <Alert
      tone="warning"
      variant="filled"
      className="mx-2 mb-3"
      action={
        <>
          <Button variant="solid" size="xs" onClick={() => onRespond(approval.requestId, true)}>
            {t('aiui.approval.run')}
          </Button>
          <Button variant="ghost" size="xs" onClick={() => onRespond(approval.requestId, false)}>
            {t('aiui.approval.decline')}
          </Button>
        </>
      }
    >
      {t('aiui.approval.allowAction')}
    </Alert>
  )
}

