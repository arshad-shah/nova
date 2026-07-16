import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  useFloating,
  useClick,
  useDismiss,
  useRole,
  useInteractions,
  useTransitionStyles,
  FloatingPortal,
  offset,
  flip,
  shift,
  autoUpdate,
  size as floatingSize,
} from '@floating-ui/react'
import { cva, type VariantProps } from 'class-variance-authority'
import { Check, ChevronDown, Search, X } from 'lucide-react'
import { cn } from '../utils/cn'
import { fieldRowVariants, fieldSizeVariants } from './field-variants'
import { Input } from './Input'

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type SelectOption = {
  value: string
  label: string
  disabled?: boolean
}

export type SelectGroup = {
  label: string
  options: SelectOption[]
}

export type SelectItem = SelectOption | SelectGroup

function isGroup(item: SelectItem): item is SelectGroup {
  return 'options' in item
}

function flattenOptions(items: SelectItem[]): SelectOption[] {
  const result: SelectOption[] = []
  for (const item of items) {
    if (isGroup(item)) {
      result.push(...item.options)
    } else {
      result.push(item)
    }
  }
  return result
}

/* ------------------------------------------------------------------ */
/*  Trigger variants (matches Input sizing)                            */
/* ------------------------------------------------------------------ */

/**
 * The trigger is the field shell again — it was the fourth hand-made copy of
 * it, with its own hardcoded heights, which meant Select silently ignored the
 * density setting that rescales every other field. `fieldRowVariants` is that
 * shell, already shared by FilePathInput and FileContentInput.
 *
 * Composed at call time rather than baked into a cva base: `fieldRowVariants()`
 * applies its own default size, so putting it in a static base would emit
 * `[--field-ctl-h:…]` twice and leave which one wins up to stylesheet order.
 */
export type SelectSize = keyof typeof fieldSizeVariants
export type SelectState = 'default' | 'error' | 'success'

/** Border + ring per validity. Mirrors Input's `state` exactly — Select and
 *  Input are siblings, and a form couldn't mark a select invalid at all before
 *  this, because it had no such prop. */
const TRIGGER_STATE: Record<SelectState, string> = {
  default:
    'border-border-default hover:border-border-strong focus:border-accent focus:shadow-[var(--shadow-focus-glow),var(--shadow-input-inset)]',
  error: 'border-error focus:shadow-[var(--shadow-error-ring),var(--shadow-input-inset)]',
  success: 'border-success focus:shadow-[var(--shadow-success-ring),var(--shadow-input-inset)]',
}

const TRIGGER_BASE =
  'w-full cursor-pointer justify-between focus:outline-none disabled:pointer-events-none disabled:opacity-50'

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */

export interface SelectProps {
  size?: SelectSize
  /** Validity styling. The message belongs to `FormField`, as with Input. */
  state?: SelectState
  id?: string
  value: string
  onChange: (value: string) => void
  options: SelectItem[]
  renderOption?: (option: SelectOption, state: { selected: boolean; focused: boolean }) => React.ReactNode
  renderValue?: (option: SelectOption | undefined) => React.ReactNode
  placeholder?: string
  disabled?: boolean
  searchable?: boolean
  searchPlaceholder?: string
  /** Leading slot in the trigger — an icon that says what's being chosen. */
  prefix?: React.ReactNode
  /** Offer to unset the value. Only shown once something is selected. */
  clearable?: boolean
  /** Called to unset the value. Required for `clearable` to do anything. */
  onClear?: () => void
  className?: string
  'aria-label'?: string
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

const TYPEAHEAD_RESET_MS = 500

export function Select({
  id,
  value,
  onChange,
  options,
  renderOption,
  renderValue,
  placeholder = 'Select\u2026',
  disabled = false,
  searchable = false,
  searchPlaceholder = 'Search\u2026',
  prefix,
  clearable = false,
  onClear,
  size,
  state,
  className,
  'aria-label': ariaLabel,
}: SelectProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [focusedIndex, setFocusedIndex] = useState(-1)
  const [searchQuery, setSearchQuery] = useState('')
  const typeaheadRef = useRef('')
  const typeaheadTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  const listRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  const allOptions = useMemo(() => flattenOptions(options), [options])
  const selectedOption = allOptions.find((o) => o.value === value)

  const filteredOptions = useMemo(() => {
    if (!searchable || !searchQuery) return allOptions
    const q = searchQuery.toLowerCase()
    return allOptions.filter((o) => o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q))
  }, [allOptions, searchQuery, searchable])

  /* ---- floating-ui ---- */

  const { refs, floatingStyles, context } = useFloating({
    placement: 'bottom-start',
    open: isOpen,
    onOpenChange: setIsOpen,
    whileElementsMounted: autoUpdate,
    middleware: [
      offset(4),
      flip({ padding: 8 }),
      shift({ padding: 8 }),
      floatingSize({
        apply({ rects, elements, availableHeight }) {
          Object.assign(elements.floating.style, {
            minWidth: `${rects.reference.width}px`,
            maxWidth: `${Math.max(rects.reference.width, 320)}px`,
            maxHeight: `${Math.min(availableHeight, 320)}px`,
          })
        },
        padding: 8,
      }),
    ],
  })

  const click = useClick(context)
  const dismiss = useDismiss(context)
  const role = useRole(context, { role: 'listbox' })

  const { getReferenceProps, getFloatingProps } = useInteractions([click, dismiss, role])

  const { isMounted, styles: transitionStyles } = useTransitionStyles(context, {
    duration: { open: 150, close: 100 },
    initial: { opacity: 0, transform: 'scaleY(0.95)' },
    common: { transformOrigin: 'top', transitionTimingFunction: 'cubic-bezier(0.34, 1.56, 0.64, 1)' },
    open: { opacity: 1, transform: 'scaleY(1)' },
    close: { opacity: 0, transform: 'scaleY(0.95)' },
  })

  /* ---- Focus management ---- */

  const visibleOptions = searchable ? filteredOptions : allOptions

  const getEnabledIndices = useCallback(() => {
    return visibleOptions.reduce<number[]>((acc, opt, i) => {
      if (!opt.disabled) acc.push(i)
      return acc
    }, [])
  }, [visibleOptions])

  useEffect(() => {
    if (isOpen) {
      const selectedIdx = visibleOptions.findIndex((o) => o.value === value)
      if (selectedIdx >= 0 && !visibleOptions[selectedIdx].disabled) {
        setFocusedIndex(selectedIdx)
      } else {
        const enabled = getEnabledIndices()
        setFocusedIndex(enabled[0] ?? -1)
      }
      if (searchable) {
        requestAnimationFrame(() => searchInputRef.current?.focus())
      }
    } else {
      setFocusedIndex(-1)
      setSearchQuery('')
    }
  }, [isOpen, visibleOptions, value, getEnabledIndices, searchable])

  // Re-focus first enabled option when search query changes
  useEffect(() => {
    if (isOpen && searchable && searchQuery) {
      const enabled = getEnabledIndices()
      setFocusedIndex(enabled[0] ?? -1)
    }
  }, [searchQuery, isOpen, searchable, getEnabledIndices])

  useEffect(() => {
    if (focusedIndex < 0 || !listRef.current) return
    const el = listRef.current.querySelector(`[data-option-index="${focusedIndex}"]`)
    if (el && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ block: 'nearest' })
    }
  }, [focusedIndex])

  /* ---- Selection ---- */

  const selectOption = useCallback(
    (opt: SelectOption) => {
      if (opt.disabled) return
      onChange(opt.value)
      setIsOpen(false)
    },
    [onChange]
  )

  /* ---- Keyboard ---- */

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!isOpen) {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          setIsOpen(true)
        }
        return
      }

      const enabled = getEnabledIndices()
      const currentEnabledPos = enabled.indexOf(focusedIndex)

      switch (e.key) {
        case 'ArrowDown': {
          e.preventDefault()
          if (enabled.length === 0) break
          const next = currentEnabledPos < enabled.length - 1 ? enabled[currentEnabledPos + 1] : enabled[0]
          setFocusedIndex(next)
          break
        }
        case 'ArrowUp': {
          e.preventDefault()
          if (enabled.length === 0) break
          const prev = currentEnabledPos > 0 ? enabled[currentEnabledPos - 1] : enabled[enabled.length - 1]
          setFocusedIndex(prev)
          break
        }
        case 'Home': {
          e.preventDefault()
          setFocusedIndex(enabled[0] ?? -1)
          break
        }
        case 'End': {
          e.preventDefault()
          setFocusedIndex(enabled[enabled.length - 1] ?? -1)
          break
        }
        case 'Enter': {
          e.preventDefault()
          if (focusedIndex >= 0 && visibleOptions[focusedIndex]) {
            selectOption(visibleOptions[focusedIndex])
          }
          break
        }
        case ' ': {
          // Allow space in search input for typing
          if (searchable) break
          e.preventDefault()
          if (focusedIndex >= 0 && visibleOptions[focusedIndex]) {
            selectOption(visibleOptions[focusedIndex])
          }
          break
        }
        case 'Escape': {
          e.preventDefault()
          setIsOpen(false)
          break
        }
        case 'Tab': {
          setIsOpen(false)
          break
        }
        default: {
          // Only do typeahead when not searchable (search input handles its own typing)
          if (!searchable && e.key.length === 1) {
            e.preventDefault()
            typeaheadRef.current += e.key.toLowerCase()
            clearTimeout(typeaheadTimerRef.current)
            typeaheadTimerRef.current = setTimeout(() => {
              typeaheadRef.current = ''
            }, TYPEAHEAD_RESET_MS)

            const match = visibleOptions.findIndex(
              (opt, i) => !opt.disabled && opt.label.toLowerCase().startsWith(typeaheadRef.current) && enabled.includes(i)
            )
            if (match >= 0) setFocusedIndex(match)
          }
        }
      }
    },
    [isOpen, focusedIndex, visibleOptions, getEnabledIndices, selectOption, searchable]
  )

  /* ---- Render helpers ---- */

  const clearShown = clearable && Boolean(selectedOption) && !disabled && Boolean(onClear)

  function renderTriggerContent() {
    if (renderValue) return renderValue(selectedOption)
    if (selectedOption) return <span className="truncate">{selectedOption.label}</span>
    return <span className="truncate text-text-muted">{placeholder}</span>
  }

  function renderOptionContent(opt: SelectOption, state: { selected: boolean; focused: boolean }) {
    if (renderOption) return renderOption(opt, state)
    return (
      <>
        <span className="truncate flex-1">{opt.label}</span>
        {/* `text-accent`, not `text-text-accent`: the latter is not a token, so
            the class emitted no CSS and this tick quietly inherited body colour
            instead of the accent. */}
        {state.selected && <Check size={14} className="shrink-0 text-accent" />}
      </>
    )
  }

  /* ---- Build flat render list with group headers ---- */

  type RenderItem =
    | { kind: 'option'; option: SelectOption; flatIndex: number }
    | { kind: 'group'; label: string }

  const renderItems = useMemo(() => {
    const items: RenderItem[] = []

    // When searchable, use the flat filtered list (groups are flattened by filter)
    if (searchable && searchQuery) {
      for (let i = 0; i < filteredOptions.length; i++) {
        items.push({ kind: 'option', option: filteredOptions[i], flatIndex: i })
      }
      return items
    }

    let flatIdx = 0
    for (const item of options) {
      if (isGroup(item)) {
        items.push({ kind: 'group', label: item.label })
        for (const opt of item.options) {
          items.push({ kind: 'option', option: opt, flatIndex: flatIdx++ })
        }
      } else {
        items.push({ kind: 'option', option: item, flatIndex: flatIdx++ })
      }
    }
    return items
  }, [options, searchable, searchQuery, filteredOptions])

  /* ---- JSX ---- */

  return (
    <div className={cn('relative', className)}>
      <button
        type="button"
        id={id}
        ref={refs.setReference}
        disabled={disabled}
        className={cn(fieldRowVariants({ size }), TRIGGER_BASE, TRIGGER_STATE[state ?? 'default'])}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-invalid={state === 'error' || undefined}
        aria-label={ariaLabel}
        {...getReferenceProps({
          onKeyDown: handleKeyDown,
        })}
      >
        {prefix && <span className="flex shrink-0 items-center text-text-muted">{prefix}</span>}
        {renderTriggerContent()}
        {clearShown && (
          // A span, not a button: this trigger is already a <button> and HTML
          // forbids nesting one inside another — React renders it, the browser
          // un-nests it, and the click handler is quietly lost. The clear
          // affordance is reachable another way (Backspace on the open list),
          // so it's aria-hidden rather than a fake control.
          <span
            role="presentation"
            aria-hidden="true"
            onClick={(e) => {
              // Without this the click bubbles to the trigger and opens the
              // list at the same moment the value is cleared.
              e.stopPropagation()
              onClear?.()
            }}
            className="ml-auto flex shrink-0 items-center text-text-muted transition-colors hover:text-text-primary"
          >
            <X size={13} />
          </span>
        )}
        <ChevronDown
          size={14}
          className={cn(
            'shrink-0 text-text-muted transition-transform duration-(--transition-fast)',
            !clearShown && 'ml-auto',
            isOpen && 'rotate-180'
          )}
        />
      </button>

      {isMounted && (
        <FloatingPortal>
          <div
            ref={refs.setFloating}
            style={{ ...floatingStyles, zIndex: 50 }}
            {...getFloatingProps({
              onKeyDown: handleKeyDown,
            })}
            aria-label={ariaLabel}
            aria-activedescendant={focusedIndex >= 0 ? `select-option-${focusedIndex}` : undefined}
          >
            <div
              className={cn(
                'outline-none',
                'bg-bg-elevated border border-border-default rounded-lg',
                'shadow-dropdown',
              )}
              style={transitionStyles}
            >
              {searchable && (
                <div className="px-2 pt-2 pb-1">
                  {/* A real Input rather than a hand-rolled one — it was the
                      fifth copy of the field shell, with its own hardcoded
                      height that ignored the density setting. */}
                  <Input
                    ref={searchInputRef}
                    size="xs"
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={searchPlaceholder}
                    prefix={<Search size={12} />}
                    aria-label="Filter options"
                  />
                </div>
              )}
              <div
                ref={listRef}
                className="overflow-auto max-h-60 py-1"
              >
                {renderItems.length === 0 && searchable && searchQuery && (
                  <div className="px-3 py-2 text-xs text-text-tertiary">No matches</div>
                )}
                {renderItems.map((item, i) => {
                  if (item.kind === 'group') {
                    return (
                      <div
                        key={`group-${i}`}
                        className="px-3 pt-2 pb-1 text-xs font-semibold text-text-muted uppercase tracking-wider select-none"
                      >
                        {item.label}
                      </div>
                    )
                  }

                  const { option, flatIndex } = item
                  const isSelected = option.value === value
                  const isFocused = flatIndex === focusedIndex

                  return (
                    <div
                      key={option.value}
                      id={`select-option-${flatIndex}`}
                      role="option"
                      aria-selected={isSelected}
                      aria-disabled={option.disabled || undefined}
                      data-option-index={flatIndex}
                      className={cn(
                        'flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer transition-colors duration-(--transition-fast)',
                        isFocused && 'bg-hover',
                        option.disabled && 'opacity-50 pointer-events-none',
                      )}
                      onPointerMove={() => {
                        if (!option.disabled && focusedIndex !== flatIndex) setFocusedIndex(flatIndex)
                      }}
                      onClick={() => selectOption(option)}
                    >
                      {renderOptionContent(option, { selected: isSelected, focused: isFocused })}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </FloatingPortal>
      )}
    </div>
  )
}

Select.displayName = 'Select'
