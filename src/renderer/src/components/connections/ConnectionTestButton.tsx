import { useState } from 'react'
import type { ConnectionProfile } from '@shared/types'
import { Stack, Button, Spinner, Alert, Box } from '@/primitives'
import { IPC_CHANNELS } from '@shared/ipc'
import { useTranslation } from '@/i18n/I18nProvider'

interface Props {
  profile: ConnectionProfile
}

export function ConnectionTestButton({ profile }: Props) {
  const { t } = useTranslation()
  const [status, setStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle')
  const [message, setMessage] = useState('')

  const test = async () => {
    setStatus('testing')
    const result = await window.electronAPI.invoke(IPC_CHANNELS.DB_TEST_CONNECTION, profile)
    if (result.success) {
      setStatus('success')
      const parts = [result.version ?? t('connections.test.connected')]
      if (result.details) {
        for (const [k, v] of Object.entries(result.details)) {
          parts.push(`${k}: ${v}`)
        }
      }
      setMessage(parts.join(' | '))
    } else {
      setStatus('error')
      setMessage(result.error ?? t('connections.connectionFailed'))
    }
    setTimeout(() => setStatus('idle'), 3000)
  }

  return (
    <Stack gap="sm">
      <Box>
        <Button
          variant="outline"
          size="lg"
          onClick={test}
          disabled={status === 'testing'}
          className="flex items-center gap-1.5"
        >
          {status === 'testing' ? <Spinner size="xs" /> : null}
          {t('connections.test.button')}
        </Button>
      </Box>
      {status === 'success' && (
        <Alert tone="success" title={t('connections.test.successTitle')}>{message}</Alert>
      )}
      {status === 'error' && (
        <Alert tone="error" title={t('connections.test.failedTitle')}>{message}</Alert>
      )}
    </Stack>
  )
}
