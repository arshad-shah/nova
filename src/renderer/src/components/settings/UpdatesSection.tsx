import { useEffect, useState } from 'react'
import { Stack, Flex, Button, Text } from '@/primitives'
import { IPC_CHANNELS, IPC_EVENTS, type IpcEventMap } from '@shared/ipc'
import { useTranslation } from '@/i18n/I18nProvider'
import { SettingRow } from './SettingRow'

type ProgressEvent = IpcEventMap[typeof IPC_EVENTS.UPDATER_PROGRESS][0]

type Status =
  | { kind: 'loading' }
  | { kind: 'unsupported' }
  | { kind: 'ready'; displayName: string; currentVersion: string; latestVersion: string | null; available: boolean }

type ActionState =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'updating'; phase: string }
  | { kind: 'done'; restartRequired: boolean }
  | { kind: 'error'; message: string }

/**
 * Renders update controls when the running install is managed by a known
 * package manager (currently Homebrew). Hidden when no updater is active,
 * so dev builds and direct .app downloads don't see a button that would
 * fail or — worse — clobber their install.
 */
export function UpdatesSection() {
  const { t } = useTranslation()
  const [status, setStatus] = useState<Status>({ kind: 'loading' })
  const [action, setAction] = useState<ActionState>({ kind: 'idle' })

  // One detection pass on mount. The active channel can't change at runtime,
  // so there's no need to re-query.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const s = await window.electronAPI.invoke(IPC_CHANNELS.UPDATER_STATUS)
      if (cancelled) return
      if (!s.available) {
        setStatus({ kind: 'unsupported' })
        return
      }
      setStatus({
        kind: 'ready',
        displayName: s.displayName,
        currentVersion: s.currentVersion,
        latestVersion: null,
        available: false,
      })
    })()
    return () => { cancelled = true }
  }, [])

  // Subscribe to update progress events. Main streams these while
  // `updater:update` is running so the UI can show phase changes without
  // polling.
  useEffect(() => {
    return window.electronAPI.on(IPC_EVENTS.UPDATER_PROGRESS, (...args: unknown[]) => {
      const payload = args[0] as ProgressEvent
      if (payload.phase === 'done') {
        setAction({ kind: 'done', restartRequired: payload.restartRequired })
      } else if (payload.phase === 'error') {
        setAction({ kind: 'error', message: payload.message })
      } else {
        setAction({ kind: 'updating', phase: payload.phase })
      }
    })
  }, [])

  if (status.kind === 'loading') return null
  if (status.kind === 'unsupported') return null

  const check = async () => {
    setAction({ kind: 'checking' })
    const result = await window.electronAPI.invoke(IPC_CHANNELS.UPDATER_CHECK)
    if (!result.supported) {
      setStatus({ kind: 'unsupported' })
      return
    }
    setStatus({
      kind: 'ready',
      displayName: status.displayName,
      currentVersion: result.currentVersion,
      latestVersion: result.latestVersion,
      available: result.available,
    })
    setAction({ kind: 'idle' })
  }

  const update = async () => {
    setAction({ kind: 'updating', phase: 'downloading' })
    await window.electronAPI.invoke(IPC_CHANNELS.UPDATER_UPDATE)
    // Progress and terminal states arrive via UPDATER_PROGRESS.
  }

  const restart = () => {
    void window.electronAPI.invoke(IPC_CHANNELS.APP_RESTART)
  }

  const versionLabel = status.latestVersion && status.available
    ? `${status.currentVersion} → ${status.latestVersion}`
    : status.currentVersion

  return (
    <Stack gap="sm">
      <SettingRow
        label={t('settings.updates.label')}
        description={t('settings.updates.description', { manager: status.displayName, version: versionLabel })}
      >
        <Flex gap="sm">
          <Button
            variant="outline"
            size="sm"
            onClick={check}
            disabled={action.kind === 'checking' || action.kind === 'updating'}
          >
            {action.kind === 'checking' ? t('settings.updates.checking') : t('settings.updates.checkForUpdates')}
          </Button>
          {status.available && action.kind !== 'updating' && action.kind !== 'done' && (
            <Button variant="solid" size="sm" onClick={update}>
              {t('settings.updates.installUpdate')}
            </Button>
          )}
          {action.kind === 'updating' && (
            <Text size="xs" color="muted">{action.phase}…</Text>
          )}
          {action.kind === 'done' && action.restartRequired && (
            <Button variant="solid" size="sm" onClick={restart}>
              {t('settings.updates.restartToApply')}
            </Button>
          )}
        </Flex>
      </SettingRow>
      {action.kind === 'error' && (
        <Text size="xs" color="error">{action.message}</Text>
      )}
    </Stack>
  )
}
