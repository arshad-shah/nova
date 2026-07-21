import { useEffect } from 'react'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { useTabsStore } from '@/stores/tabs'
import { requestCloseTab, requestCloseTabs } from '@/stores/tab-actions'
import { useConnectionsStore, useActiveProfile } from '@/stores/connections'
import { initialAutoCommit } from '@/lib/initial-autocommit'
import { Flex, IconButton, Tooltip, cn } from '@/primitives'
import type { MenuNode } from '@/primitives/surfaces/menu/types'
import { TabItem } from './TabItem'
import { useClipboard } from '@/hooks/useClipboard'
import { useTabScroll } from './useTabScroll'
import { useTabDrag } from './useTabDrag'
import { useTabKeyboardNav } from './useTabKeyboardNav'
import { useTranslation } from '@/i18n/I18nProvider'

export function TabBar() {
  const { t } = useTranslation()
  const { copy } = useClipboard()
  const {
    tabs,
    activeTabId,
    setActiveTab,
    closeTab,
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
  const { onKeyDown, tabIndexFor, onTabFocus } = useTabKeyboardNav({
    tabs,
    activeTabId,
    onActivate: setActiveTab,
    onClose: (id) => requestCloseTab(id, closeTab),
    scrollIntoView,
  })

  // Keep the active tab scrolled into view
  useEffect(() => {
    if (activeTabId) {
      scrollIntoView(activeTabId)
    }
  }, [activeTabId, scrollIntoView])

  const getContextMenuItems = (tabId: string, index: number): MenuNode[] => {
    const tab = tabs.find(item => item.id === tabId)
    return [
      { kind: 'item', id: 'close', label: t('shell.tabBar.close'), onSelect: () => requestCloseTab(tabId, closeTab) },
      {
        kind: 'item',
        id: 'close-others',
        label: t('shell.tabBar.closeOthers'),
        onSelect: () => requestCloseTabs(tabs.filter(x => x.id !== tabId).map(x => x.id), closeTab),
        disabled: tabs.length <= 1,
      },
      {
        kind: 'item',
        id: 'close-to-right',
        label: t('shell.tabBar.closeToRight'),
        onSelect: () => requestCloseTabs(tabs.slice(index + 1).map(x => x.id), closeTab),
        disabled: index >= tabs.length - 1,
      },
      {
        kind: 'item',
        id: 'close-all',
        label: t('shell.tabBar.closeAll'),
        onSelect: () => requestCloseTabs(tabs.map(x => x.id), closeTab),
      },
      {
        kind: 'item',
        id: 'duplicate',
        label: t('shell.tabBar.duplicate'),
        onSelect: () => duplicateTab(tabId),
        disabled: tab?.type !== 'query',
      },
      {
        kind: 'item',
        id: 'copy-title',
        label: t('shell.tabBar.copyTitle'),
        onSelect: () => copy(tab?.title ?? ''),
      },
    ]
  }

  return (
    <Flex
      align="end"
      gap="xs"
      className="h-(--tab-bar-h) shrink-0 bg-tab-bar-bg px-2 pt-1.5"
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
        onKeyDown={onKeyDown}
        role="tablist"
        aria-orientation="horizontal"
        aria-label={t('shell.tabBar.tablistLabel')}
        align="end"
        className="flex-1 h-full overflow-x-hidden gap-0.5"
      >
        {tabs.map((tab, index) => (
          <TabItem
            key={tab.id}
            tab={tab}
            isActive={activeTabId === tab.id}
            isDragged={draggedIndex === index}
            isDropTarget={dropIndex === index && draggedIndex !== index}
            contextMenuItems={getContextMenuItems(tab.id, index)}
            onActivate={() => setActiveTab(tab.id)}
            onClose={() => requestCloseTab(tab.id, closeTab)}
            onDragStart={(e) => onDragStart(e, index)}
            onDragOver={(e) => onDragOver(e, index)}
            onDragEnd={onDragEnd}
            tabIndex={tabIndexFor(tab.id)}
            onFocus={() => onTabFocus(tab.id)}
          />
        ))}
      </Flex>

      {/* Scroll right arrow */}
      {canScrollRight && (
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
