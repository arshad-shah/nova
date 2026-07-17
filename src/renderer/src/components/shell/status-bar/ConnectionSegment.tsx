import { useEffect, useState } from 'react'
import { useConnectionsStore, useActiveProfile } from '@/stores/connections'
import { ConnectionSwitcher } from '../ConnectionSwitcher'
import { StatusBarSegment } from './StatusBarSegment'
import { useTranslation } from '@/i18n/I18nProvider'
import { Box, StatusDot } from '@/primitives'
import { useDriverPresentation } from '@/hooks/useDriverPresentation'

interface Props {
  onNewConnection: () => void
}

export function ConnectionSegment({ onNewConnection }: Props) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  useEffect(() => {
    const handler = () => setOpen(true)
    window.addEventListener('statusbar:open-switcher', handler)
    return () => window.removeEventListener('statusbar:open-switcher', handler)
  }, [])
  const { activeConnectionId, connectedIds } = useConnectionsStore()
  const active = useActiveProfile()
  const isConnected = activeConnectionId ? connectedIds.has(activeConnectionId) : false
  const presentationOf = useDriverPresentation(active?.type ? [active.type] : [])
  const driver = active?.type ? presentationOf(active.type).abbreviation : null

  return (
    <Box className="relative h-full">
      <StatusBarSegment
        as="button"
        tone={isConnected ? 'primary' : 'muted'}
        side="left"
        interactive
        onClick={() => setOpen((p) => !p)}
        aria-expanded={open}
        aria-label={t('shell.statusBar.toggleConnectionSwitcher')}
      >
        <StatusDot
          size="xs"
          tone={isConnected ? 'success' : 'muted'}
          className={isConnected ? 'shadow-[0_0_0_2px_rgba(40,200,64,0.25)]' : undefined}
        />
        {isConnected && active ? (
          <>
            <Box as="span">{active.name}</Box>
            {driver && (
              <Box as="span" className="rounded-sm bg-chip-fill px-1 py-px text-[9.5px] font-medium">
                {driver}
              </Box>
            )}
          </>
        ) : (
          <>
            <Box as="span">{t('shell.statusBar.noConnection')}</Box>
            <Box as="span" className="rounded-sm bg-chip-fill-subtle px-1 py-px text-[9.5px] font-medium opacity-80">
              {t('shell.statusBar.clickToConnect')}
            </Box>
          </>
        )}
      </StatusBarSegment>
      <ConnectionSwitcher
        isOpen={open}
        onClose={() => setOpen(false)}
        onNewConnection={onNewConnection}
      />
    </Box>
  )
}
