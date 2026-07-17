import { useState, type DragEvent, type MouseEvent } from 'react'
import { X } from 'lucide-react'
import type { Tab } from '@shared/types'
import { Box, Flex, Text, Tooltip, ContextMenu, cn, iconButtonVariants } from '@/primitives'
import { getTabIcon } from './tab-icons'
import { useTranslation } from '@/i18n/I18nProvider'
import './tab-bar.css'

interface TabItemProps {
  tab: Tab
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
          {/* No `color` prop: `Text`'s `color` variant only has the global
           * semantic values (primary/secondary/...), none of which is the
           * tab-specific token this label needs. `className` is merged in
           * last via `cn`/`tailwind-merge`, so a `text-tab-*-fg` utility here
           * wins over the component's default `text-text-primary` and
           * actually routes through the container's own
           * `--color-tab-active-fg` / `--color-tab-inactive-fg`. */}
          <Text
            size="xs"
            truncate
            className={cn(
              'max-w-32',
              isActive ? 'text-tab-active-fg font-medium' : 'text-tab-inactive-fg',
            )}
          >
            {tab.title}
          </Text>
        </Tooltip>

        {/* Close / dirty indicator.
         *
         * Deliberately a `role="button"` span and NOT the `IconButton`
         * primitive (whose native <button> is unconditionally focusable).
         *
         * ARIA gives `tab` presentational children: assistive tech never
         * exposes anything inside a tab, so a focusable control here is
         * unreachable by AT no matter what we do — which is exactly what axe's
         * `nested-interactive` rule says. `tabIndex={-1}` does not help; axe
         * calls a negative tabindex an "unreliable hiding strategy" and fails
         * it anyway.
         *
         * Nor can the close control move out of the tab and sit beside it:
         * `tablist` may only own `tab`, so a sibling button makes the tablist
         * fail `aria-required-children` ("Element has children which are not
         * allowed: button[aria-label]"). Verified — the sibling structure
         * simply trades one axe violation for another.
         *
         * So the only structure that satisfies both rules is this one: the
         * close control stays inside the tab and stops being focusable. Its
         * `aria-label` is retained for tooling, not for assistive tech — `tab`
         * gives its children presentational semantics, so AT never exposes a
         * button named "Close tab" here regardless of this attribute. What the
         * label actually does is feed the tab's accessible-name-from-content
         * computation and let tests query `getByRole('button', { name: ... })`.
         * Mouse behaviour is unaffected; the keyboard path
         * is Delete/Backspace on the roving tab (useTabKeyboardNav) plus the
         * context menu's Close items — both of which already existed and are
         * the paths AT users actually have.
         *
         * `iconButtonVariants` keeps the look identical to the IconButton this
         * replaces, from the same source of truth. */}
        <Box
          as="span"
          role="button"
          aria-label={isDirty ? t('shell.tabBar.closeTabUnsaved') : t('shell.tabBar.closeTab')}
          className={cn(
            iconButtonVariants({ variant: 'tab-action', size: 'tab-action' }),
            'ml-0.5 shrink-0 transition-opacity duration-(--transition-fast)',
            !isActive && !isDirty && 'opacity-0 group-hover:opacity-100',
          )}
          onClick={(e: MouseEvent) => { e.stopPropagation(); onClose() }}
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
        </Box>
      </Flex>
    </ContextMenu>
  )
}
