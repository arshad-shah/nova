import { Sparkles } from 'lucide-react'
import { Tooltip, IconButton, cn } from '@/primitives'
import { useAIStore } from '@/stores/ai'
import { useUiStore } from '@/stores/ui'
import { useTranslation } from '@/i18n/I18nProvider'

/**
 * The "open AI chat" button that lives at the bottom of the ActivityBar.
 * Owned by the AI plugin and mounted via PluginSlot — disabling the
 * plugin removes the button without the host needing to know.
 */
export function AIToggleButton() {
  const { t } = useTranslation()
  const toggle = useAIStore((s) => s.togglePanel)
  const open = useUiStore(
    (s) => s.secondarySidebarVisible && s.secondaryActivePanel === 'plugin:ai-chat'
  )

  return (
    <Tooltip content={t('aiui.toggle.label')} side="left">
      <IconButton
        label={t('aiui.toggle.label')}
        size="lg"
        variant="ghost"
        onClick={toggle}
        className={cn(
          'rounded-lg transition-colors',
          open
            ? 'bg-accent/10 text-accent hover:bg-accent/10'
            : 'text-text-muted hover:text-text-primary hover:bg-hover'
        )}
      >
        <Sparkles size={20} />
      </IconButton>
    </Tooltip>
  )
}
