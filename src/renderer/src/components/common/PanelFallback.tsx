import { Flex, Spinner } from '@/primitives'
import { useTranslation } from '@/i18n/I18nProvider'

/**
 * Shared loading state for lazily-loaded panels (query editor, results grid, ER
 * diagram, AI chat, charts). Fills its container and centres a spinner while the
 * heavy chunk downloads. Kept dependency-light so it is not itself part of what
 * we defer.
 */
export function PanelFallback() {
  const { t } = useTranslation()
  return (
    <Flex align="center" justify="center" className="h-full w-full p-6">
      <Spinner label={t('common.loading')} />
    </Flex>
  )
}
