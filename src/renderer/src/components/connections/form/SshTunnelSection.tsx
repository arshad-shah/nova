import { ChevronDown, ChevronRight } from 'lucide-react'
import { Stack, Flex, Box, Card, Grid, Text, Button } from '@/primitives'
import { useTranslation } from '@/i18n/I18nProvider'
import { PluginFieldInput } from './PluginFieldInput'
import { fieldSpan, type PluginField, type MiddlewareField, type AuthStatus } from './types'

interface Props {
  sshFields: MiddlewareField[]
  expanded: boolean
  onToggle: () => void
  profile: Record<string, unknown>
  authStatus: AuthStatus
  fetchableOptions: Record<string, string[]>
  onFieldChange: (key: string, value: unknown) => void
}

/** Collapsible SSH-tunnel section driven by the `ssh-tunnel` connection
 *  middleware's contributed fields. */
export function SshTunnelSection({ sshFields, expanded, onToggle, profile, authStatus, fetchableOptions, onFieldChange }: Props) {
  const { t } = useTranslation()

  return (
    // Same shape as Section: the toggle row and body own their padding, so the
    // card supplies only the surface. These two were duplicates of each other.
    <Card padding="none" className="border-border-subtle overflow-hidden">
      <Button
        type="button"
        variant="ghost"
        onClick={onToggle}
        className="w-full flex items-center gap-2 px-4 py-3 rounded-none border-0 h-auto justify-start"
      >
        {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        <Stack gap="xs" className="items-start text-left">
          <Text size="sm" weight="semibold" color="primary">{t('connections.form.sshTunnel')}</Text>
          {!expanded && <Text size="xs" color="muted">{t('connections.form.sshTunnelDescription')}</Text>}
        </Stack>
      </Button>
      {expanded && (
        <Box className="px-4 pb-4 border-t border-border-subtle pt-4">
          <Grid columns={2} gap="md">
            {sshFields.map(f => (
              <PluginFieldInput
                key={f.key}
                field={f as PluginField}
                value={profile[f.key]}
                onChange={(v) => onFieldChange(f.key, v)}
                authStatus={authStatus}
                fetchableOptions={fetchableOptions}
                className={fieldSpan(f as PluginField)}
              />
            ))}
          </Grid>
        </Box>
      )}
    </Card>
  )
}
