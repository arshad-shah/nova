import { Check } from 'lucide-react'
import { Stack, Flex, Box, Grid, Text, Button, Spinner } from '@/primitives'
import { useTranslation } from '@/i18n/I18nProvider'
import { PluginFieldInput } from './PluginFieldInput'
import { fieldSpan, type PluginField, type AuthStatus } from './types'

interface Props {
  /** Driver fields marked `fetchable` (populated after authenticating). */
  fetchableFields: PluginField[]
  profile: Record<string, unknown>
  fetchableOptions: Record<string, string[]>
  authStatus: AuthStatus
  authError: string
  completedSteps: Set<number>
  onAuthenticate: () => void
  onStepComplete: (step: number) => void
  onFieldChange: (key: string, value: unknown) => void
}

/** The step-based "authenticate, then pick role/warehouse/database/schema"
 *  wizard for drivers (e.g. Snowflake) whose option lists can only be fetched
 *  after a live connection. */
export function FetchableFieldsWizard({
  fetchableFields, profile, fetchableOptions, authStatus, authError,
  completedSteps, onAuthenticate, onStepComplete, onFieldChange
}: Props) {
  const { t } = useTranslation()

  const steps = [...new Set(fetchableFields.map(f => f.step ?? 1))].sort((a, b) => a - b)
  const currentStep = steps.find(s => !completedSteps.has(s)) ?? (steps.length > 0 ? Math.max(...steps) + 1 : 0)

  return (
    <Stack gap="md">
      {/* Step 1: Authenticate */}
      <Box className={`border rounded-lg transition-colors ${authStatus === 'authenticated' ? 'border-success/20 bg-success/5' :
          authStatus === 'authenticating' ? 'border-accent/30' :
            'border-border-subtle'
        }`}>
        <Flex direction="row" align="center" gap="sm" className="px-4 py-3">
          <Box className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold ${authStatus === 'authenticated' ? 'bg-bg-success text-text-on-solid' :
              authStatus === 'authenticating' ? 'bg-bg-accent text-text-on-solid' :
                'bg-bg-tertiary text-text-muted'
            }`}>
            {authStatus === 'authenticated' ? <Check size={14} /> : '1'}
          </Box>
          <Text size="sm" weight="semibold">
            {t('connections.wizard.stepAuthenticate')}
          </Text>
        </Flex>
        <Stack gap="sm" className="px-4 pb-4">
          {authStatus === 'authenticated' ? (
            <Flex direction="row" align="center" gap="md">
              <Text size="sm" color="success">{t('connections.wizard.authenticatedSuccess')}</Text>
              <Button type="button" variant="ghost" size="sm" onClick={onAuthenticate}>
                {t('connections.wizard.reAuthenticate')}
              </Button>
            </Flex>
          ) : (
            <>
              <Text size="sm" color="muted">
                {t('connections.wizard.authIntro')}
              </Text>
              <Box>
                <Button
                  type="button"
                  variant="solid"
                  size="md"
                  onClick={onAuthenticate}
                  disabled={authStatus === 'authenticating'}
                  className="flex items-center gap-1.5"
                >
                  {authStatus === 'authenticating' ? <Spinner size="xs" /> : null}
                  {authStatus === 'authenticating' ? t('connections.wizard.authenticating') : t('connections.wizard.authenticate')}
                </Button>
              </Box>
            </>
          )}
          {authStatus === 'error' && (
            <Text size="sm" color="error">{authError}</Text>
          )}
        </Stack>
      </Box>

      {/* Subsequent steps — grouped by step number */}
      {steps.map(step => {
        const stepFields = fetchableFields.filter(f => (f.step ?? 1) === step)
        const stepIndex = steps.indexOf(step)
        const isCompleted = completedSteps.has(step)
        const isActive = step === currentStep && authStatus === 'authenticated'
        const isPending = !isCompleted && !isActive

        const stepLabel = stepIndex === 0
          ? t('connections.wizard.stepSelectRoleWarehouse')
          : t('connections.wizard.stepSelectDatabaseSchema')

        return (
          <Box
            key={step}
            className={`border rounded-lg transition-colors ${isCompleted ? 'border-success/20 bg-success/5' :
                isActive ? 'border-accent/30' :
                  'border-border-subtle opacity-60'
              }`}
          >
            <Flex direction="row" align="center" gap="sm" className="px-4 py-3">
              <Box className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold ${isCompleted ? 'bg-bg-success text-text-on-solid' :
                  isActive ? 'bg-bg-accent text-text-on-solid' :
                    'bg-bg-tertiary text-text-muted'
                }`}>
                {isCompleted ? <Check size={14} /> : stepIndex + 2}
              </Box>
              <Text size="sm" weight="semibold" color={isPending ? 'muted' : 'primary'}>
                {t('connections.wizard.stepLabel', { n: stepIndex + 2, label: stepLabel })}
              </Text>
            </Flex>
            {(isActive || isCompleted) && (
              <Stack gap="md" className="px-4 pb-4">
                <Grid columns={2} gap="md">
                  {stepFields.map(f => (
                    <PluginFieldInput
                      key={f.key}
                      field={f}
                      value={profile[f.key]}
                      onChange={(v) => onFieldChange(f.key, v)}
                      authStatus={authStatus}
                      fetchableOptions={fetchableOptions}
                      className={fieldSpan(f)}
                    />
                  ))}
                </Grid>
                {isActive && !isCompleted && (
                  <Box>
                    <Button
                      type="button"
                      variant="solid"
                      size="sm"
                      onClick={() => onStepComplete(step)}
                    >
                      {t('connections.wizard.continue')}
                    </Button>
                  </Box>
                )}
              </Stack>
            )}
          </Box>
        )
      })}
    </Stack>
  )
}
