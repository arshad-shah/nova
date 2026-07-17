import { useEffect } from 'react'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { useTabsStore } from '@/stores/tabs'
import { requestCloseTab } from '@/stores/tab-actions'
import { useConnectionsStore, useActiveProfile } from '@/stores/connections'
import { initialAutoCommit } from '@/lib/initial-autocommit'
import { Flex, IconButton, Tooltip, cn } from '@/primitives'
import { TabItem } from './TabItem'
import { useClipboard } from '@/hooks/useClipboard'
import { useTabScroll } from './useTabScroll'
import { useTabDrag } from './useTabDrag'
import { useTranslation } from '@/i18n/I18nProvider'

export function TabBar() {
  const { t } = useTranslation()
  const { copy } = useClipboard()
  const {
    tabs,
    activeTabId,
    setActiveTab,
    closeTab,
    closeOtherTabs,
    closeTabsToRight,
    closeAllTabs,
    addQueryTab,
    reorderTabs,
    duplicateTab,
  } = useTabsStore()
  const activeConnectionId = useConnectionsStore(s => s.activeConnectionId)
  const activeProfile = useActiveProfile()

  const { scrollRef, canScrollLeft, canScrollRight, scrollLeft, scrollRight, scrollIntoView, onWheel } =
    useTabScroll()
  const { draggedIndex, dropIndex, onDragStart, onDragOver, onDragEnd } = useTabDrag({
    onReorder: reorderTabs,
  })

  // Keep the active tab scrolled into view
  useEffect(() => {
    if (activeTabId) {
      scrollIntoView(activeTabId)
    }
  }, [activeTabId, scrollIntoView])

  const getContextMenuItems = (tabId: string, index: number) => {
    const tab = tabs.find(item => item.id === tabId)
    return [
      { label: t('shell.tabBar.close'), onSelect: () => requestCloseTab(tabId, closeTab) },
      { label: t('shell.tabBar.closeOthers'), onSelect: () => closeOtherTabs(tabId), disabled: tabs.length <= 1 },
      { label: t('shell.tabBar.closeToRight'), onSelect: () => closeTabsToRight(tabId), disabled: index >= tabs.length - 1 },
      { label: t('shell.tabBar.closeAll'), onSelect: () => closeAllTabs() },
      { label: t('shell.tabBar.duplicate'), onSelect: () => duplicateTab(tabId), disabled: tab?.type !== 'query' },
      {
        label: t('shell.tabBar.copyTitle'),
        onSelect: () => copy(tab?.title ?? ''),
      },
    ]
  }

  return (
    <Flex
      align="end"
      gap="xs"
      className="h-10 shrink-0 bg-tab-bar-bg px-2 pt-1.5"
    >
      {/* Scroll left arrow */}
      {canScrollLeft && (
        <IconButton
          label={t('shell.tabBar.scrollLeft')}
          size="xs"
          variant="ghost"
          onClick={scrollLeft}
          tabIndex={-1}
        className={cn(
          'shrink-0 text-text-tertiary hover:text-text-primary transition-opacity',
        )}
      >
        <ChevronLeft size={14} />
      </IconButton>)}

      {/* Scrollable tab trough */}
      <Flex
        ref={scrollRef}
        onWheel={onWheel}
        align="end"
        className="flex-1 h-full overflow-x-hidden gap-0.5"
      >
        {tabs.map((tab, index) => (
          <TabItem
            key={tab.id}
            tab={tab}
            index={index}
            isActive={activeTabId === tab.id}
            isDragged={draggedIndex === index}
            isDropTarget={dropIndex === index && draggedIndex !== index}
            contextMenuItems={getContextMenuItems(tab.id, index)}
            onActivate={() => setActiveTab(tab.id)}
            onClose={() => requestCloseTab(tab.id, closeTab)}
            onDragStart={(e) => onDragStart(e, index)}
            onDragOver={(e) => onDragOver(e, index)}
            onDragEnd={onDragEnd}
          />
        ))}
      </Flex>

      {/* Scroll right arrow */}
  { canScrollRight && (
    <IconButton
      label={t('shell.tabBar.scrollRight')}
      size="xs"
      variant="ghost"
      onClick={scrollRight}
      tabIndex={-1}
        className={cn(
          'shrink-0 text-text-tertiary hover:text-text-primary transition-opacity',
        )}
      >
        <ChevronRight size={14} />
      </IconButton>)}

      {/* New tab button */}
      <Tooltip content={t('shell.tabBar.newTab')} side="bottom">
        <IconButton
          label={t('shell.tabBar.newTab')}
          size="xs"
          variant="ghost"
          onClick={() => addQueryTab(activeConnectionId, null, { autoCommit: initialAutoCommit(activeProfile) })}
          className="shrink-0 text-text-tertiary hover:text-text-primary"
        >
          <Plus size={14} />
        </IconButton>
      </Tooltip>
    </Flex>
  )
}
