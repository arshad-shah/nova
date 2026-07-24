import { useState, type FormEvent } from 'react'
import { useAsyncEffect } from '@/hooks/useAsyncEffect'
import { parseAppError } from '@/lib/db-error'
import { ConnectionTestButton } from './ConnectionTestButton'
import { useConnectionsStore } from '@/stores/connections'
import { useTabsStore } from '@/stores/tabs'
import type { ConnectionProfile, DatabaseType } from '@shared/types'
import {
  Box, ScrollArea, Container, Stack, Flex, Grid, Divider,
  Heading, Text,
  FormField, Input, Select, ColorInput,
  Button
} from '@/primitives'
import { IPC_CHANNELS } from '@shared/ipc'
import { useTranslation } from '@/i18n/I18nProvider'
import { Section } from './form/Section'
import { ToggleRow } from './form/ToggleRow'
import { PluginFieldInput } from './form/PluginFieldInput'
import { FetchableFieldsWizard } from './form/FetchableFieldsWizard'
import { SshTunnelSection } from './form/SshTunnelSection'
import {
  COLOR_PRESETS, driverTypeOption, fieldSpan,
  type PluginDriver, type MiddlewareField, type AuthStatus
} from './form/types'
import { ipc } from '@/platform/client'

interface Props {
  tabId: string
  editingId?: string
}

export function ConnectionFormView({ tabId, editingId }: Props) {
  const { t } = useTranslation()
  const saveConnection = useConnectionsStore(s => s.saveConnection)
  const connections = useConnectionsStore(s => s.connections)
  const closeTab = useTabsStore(s => s.closeTab)

  const [pluginDrivers, setPluginDrivers] = useState<PluginDriver[]>([])
  const [middlewareFields, setMiddlewareFields] = useState<MiddlewareField[]>([])
  const [sshExpanded, setSshExpanded] = useState(false)
  const [fetchableOptions, setFetchableOptions] = useState<Record<string, string[]>>({})
  const [authStatus, setAuthStatus] = useState<AuthStatus>('idle')
  const [authError, setAuthError] = useState('')
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set())

  const existingProfile = editingId ? connections.find(c => c.id === editingId) : undefined

  const [profile, setProfile] = useState<Record<string, unknown>>({
    id: crypto.randomUUID(),
    name: '',
    type: 'postgresql',
    host: 'localhost',
    port: 5432,
    database: '',
    username: '',
    password: '',
    color: '#7A5CFF',
    ...(existingProfile ?? {})
  })

  useAsyncEffect(async (isCancelled) => {
    try {
      const [drivers, middleware] = await Promise.all([
        ipc.invoke(IPC_CHANNELS.PLUGINS_CONNECTION_FIELDS),
        ipc.invoke(IPC_CHANNELS.PLUGINS_MIDDLEWARE_FIELDS),
      ])
      if (isCancelled()) return
      setPluginDrivers(drivers)
      setMiddlewareFields(middleware)
    } catch { /* best-effort metadata read */ }
  }, [])

  const allTypes = pluginDrivers.map(driverTypeOption)

  const activePluginDriver = pluginDrivers.find(d => d.driverId === profile.type)
  const sshFields = middlewareFields.filter(f => f.group === 'ssh')

  // Derive step structure from plugin fields
  const fetchableFields = activePluginDriver?.connectionFields.filter(f => f.fetchable) ?? []
  const hasFetchableFields = fetchableFields.length > 0

  // Static (non-fetchable, non-grouped) driver fields, split for layout.
  const staticFields = activePluginDriver?.connectionFields.filter(f => !f.group && !f.fetchable) ?? []
  const staticInputs = staticFields.filter(f => f.type !== 'boolean')
  const staticToggles = staticFields.filter(f => f.type === 'boolean')

  const update = (patch: Record<string, unknown>) => setProfile(p => ({ ...p, ...patch }))
  const updateField = (key: string, value: unknown) => update({ [key]: value })

  const handleTypeChange = (type: DatabaseType) => {
    const driver = pluginDrivers.find(d => d.driverId === type)
    const defaults: Record<string, unknown> = { type }
    if (driver) {
      for (const field of driver.connectionFields) {
        if (field.default !== undefined && profile[field.key] === undefined) {
          defaults[field.key] = field.default
        }
      }
    }
    update(defaults)
    setAuthStatus('idle')
    setFetchableOptions({})
    setCompletedSteps(new Set())
  }

  const handleAuthenticate = async () => {
    if (!activePluginDriver) return
    setAuthStatus('authenticating')
    setAuthError('')
    try {
      // Fetch ALL fetchable fields in one connection (single browser auth)
      const fieldKeys = fetchableFields.map(f => f.key)
      const options = await ipc.invoke(
        IPC_CHANNELS.DB_CONNECTION_OPTIONS,
        profile as unknown as ConnectionProfile,
        fieldKeys
      )
      setFetchableOptions(options)
      setAuthStatus('authenticated')
    } catch (err) {
      setAuthStatus('error')
      setAuthError(parseAppError(err).message)
    }
  }

  const handleStepComplete = (step: number) => {
    setCompletedSteps(prev => new Set([...prev, step]))
  }

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    await saveConnection(profile as unknown as ConnectionProfile)
    closeTab(tabId)
  }

  const handleCancel = () => closeTab(tabId)

  return (
    <ScrollArea direction="vertical" className="h-full bg-bg-primary">
      <Container size="md" className="py-8">
        <Box as="form" onSubmit={handleSubmit}>
          <Stack gap="lg">
            {/* Header */}
            <Stack gap="xs">
              <Heading level={2}>{editingId ? t('connections.form.editTitle') : t('connections.form.newTitle')}</Heading>
            </Stack>

            {/* General — identity */}
            <Section title={t('connections.form.general')} description={t('connections.form.generalDescription')}>
              <Stack gap="md">
                <FormField label={t('connections.form.databaseType')}>
                  <Select
                    size="lg"
                    value={String(profile.type)}
                    onChange={(v) => handleTypeChange(v as DatabaseType)}
                    options={allTypes}
                  />
                </FormField>
                <Grid columns={2} gap="md">
                  <FormField label={t('connections.form.connectionName')}>
                    <Input
                      required
                      value={String(profile.name ?? '')}
                      onChange={(e) => update({ name: e.target.value })}
                      placeholder={t('connections.form.connectionNamePlaceholder')}
                      size="lg"
                    />
                  </FormField>
                  <FormField label={t('connections.form.color')}>
                    <ColorInput
                      value={String(profile.color ?? '#7A5CFF')}
                      onChange={(v) => update({ color: v })}
                      presets={COLOR_PRESETS}
                      size="lg"
                    />
                  </FormField>
                </Grid>
                <Divider />
                <ToggleRow
                  label={t('connections.form.autoCommit')}
                  checked={profile.defaultAutoCommit !== false}
                  onChange={(checked) => update({ defaultAutoCommit: checked })}
                />
              </Stack>
            </Section>

            {/* Connection — driver fields */}
            {activePluginDriver && staticFields.length > 0 && (
              <Section title={t('connections.form.connection')} description={t('connections.form.connectionDescription')}>
                <Stack gap="md">
                  {staticInputs.length > 0 && (
                    <Grid columns={2} gap="md">
                      {staticInputs.map(f => (
                        <PluginFieldInput
                          key={f.key}
                          field={f}
                          value={profile[f.key]}
                          onChange={(v) => updateField(f.key, v)}
                          authStatus={authStatus}
                          fetchableOptions={fetchableOptions}
                          className={fieldSpan(f)}
                        />
                      ))}
                    </Grid>
                  )}
                  {staticToggles.length > 0 && (
                    <>
                      <Divider />
                      <Text size="xs" color="muted" weight="semibold" className="uppercase tracking-wider">
                        {t('connections.form.options')}
                      </Text>
                      <Stack gap="xs">
                        {staticToggles.map(f => (
                          <ToggleRow
                            key={f.key}
                            label={f.label}
                            checked={!!profile[f.key]}
                            onChange={(checked) => updateField(f.key, checked)}
                          />
                        ))}
                      </Stack>
                    </>
                  )}
                </Stack>
              </Section>
            )}

            {/* Step-based auth wizard for fetchable fields */}
            {hasFetchableFields && (
              <FetchableFieldsWizard
                fetchableFields={fetchableFields}
                profile={profile}
                fetchableOptions={fetchableOptions}
                authStatus={authStatus}
                authError={authError}
                completedSteps={completedSteps}
                onAuthenticate={handleAuthenticate}
                onStepComplete={handleStepComplete}
                onFieldChange={updateField}
              />
            )}

            {/* SSH Tunnel */}
            {sshFields.length > 0 && (
              <SshTunnelSection
                sshFields={sshFields}
                expanded={sshExpanded}
                onToggle={() => setSshExpanded(!sshExpanded)}
                profile={profile}
                authStatus={authStatus}
                fetchableOptions={fetchableOptions}
                onFieldChange={updateField}
              />
            )}

            <Divider />

            {/* Footer actions */}
            <Flex direction="row" align="start" justify="between" gap="md">
              <ConnectionTestButton profile={profile as unknown as ConnectionProfile} />
              <Flex direction="row" gap="sm">
                <Button type="button" variant="outline" size="lg" onClick={handleCancel}>{t('common.cancel')}</Button>
                <Button type="submit" variant="solid" size="lg">
                  {editingId ? t('connections.form.saveChanges') : t('connections.form.addConnection')}
                </Button>
              </Flex>
            </Flex>
          </Stack>
        </Box>
      </Container>
    </ScrollArea>
  )
}
