import { AlertCircle, RefreshCw } from 'lucide-react'
import { Box, Text } from '@/primitives'
import { IconButton } from '@/primitives/forms/Button'
import { Tooltip } from '@/primitives/surfaces/Tooltip'
import { useTranslation } from '@/i18n/I18nProvider'

interface ExplorerErrorRowProps {
  /** Already-translated message describing what failed to load. */
  message: string
  /** Re-run the failed fetch. */
  onRetry: () => void
  /** Left indent in px, matching the sibling loading/empty rows. */
  paddingLeft?: number
}

/**
 * The one error affordance the explorer tree uses when a schema fetch fails,
 * shown in place of the misleading empty/loading row that a swallowed error
 * used to leave behind. Every node — hierarchy, schema, table, view — renders
 * this so a failed load reads as failed (and retryable) rather than empty.
 */
export function ExplorerErrorRow({ message, onRetry, paddingLeft }: ExplorerErrorRowProps) {
  const { t } = useTranslation()
  return (
    <Box
      className="group flex items-center gap-1.5 py-1 pr-1"
      style={paddingLeft !== undefined ? { paddingLeft } : undefined}
    >
      <AlertCircle size={12} className="text-error shrink-0" strokeWidth={1.8} />
      <Text as="span" size="xs" color="error" truncate className="flex-1 min-w-0" title={message}>
        {message}
      </Text>
      <Tooltip content={t('explorer.action.retry')} side="top">
        <IconButton
          label={t('explorer.action.retry')}
          size="xs"
          variant="ghost"
          className="h-5 w-5"
          onClick={(e) => {
            e.stopPropagation()
            onRetry()
          }}
        >
          <RefreshCw size={10} strokeWidth={1.8} />
        </IconButton>
      </Tooltip>
    </Box>
  )
}
