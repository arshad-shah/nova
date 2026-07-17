import React, { useCallback, useLayoutEffect } from 'react'
import { useListItem } from '@floating-ui/react'
import { Check, ChevronRight } from 'lucide-react'
import { KbdGroup } from '../../typography/KbdGroup'
import { cn } from '../../utils/cn'
import { useMenuLevel, MENU_SIZE } from './menu-context'

/**
 * The rows of a menu. Every row kind renders through {@link MenuRow}, so the
 * gutter rule, the size scale, and the focus/activation behaviour exist once.
 */

const GUTTER = 'w-3.5 shrink-0'

type MenuRowProps = {
  role: 'menuitem' | 'menuitemcheckbox' | 'menuitemradio'
  label: string
  /** Content for the leading column. Presence also decides the level's gutter. */
  gutter?: React.ReactNode
  /** Reserve the gutter even when this row has nothing to put in it. */
  needsGutter?: boolean
  shortcut?: string
  trailing?: React.ReactNode
  disabled?: boolean
  tone?: 'default' | 'danger'
  checked?: boolean
  onSelect?: () => void
  /** Submenu triggers manage their own open state and must not close the tree. */
  suppressClose?: boolean
  /**
   * A submenu trigger is two things at once: a row in its parent's list, and
   * the anchor its own level positions against. `useListItem` owns one ref and
   * `useFloating` owns the other, so both are attached to this node.
   */
  triggerRef?: (node: HTMLElement | null) => void
  triggerProps?: Record<string, unknown>
  children?: React.ReactNode
  className?: string
}

export function MenuRow({
  role,
  label,
  gutter,
  needsGutter,
  shortcut,
  trailing,
  disabled,
  tone = 'default',
  checked,
  onSelect,
  suppressClose,
  triggerRef,
  triggerProps,
  children,
  className,
}: MenuRowProps) {
  const level = useMenuLevel()
  // `useListItem` registers this row's DOM node and label with the level, which
  // is what keeps arrow-key order and typeahead matching the rendered order.
  // Disabled rows register a null label so typeahead cannot land on them.
  const { ref, index } = useListItem({ label: disabled ? null : label })
  const active = level.activeIndex === index

  const wantsGutter = needsGutter ?? gutter != null
  useLayoutEffect(() => {
    if (wantsGutter) level.reportGutter()
  }, [wantsGutter, level])

  // Merge the list-item ref with an optional floating-reference ref (submenu
  // triggers need both on the same node).
  const setRefs = useCallback(
    (node: HTMLButtonElement | null) => {
      ref(node)
      triggerRef?.(node)
    },
    [ref, triggerRef]
  )

  return (
    <button
      ref={setRefs}
      type="button"
      role={role}
      disabled={disabled}
      aria-checked={role === 'menuitem' ? undefined : Boolean(checked)}
      tabIndex={active ? 0 : -1}
      data-active={active || undefined}
      className={cn(
        'w-full flex items-center rounded-sm text-left whitespace-nowrap',
        'transition-colors duration-(--transition-fast)',
        'disabled:opacity-50 disabled:pointer-events-none',
        // Hover and keyboard focus are the same affordance: `data-active` is
        // driven by list navigation, so arrowing and hovering look identical.
        'hover:bg-hover data-[active]:bg-hover focus-visible:outline-none',
        tone === 'danger' ? 'text-error' : 'text-text-primary',
        MENU_SIZE[level.size].row,
        className
      )}
      {...level.getItemProps({
        ...triggerProps,
        onClick() {
          if (disabled) return
          onSelect?.()
          if (!suppressClose) level.closeTree()
        },
      })}
    >
      {level.hasGutter && (
        <span className={cn(GUTTER, 'flex items-center justify-center')} aria-hidden="true">
          {gutter}
        </span>
      )}
      <span className="flex-1 overflow-hidden text-ellipsis">{children ?? label}</span>
      {shortcut && <KbdGroup accelerator={shortcut} size="sm" className="shrink-0" />}
      {trailing}
    </button>
  )
}

export type MenuItemProps = {
  icon?: React.ReactNode
  shortcut?: string
  onSelect: () => void
  disabled?: boolean
  tone?: 'default' | 'danger'
  /** Used for typeahead and as the accessible name. */
  label: string
  children?: React.ReactNode
}

export function MenuItem({ icon, label, children, ...rest }: MenuItemProps) {
  return (
    <MenuRow
      role="menuitem"
      label={label}
      gutter={icon}
      needsGutter={icon != null}
      {...rest}
    >
      {children ?? label}
    </MenuRow>
  )
}

export type MenuCheckItemProps = Omit<MenuItemProps, 'icon' | 'tone'> & {
  checked: boolean
}

export function MenuCheckItem({ checked, label, children, ...rest }: MenuCheckItemProps) {
  return (
    <MenuRow
      role="menuitemcheckbox"
      label={label}
      checked={checked}
      // Always reserves the gutter: an unchecked row must hold the column open
      // or the label would shift when it becomes checked.
      needsGutter
      gutter={checked ? <Check size={13} strokeWidth={2.5} /> : null}
      {...rest}
    >
      {children ?? label}
    </MenuRow>
  )
}

export type MenuRadioItemProps = MenuCheckItemProps

/**
 * A row in a single-select set. MUST be rendered inside a {@link MenuRadioGroup}:
 * ARIA requires `menuitemradio` rows to sit in a `group`, which is what makes
 * them one mutually-exclusive set rather than N unrelated toggles.
 */
export function MenuRadioItem({ checked, label, children, ...rest }: MenuRadioItemProps) {
  return (
    <MenuRow
      role="menuitemradio"
      label={label}
      checked={checked}
      needsGutter
      gutter={checked ? <Check size={13} strokeWidth={2.5} /> : null}
      {...rest}
    >
      {children ?? label}
    </MenuRow>
  )
}

export type MenuRadioGroupProps = {
  /** Optional accessible name for the set, e.g. "Schema". */
  label?: string
  children: React.ReactNode
}

/**
 * The `role="group"` container that turns a run of {@link MenuRadioItem} rows
 * into one mutually-exclusive set.
 *
 * Without this the rows are announced as unrelated radios and the "one of these
 * is selected" relationship is lost — the whole reason to use radio rows for the
 * database/schema pickers instead of plain items.
 *
 * Unlike {@link MenuSection} this renders no visible header; pass `label` only
 * to name the set for assistive tech.
 */
export function MenuRadioGroup({ label, children }: MenuRadioGroupProps) {
  return (
    <div role="group" aria-label={label}>
      {children}
    </div>
  )
}

export function MenuSeparator() {
  return <div role="separator" className="h-px bg-border-default my-1 mx-2" />
}

export type MenuSectionProps = {
  label: string
  children: React.ReactNode
}

/**
 * A labelled group of rows. Renders `role="group"` with an accessible name, so
 * screen readers announce "Connection, group" rather than reading the label as
 * if it were a menu item.
 */
export function MenuSection({ label, children }: MenuSectionProps) {
  const level = useMenuLevel()
  return (
    <div role="group" aria-label={label}>
      <div
        className={cn(
          'uppercase tracking-wider font-semibold text-text-muted px-2 pt-1.5 pb-1 select-none',
          MENU_SIZE[level.size].label
        )}
      >
        {label}
      </div>
      {children}
    </div>
  )
}

/** The trailing chevron on a submenu trigger. Never occupies the gutter. */
export function SubmenuChevron() {
  return <ChevronRight size={13} className="shrink-0 opacity-50" aria-hidden="true" />
}
