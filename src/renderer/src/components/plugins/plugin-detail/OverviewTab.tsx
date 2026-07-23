import { Stack, Flex, Text, Box, Card, Alert } from '@/primitives'
import { useTranslation } from '@/i18n/I18nProvider'
import type { StateConfig } from './constants'
import type { PluginInfo, ErrorRecord } from './types'

function DetailRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <Flex direction="row" align="center" justify="between">
      <Text size="xs" color="muted">{label}</Text>
      <Text size="xs" color="secondary" className={mono ? 'font-mono' : ''}>{value}</Text>
    </Flex>
  )
}

export function OverviewTab({ plugin, stateConfig, errors }: {
  plugin: PluginInfo
  stateConfig: StateConfig
  errors: ErrorRecord[]
}) {
  const { t } = useTranslation()
  const StateIcon = stateConfig.icon
  return (
    <Stack gap="lg">
      {/* Stat Cards */}
      <Flex direction="row" gap="md">
        <Card padding="md" className="flex-1">
          <Text size="xs" color="muted" weight="medium" className="text-3xs uppercase tracking-wide mb-2 block">{t('plugins.detail.overview.statusLabel')}</Text>
          <Flex direction="row" align="center" gap="xs">
            <StateIcon size={16} />
            <Text size="sm" weight="medium">{t(stateConfig.labelKey)}</Text>
          </Flex>
        </Card>
        <Card padding="md" className="flex-1">
          <Text size="xs" color="muted" weight="medium" className="text-3xs uppercase tracking-wide mb-2 block">{t('plugins.detail.overview.contributionsLabel')}</Text>
          <Text size="sm" weight="medium">{t('plugins.detail.overview.contributionsValue', { count: plugin.contributions.length })}</Text>
        </Card>
        <Card padding="md" className="flex-1">
          <Text size="xs" color="muted" weight="medium" className="text-3xs uppercase tracking-wide mb-2 block">{t('plugins.detail.overview.errorsLabel')}</Text>
          <Text size="sm" weight="medium">{errors.length > 0 ? t('plugins.detail.overview.errorsValue', { count: errors.length }) : t('plugins.detail.overview.errorsNone')}</Text>
        </Card>
      </Flex>

      {/* Error alert if present */}
      {plugin.status.error && (
        <Alert tone="error">{plugin.status.error}</Alert>
      )}

      {/* Details Card */}
      <Card padding="md">
        <Text size="xs" color="muted" weight="medium" className="text-3xs uppercase tracking-wide mb-3 block">{t('plugins.detail.overview.detailsLabel')}</Text>
        <Stack gap="sm">
          <DetailRow label={t('plugins.detail.overview.identifier')} value={plugin.name} mono />
          <DetailRow label={t('plugins.detail.overview.version')} value={plugin.version} />
          <DetailRow label={t('plugins.detail.overview.source')} value={plugin.bundled ? t('plugins.detail.overview.sourceBuiltIn') : t('plugins.detail.overview.sourceUserInstalled')} />
          {plugin.status.phase && plugin.status.state === 'error' && (
            <DetailRow label={t('plugins.detail.overview.failedDuring')} value={plugin.status.phase} />
          )}
        </Stack>
      </Card>
    </Stack>
  )
}
