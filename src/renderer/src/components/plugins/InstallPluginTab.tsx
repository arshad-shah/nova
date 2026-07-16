import { useState, useCallback, type DragEvent } from 'react'
import { Package, Upload } from 'lucide-react'
import { useToastStore } from '@/stores/toast'
import { useTranslation } from '@/i18n/I18nProvider'
import { Flex, Box, Text, Button, Spinner, Alert } from '@/primitives'
import { IPC_CHANNELS } from '@shared/ipc'

type InstallState = 'idle' | 'drag-over' | 'installing' | 'error'

export function InstallPluginTab() {
  const { t } = useTranslation()
  const [state, setState] = useState<InstallState>('idle')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const addToast = useToastStore((s) => s.addToast)

  const installFromPath = useCallback(async (filePath: string) => {
    setState('installing')
    setErrorMessage(null)
    try {
      const result = filePath.endsWith('.zip')
        ? await window.electronAPI.invoke(IPC_CHANNELS.PLUGINS_INSTALL_FROM_ZIP, filePath)
        : await window.electronAPI.invoke(IPC_CHANNELS.PLUGINS_INSTALL_FROM_PATH, filePath)
      if (result.success) {
        addToast({ type: 'success', title: t('plugins.install.installedToast'), message: result.name ?? undefined })
      } else {
        setErrorMessage(result.error ?? t('plugins.install.failed'))
        setState('error')
        return
      }
    } catch (err) {
      setErrorMessage((err as Error).message)
      setState('error')
      return
    }
    setState('idle')
  }, [addToast, t])

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setState((s) => (s === 'installing' ? s : 'drag-over'))
  }, [])

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setState((s) => (s === 'installing' ? s : 'idle'))
  }, [])

  const handleDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      if (state === 'installing') return
      const files = e.dataTransfer.files
      if (files.length === 0) return
      const file = files[0]
      const filePath = (file as File & { path?: string }).path
      if (!filePath) return
      installFromPath(filePath)
    },
    [state, installFromPath]
  )

  const handleBrowse = useCallback(async () => {
    if (state === 'installing') return
    const filePath = await window.electronAPI.invoke(IPC_CHANNELS.PLUGINS_OPEN_INSTALL_DIALOG)
    if (!filePath) return
    installFromPath(filePath)
  }, [state, installFromPath])

  const isOver = state === 'drag-over'
  const isInstalling = state === 'installing'

  return (
    <Flex
      align="center"
      justify="center"
      className="h-full bg-bg-primary"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <Box className="w-full max-w-md px-6">
        <Flex
          direction="column"
          align="center"
          gap="md"
          className={`rounded-xl py-12 px-8 transition-colors duration-150 border-2 border-dashed ${
            isOver ? 'border-accent bg-accent/5' : 'border-border-default bg-bg-secondary'
          }`}
        >
          {isInstalling ? (
            <>
              <Spinner size="md" />
              <Text size="sm" color="muted">
                {t('plugins.install.installing')}
              </Text>
            </>
          ) : (
            <>
              <Box
                className={`rounded-full p-4 ${isOver ? 'bg-accent/10' : 'bg-bg-tertiary'}`}
              >
                {isOver ? (
                  <Upload size={32} strokeWidth={1.8} className="text-accent" />
                ) : (
                  <Package size={32} strokeWidth={1.8} className="text-text-disabled" />
                )}
              </Box>
              <Flex direction="column" align="center" gap="xs">
                <Text size="sm" weight="semibold" color="primary">
                  {t('plugins.install.dropHere')}
                </Text>
                <Text size="xs" color="muted">
                  {t('plugins.install.dropHint')}
                </Text>
              </Flex>
              <Button
                variant="outline"
                size="sm"
                onClick={handleBrowse}
                className="mt-2"
              >
                {t('plugins.install.browse')}
              </Button>
            </>
          )}
        </Flex>

        {state === 'error' && errorMessage && (
          <Alert tone="error" className="mt-3">
            {errorMessage}
          </Alert>
        )}
      </Box>
    </Flex>
  )
}
