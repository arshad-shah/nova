import { Eye, Shield, Zap } from 'lucide-react'
import { Flex } from '@/primitives/layout/Flex'
import { Text, SegmentedControl } from '@/primitives'
import type { SegmentedOption } from '@/primitives'
import { useAIStore } from '@/stores/ai'
import { useTranslation } from '@/i18n/I18nProvider'
import type { MessageKey } from '@shared/i18n'

type Profile = 'read-only' | 'ask-write' | 'auto'

/** The tone is the point: these modes are not peers. Read-only is safe, auto
 *  writes without asking, so each carries its own colour. */
const MODES: { id: Profile; label: MessageKey; icon: typeof Eye; tone: SegmentedOption['tone'] }[] = [
  { id: 'read-only', label: 'aiui.permission.readOnly', icon: Eye, tone: 'success' },
  { id: 'ask-write', label: 'aiui.permission.askWrite', icon: Shield, tone: 'accent' },
  { id: 'auto', label: 'aiui.permission.auto', icon: Zap, tone: 'error' },
]

/**
 * Bound to useAIStore.permissionProfile. Writes through setPermissionProfile so
 * the plugin persists the choice; the local state updates after the round-trip.
 */
export function PermissionModeRow() {
  const { t } = useTranslation()
  const profile = useAIStore((s) => s.permissionProfile)
  const setProfile = useAIStore((s) => s.setPermissionProfile)

  const options: SegmentedOption<Profile>[] = MODES.map((m) => ({
    value: m.id,
    label: t(m.label),
    icon: <m.icon size={10} />,
    tone: m.tone,
  }))

  return (
    <Flex align="center" gap="sm" className="px-3 py-1.5 border-b border-border-default/40 text-3xs">
      <Shield size={11} className="text-text-tertiary" />
      <Text size="xs" color="muted">{t('aiui.permission.mode')}</Text>
      <SegmentedControl
        size="xs"
        className="ml-auto"
        label={t('aiui.permission.mode')}
        options={options}
        value={profile}
        onChange={(id) => void setProfile(id)}
      />
    </Flex>
  )
}
