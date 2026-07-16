import { Stack, Flex, Text, Box, Card, Badge, Alert, Switch, EmptyState } from '@/primitives'
import { useTranslation } from '@/i18n/I18nProvider'
import type { PermissionState } from './types'

export function PermissionsTab({ permissions, onToggle }: {
  permissions: PermissionState | null
  onToggle: (permission: string, granted: boolean) => void
}) {
  const { t } = useTranslation()
  if (!permissions) {
    return <EmptyState title={t('plugins.detail.permissions.loadingTitle')} description={t('plugins.detail.permissions.loadingDescription')} className="py-12" />
  }

  if (permissions.trusted) {
    return (
      <Stack gap="md">
        <Alert tone="info">
          {t('plugins.detail.permissions.trusted')}
        </Alert>
      </Stack>
    )
  }

  if (permissions.declared.length === 0) {
    return (
      <EmptyState
        title={t('plugins.detail.permissions.noneTitle')}
        description={t('plugins.detail.permissions.noneDescription')}
        className="py-12"
      />
    )
  }

  return (
    <Stack gap="md">
      <Alert tone="warning">
        {t('plugins.detail.permissions.warning')}
      </Alert>
      <Card padding="md">
        <Stack gap="md">
          {permissions.declared.map((perm) => {
            const info = permissions.info[perm]
            const granted = permissions.granted.includes(perm)
            return (
              <Flex key={perm} direction="row" align="start" justify="between" gap="md">
                <Box className="flex-1 min-w-0">
                  <Flex direction="row" align="center" gap="sm" className="flex-wrap">
                    <Text size="sm" weight="medium" color="primary">{info?.title ?? perm}</Text>
                    <Badge size="sm" tone={info?.enforced ? 'accent' : 'default'}>
                      {info?.enforced ? t('plugins.detail.permissions.enforced') : t('plugins.detail.permissions.advisory')}
                    </Badge>
                  </Flex>
                  <Text size="xs" color="muted" as="p" className="mt-1 leading-relaxed">
                    {info?.description ?? t('plugins.detail.permissions.capabilityFallback', { perm })}
                    {info && !info.enforced && (
                      <>{t('plugins.detail.permissions.advisoryNote')}</>
                    )}
                  </Text>
                </Box>
                <Box className="shrink-0">
                  <Switch
                    label={info?.title ?? perm}
                    checked={granted}
                    onChange={(e) => onToggle(perm, e.target.checked)}
                  />
                </Box>
              </Flex>
            )
          })}
        </Stack>
      </Card>
    </Stack>
  )
}
