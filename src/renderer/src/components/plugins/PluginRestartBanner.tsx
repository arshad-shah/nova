import { usePluginLifecycleStore } from '@/stores/plugin-lifecycle'
import { useTranslation } from '@/i18n/I18nProvider'
import { Button, Card, Flex, Text } from '@/primitives'

/**
 * Banner that appears whenever a plugin is activated, deactivated, installed,
 * or uninstalled. Plugin contributions tear down cleanly via Disposables, but
 * UI components that captured handles to plugin state may need a fresh process
 * to fully reset — surface that to the user without forcing the issue.
 */
export function PluginRestartBanner() {
  const { t } = useTranslation()
  const pending = usePluginLifecycleStore((s) => s.pending)
  const restart = usePluginLifecycleStore((s) => s.restart)
  const dismiss = usePluginLifecycleStore((s) => s.dismiss)

  if (!pending) return null

  const verb = ({
    activated: t('plugins.restart.verbActivated'),
    deactivated: t('plugins.restart.verbDeactivated'),
    installed: t('plugins.restart.verbInstalled'),
    uninstalled: t('plugins.restart.verbUninstalled')
  } as const)[pending.event]

  return (
    // Was a hand-built surface of raw inline styles, and it was painting no
    // background at all: `var(--color-surface-raised)` is not a token that
    // exists anywhere, so it resolved to nothing and this floated over the app
    // with a border and a shadow but no fill. `elevated` is what it was trying
    // to be, and it follows the theme.
    <Card
      role="status"
      variant="elevated"
      padding="none"
      className="fixed bottom-8 left-1/2 z-9999 max-w-115 -translate-x-1/2 px-3.5 py-2.5"
    >
      <Flex direction="column" gap="xs">
        <Text size="sm">
          {t('plugins.restart.messagePrefix')} <strong>{pending.name}</strong> {t('plugins.restart.messageSuffix', { verb })}
        </Text>
        <Flex gap="xs" justify="end">
          <Button size="sm" variant="ghost" onClick={dismiss}>{t('plugins.restart.later')}</Button>
          <Button size="sm" onClick={restart}>{t('plugins.restart.restart')}</Button>
        </Flex>
      </Flex>
    </Card>
  )
}
