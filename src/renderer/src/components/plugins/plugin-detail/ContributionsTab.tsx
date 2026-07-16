import { Flex, Text, Badge, Card, Stack, EmptyState } from '@/primitives'
import { useTranslation } from '@/i18n/I18nProvider'
import { CONTRIBUTION_BADGE_VARIANTS } from './constants'

export function ContributionsTab({ contributions }: { contributions: string[] }) {
  const { t } = useTranslation()
  if (contributions.length === 0) {
    return <EmptyState title={t('plugins.detail.contributions.emptyTitle')} description={t('plugins.detail.contributions.emptyDescription')} className="py-12" />
  }

  return (
    <Card padding="md">
      <Stack gap="xs">
        {contributions.map((c, i) => {
          const [type, name] = c.includes(':') ? c.split(':') : ['feature', c]
          const variant = CONTRIBUTION_BADGE_VARIANTS[type] ?? 'default'
          return (
            <Flex key={i} direction="row" align="center" gap="sm" className="py-1">
              <Badge size="sm" tone={variant} className="w-20 text-center justify-center shrink-0">{type}</Badge>
              <Text size="sm" color="secondary">{name}</Text>
            </Flex>
          )
        })}
      </Stack>
    </Card>
  )
}
