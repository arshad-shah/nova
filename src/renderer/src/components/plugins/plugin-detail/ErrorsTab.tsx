import { XCircle } from 'lucide-react'
import { Flex, Text, Box, Card, Code, Stack, EmptyState } from '@/primitives'
import { useTranslation } from '@/i18n/I18nProvider'
import type { ErrorRecord } from './types'

export function ErrorsTab({ errors, expandedError, onToggleError }: {
  errors: ErrorRecord[]
  expandedError: number | null
  onToggleError: (i: number | null) => void
}) {
  const { t } = useTranslation()
  if (errors.length === 0) {
    return <EmptyState title={t('plugins.detail.errors.emptyTitle')} description={t('plugins.detail.errors.emptyDescription')} className="py-12" />
  }

  return (
    <Card padding="md">
      <Stack gap="xs">
        {errors.slice(-20).reverse().map((err, i) => (
          <Box key={i}>
            <Flex
              direction="row"
              align="start"
              gap="sm"
              onClick={() => onToggleError(expandedError === i ? null : i)}
              className="py-1.5 cursor-pointer hover:bg-hover rounded px-2 -mx-2 transition-colors"
            >
              <XCircle size={14} className="text-error mt-0.5 shrink-0" />
              <Box className="flex-1 min-w-0">
                <Text size="xs" color="secondary" truncate className="block">{err.error}</Text>
                <Text size="xs" color="muted" className="text-[10px]">{new Date(err.timestamp).toLocaleString()}</Text>
              </Box>
            </Flex>
            {expandedError === i && err.stack && (
              <Code block className="text-[11px] text-text-muted bg-bg-tertiary rounded p-3 mt-1 overflow-x-auto whitespace-pre-wrap">
                {err.stack}
              </Code>
            )}
          </Box>
        ))}
      </Stack>
    </Card>
  )
}
