import { Bell } from 'lucide-react'
import { useNotificationsStore } from '@/stores/notifications'
import { useUiStore, SECONDARY_PANEL } from '@/stores/ui'
import { Box, IconButton, BadgeIndicator, Tooltip } from '@/primitives'
import { cn } from '@/primitives/utils/cn'
import { useTranslation } from '@/i18n/I18nProvider'

export function NotificationBell() {
  const { t } = useTranslation()
  const unread = useNotificationsStore((s) => s.unreadCount())
  const { secondarySidebarVisible, secondaryActivePanel, setSecondaryActivePanel } = useUiStore()
  const isActive = secondarySidebarVisible && secondaryActivePanel === SECONDARY_PANEL.NOTIFICATIONS

  return (
    <Box>
      <Tooltip content={t('shell.notifications.bell')} side="left">
        <BadgeIndicator variant="number" count={unread} side="top-left">
          <IconButton
            onClick={() => setSecondaryActivePanel(SECONDARY_PANEL.NOTIFICATIONS)}
            variant={isActive ? 'outline' : 'ghost'}
            size="lg"
            label={t('shell.notifications.bell')}
            className={cn(
              'rounded-lg transition-colors',
              isActive
                ? 'bg-accent/10 text-accent hover:bg-accent/10'
                : 'text-text-muted hover:text-text-primary hover:bg-hover'
            )}
          >
            <Bell size={20} />
          </IconButton>
        </BadgeIndicator>
      </Tooltip>
    </Box>
  )
}
