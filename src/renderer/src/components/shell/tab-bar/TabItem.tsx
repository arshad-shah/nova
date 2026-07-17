import { useState, type DragEvent } from 'react'
import { X } from 'lucide-react'
import type { Tab } from '@shared/types'
import { Box, Flex, Text, Tooltip, ContextMenu, cn, IconButton } from '@/primitives'
import { getTabIcon } from './tab-icons'
import { useTranslation } from '@/i18n/I18nProvider'
import './tab-bar.css'

interface TabItemProps {
  tab: Tab
  index: number
  isActive: boolean
  isDragged: boolean
  isDropTarget: boolean
  contextMenuItems: { label: string; onSelect: () => void; disabled?: boolean }[]
  onActivate: () => void
  onClose: () => void
  onDragStart: (e: DragEvent) => void
  onDragOver: (e: DragEvent) => void
  onDragEnd: () => void
  tabIndex: 0 | -1
  onFocus: () => void
}

export function TabItem({
  tab,
  isActive,
  isDragged,
  isDropTarget,
  contextMenuItems,
  onActivate,
  onClose,
  onDragStart,
  onDragOver,
  onDragEnd,
  tabIndex,
  onFocus,
}: TabItemProps) {
  const { t } = useTranslation()
  const [closeHovered, setCloseHovered] = useState(false)
  const { icon: Icon, className: iconColor } = getTabIcon(tab.type)
  const isDirty = tab.type === 'query' && tab.isDirty

  return (
    <ContextMenu items={contextMenuItems}>
      <Flex
        align="center"
        id={`tab-${tab.id}`}
        role="tab"
        aria-selected={isActive}
        tabIndex={tabIndex}
        onFocus={onFocus}
        data-tab-id={tab.id}
        draggable
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
        onClick={onActivate}
        onAuxClick={(e) => { if (e.button === 1) { e.preventDefault(); onClose() } }}
        className={cn(
          'group relative cursor-pointer shrink-0 select-none transition-colors duration-(--transition-fast)',
          'h-(--tab-h) px-(--tab-px) gap-(--tab-gap) rounded-t-(--tab-r)',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-inset',
          isActive
            ? 'bg-tab-active-bg text-tab-active-fg'
            : 'bg-transparent text-tab-inactive-fg hover:bg-tab-hover-bg',
          isDragged && 'opacity-50',
          isDropTarget && 'before:absolute before:left-0 before:top-1.5 before:bottom-2 before:w-0.5 before:bg-accent before:rounded-full before:z-10',
        )}
      >
        {/* Active-tab skirt: concave fillets that visually attach the tab to
            the workspace surface (Chrome-style). Rendered only for the active
            tab so inactive tabs stay flat. */}
        {isActive && (
          <>
            <span className="tab-skirt-left" aria-hidden="true" />
            <span className="tab-skirt-right" aria-hidden="true" />
          </>
        )}

        <Icon size={14} className={cn(iconColor, 'shrink-0')} />
        <Tooltip content={tab.title} side="bottom" delay={600}>
          <Text
            size="xs"
            color={isActive ? 'primary' : 'secondary'}
            truncate
            className={cn('max-w-32', isActive && 'font-medium')}
          >
            {tab.title}
          </Text>
        </Tooltip>

        {/* Close / dirty indicator */}
        <IconButton
          size="tab-action"
          label={isDirty ? t('shell.tabBar.closeTabUnsaved') : t('shell.tabBar.closeTab')}
          variant="tab-action"
          className={cn(
            'ml-0.5 transition-opacity duration-(--transition-fast)',
            !isActive && !isDirty && 'opacity-0 group-hover:opacity-100',
          )}
          onClick={(e) => { e.stopPropagation(); onClose() }}
          onMouseEnter={() => setCloseHovered(true)}
          onMouseLeave={() => setCloseHovered(false)}
        >
          {isDirty && !closeHovered ? (
            <Box
              as="span"
              className="block h-1.75 w-1.75 rounded-full bg-warning"
              aria-label={t('shell.tabBar.unsavedChanges')}
            />
          ) : (
            <X
              size={10}
              strokeWidth={2.5}
              className={cn(
                'transition-colors duration-(--transition-fast)',
                isDirty && closeHovered
                  ? 'text-error'
                  : 'text-text-tertiary group-hover:text-text-secondary',
              )}
            />
          )}
        </IconButton>
      </Flex>
    </ContextMenu>
  )
}
