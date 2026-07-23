import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { Alert, Box, Flex, Text, Badge, Button } from '@/primitives'
import { parseDbError } from '@/lib/db-error'
import { useTranslation } from '@/i18n/I18nProvider'

interface Props {
  /** Raw error message as caught from the IPC boundary. */
  error: string
  /** Active connection's driver type, so driver error rules classify the error. */
  dbType?: string
}

/**
 * Renders a database error as a friendly Alert.
 *
 * Layout: title (parsed), one-line explanation, optional hint, and a
 * collapsible "Show driver message" disclosure for the raw text — power
 * users still need to see the original when a pattern misclassifies or
 * when they're filing a bug against a driver.
 *
 * Lives in `results/` because the BottomDock's results tab is where query
 * errors surface; if we ever add another error surface (connection test,
 * import) it can reuse this verbatim.
 */
export function QueryErrorView({ error, dbType }: Props) {
  const { t } = useTranslation()
  const parsed = parseDbError(error, dbType)
  const [showRaw, setShowRaw] = useState(false)
  const isUnknown = parsed.code === 'UNKNOWN'

  return (
    <Box className="p-4 overflow-auto h-full">
      <Alert tone="error" title={parsed.title} className="max-w-2xl">
        <Flex direction="column" gap="sm">
          {/* Friendly message — primary action signal. */}
          <Text size="sm" as="p" className="leading-relaxed">{parsed.message}</Text>

          {parsed.hint && (
            <Flex direction="column" gap="xs" align="start" className="rounded-md bg-bg-tertiary/40 px-3 py-2">
              <Text size="xs" weight="medium" className="text-text-secondary uppercase tracking-wide">
                {t('query.error.hint')}
              </Text>
              <Text size="xs" color="secondary" as="p" className="leading-relaxed">{parsed.hint}</Text>
            </Flex>
          )}

          {/* Footer: stable code chip (analytics + bug reports) + raw disclosure. */}
          <Flex align="center" justify="between" gap="sm" className="pt-1">
            {!isUnknown && (
              <Badge tone="default" size="sm" className="font-mono text-3xs uppercase">
                {parsed.code}
              </Badge>
            )}
            <Button
              variant="bare"
              size="none"
              type="button"
              onClick={() => setShowRaw(s => !s)}
              className="inline-flex items-center gap-1 text-2xs text-text-muted hover:text-text-primary transition-colors ml-auto"
            >
              {showRaw ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              {showRaw ? t('query.error.hideDriverMessage') : t('query.error.showDriverMessage')}
            </Button>
          </Flex>

          {showRaw && (
            <Box className="rounded-md bg-bg-inset border border-border-default px-3 py-2 font-mono text-2xs text-text-secondary whitespace-pre-wrap break-words">
              {parsed.raw}
            </Box>
          )}
        </Flex>
      </Alert>
    </Box>
  )
}
