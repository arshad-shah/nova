import { Flex, Stack, Text, Spinner } from '@/primitives'
import { VerqlHero } from '@/components/brand/VerqlHero'
// Rendered before the I18nProvider mounts (pre-hydration), so use the
// standalone t() rather than the useTranslation() hook.
import { t } from '@shared/i18n'

interface SplashScreenProps {
  /** Optional status text shown beneath the mark (e.g. "Loading settings…"). */
  status?: string
}

/**
 * Full-window boot splash. Rendered before settings hydrate so the user sees a
 * branded loading state instead of a blank pane. Stays mounted until the first
 * post-hydration render of <App>.
 */
export function SplashScreen({ status = t('shell.splash.starting') }: SplashScreenProps) {
  return (
    <Flex
      align="center"
      justify="center"
      className="h-screen w-screen bg-bg-primary text-text-primary select-none"
      role="status"
      aria-live="polite"
    >
      <Stack gap="lg" align="center">
        <VerqlHero size={120} />
        <Spinner size="lg" label={status} />
        <Text size="base" color="muted">{status}</Text>
      </Stack>
    </Flex>
  )
}
