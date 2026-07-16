import { X } from 'lucide-react'
import { Box, Flex, cn, Button } from '@/primitives'
import { useTranslation } from '@/i18n/I18nProvider'

export interface BottomTab {
  id: string
  title: string
}

interface Props {
  tabs: BottomTab[]
  activeId: string
  onSelect: (id: string) => void
  onClose: () => void
}

export function BottomDockTabs({ tabs, activeId, onSelect, onClose }: Props) {
  const { t } = useTranslation()
  return (
    <Flex align="center" className="h-8 border-b border-border bg-bg-secondary px-1 shrink-0">
      {tabs.map(tab => (
        <Button
          variant="bare"
          size="none"
          key={tab.id}
          type="button"
          onClick={() => onSelect(tab.id)}
          className={cn(
            'h-7 px-3 text-xs rounded-sm transition-colors',
            activeId === tab.id
              ? 'bg-bg-primary text-text-primary'
              : 'text-text-muted hover:text-text-primary hover:bg-white/5'
          )}
        >
          {tab.title}
        </Button>
      ))}
      <Box className="flex-1" />
      <Button
        variant="bare"
        size="none"
        type="button"
        aria-label={t('shell.bottomDock.hide')}
        onClick={onClose}
        className="h-7 w-7 inline-flex items-center justify-center text-text-muted hover:text-text-primary hover:bg-white/5 rounded-sm"
      >
        <X size={14} />
      </Button>
    </Flex>
  )
}
