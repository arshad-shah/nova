import { Box, Spinner, StatusDot } from '@/primitives'
import { StatusBarSegment } from './StatusBarSegment'
import { usePluginStatus } from './usePluginStatus'
import { useTranslation } from '@/i18n/I18nProvider'

export function PluginStatusSegment() {
  const { t } = useTranslation()
  const status = usePluginStatus()
  if (status.loading) {
    return (
      <StatusBarSegment tone="default" side="right" aria-label={t('shell.statusBar.pluginsLoading')}>
        <Spinner size="xs" label={t('shell.statusBar.loadingPlugins')} />
        <Box as="span" className="text-[10px]">{t('shell.statusBar.loading')}</Box>
      </StatusBarSegment>
    )
  }
  const warn = status.failed > 0
  return (
    <StatusBarSegment
      tone="default"
      side="right"
      aria-label={warn ? t('shell.statusBar.pluginsFailed', { count: status.failed }) : t('shell.statusBar.pluginsActive', { count: status.active })}
    >
      <StatusDot size="xs" tone={warn ? 'warning' : 'success'} />
      <Box as="span" className="text-[10px]">
        {warn ? t('shell.statusBar.pluginsCount', { active: status.active, total: status.total }) : t('shell.statusBar.pluginsActiveShort', { count: status.active })}
      </Box>
    </StatusBarSegment>
  )
}
