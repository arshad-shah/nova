// `Plug` (vs the Explorer's `Database`) keeps the two activity bars visually
// distinct — Explorer is for browsing schema objects, Connections is for
// managing live sessions. Same verbs as the per-row PlugZap/Plug actions
// inside ActiveConnectionsPanel, so the iconography reads as one family.
import { ListTree, Plug, Activity } from 'lucide-react'
import { useUiStore, SECONDARY_PANEL } from '@/stores/ui'
import { Stack, Spacer, Tooltip, IconButton } from '@/primitives'
import { PluginSlot } from '@/components/plugins/PluginSlot'
import { NotificationBell } from './NotificationBell'
import { useTranslation } from '@/i18n/I18nProvider'

export function SecondaryActivityBar() {
  const { t } = useTranslation()
  const active = useUiStore(s => s.secondaryActivePanel)
  const visible = useUiStore(s => s.secondarySidebarVisible)
  const setActive = useUiStore(s => s.setSecondaryActivePanel)

  const renderButton = (id: string, Icon: typeof ListTree, label: string) => {
    const isActive = active === id && visible
    return (
      <Tooltip key={id} content={label} side="left">
        <IconButton
          label={label}
          size="lg"
          variant="nav"
          active={isActive}
          onClick={() => setActive(id)}
          className="rounded-lg"
        >
          <Icon size={20} />
        </IconButton>
      </Tooltip>
    )
  }

  return (
    <Stack
      align="center"
      gap="xs"
      className="w-12 bg-bg-primary border-l border-border shrink-0 pt-2"
    >
      {renderButton(SECONDARY_PANEL.CONNECTIONS, Plug, t('shell.secondaryActivityBar.connections'))}
      {renderButton(SECONDARY_PANEL.INSPECTOR, ListTree, t('shell.secondaryActivityBar.inspector'))}
      {renderButton(SECONDARY_PANEL.ACTIVITY, Activity, t('shell.secondaryActivityBar.activity'))}
      <PluginSlot id="app.secondaryActivityBar.top" />
      <Spacer />
      <PluginSlot id="app.secondaryActivityBar.bottom" />
      <NotificationBell />
    </Stack>
  )
}
