import { Eye, Shield, Zap } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Flex } from '@/primitives/layout/Flex'
import { Text, Box, Button } from '@/primitives'
import { useAIStore } from '@/stores/ai'
import { useTranslation } from '@/i18n/I18nProvider'
import type { MessageKey } from '@shared/i18n'

type Profile = 'read-only' | 'ask-write' | 'auto'

const MODES: { id: Profile; label: MessageKey; icon: LucideIcon; activeClass: string }[] = [
  { id: 'read-only', label: 'aiui.permission.readOnly', icon: Eye,    activeClass: 'bg-bg-tertiary text-success' },
  { id: 'ask-write', label: 'aiui.permission.askWrite', icon: Shield, activeClass: 'bg-bg-tertiary text-accent' },
  { id: 'auto',      label: 'aiui.permission.auto',      icon: Zap,    activeClass: 'bg-bg-tertiary text-error' },
]

/**
 * Segmented control bound to useAIStore.permissionProfile. Writes through
 * setPermissionProfile so the plugin persists the choice; the local state
 * updates after the round-trip.
 */
export function PermissionModeRow() {
  const { t } = useTranslation()
  const profile = useAIStore((s) => s.permissionProfile)
  const setProfile = useAIStore((s) => s.setPermissionProfile)

  return (
    <Flex align="center" gap="sm" className="px-3 py-1.5 border-b border-border-default/40 text-[10px]">
      <Shield size={11} className="text-text-tertiary" />
      <Text size="xs" color="muted">{t('aiui.permission.mode')}</Text>
      <Box className="ml-auto inline-flex gap-0.5 bg-bg-primary border border-border-default rounded p-0.5">
        {MODES.map((m) => {
          const Icon = m.icon
          const active = profile === m.id
          return (
            <Button
              variant="bare"
              size="none"
              key={m.id}
              type="button"
              onClick={() => { if (!active) void setProfile(m.id) }}
              className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] transition-colors ${active ? m.activeClass : 'text-text-tertiary hover:text-text-secondary'}`}
              aria-pressed={active}
            >
              <Icon size={10} />
              {t(m.label)}
            </Button>
          )
        })}
      </Box>
    </Flex>
  )
}
