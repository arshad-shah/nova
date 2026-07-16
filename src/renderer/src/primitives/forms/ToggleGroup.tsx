import React, { forwardRef } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../utils/cn'

/**
 * ToggleGroup: a row of independent on/off filters.
 *
 * The multi-select sibling of `SegmentedControl`, and deliberately a separate
 * component rather than a `multiple` flag on it, because almost nothing is
 * shared once the semantics differ:
 * - Each option is its own toggle button (`aria-pressed`), not a radio. Any
 *   number may be on, including none — "no filters" is a real state, whereas a
 *   radio group always has exactly one answer.
 * - So there's no roving tabindex and no arrow-key selection: every toggle is
 *   its own tab stop, because Tab is how you reach an independent control.
 *
 * Shaped by the activity filters, which is what this replaces: many options
 * that must wrap, each carrying its own meaning (a level dot, a kind icon).
 * Hence `chip` as the default surface — a recessed track can't wrap, and a
 * bordered track around a wrapping filter row reads as a box of buttons.
 */

const groupVariants = cva('inline-flex items-center gap-1', {
  variants: {
    size: {
      xs: '[--tg-fs:var(--field-fs-xs)]',
      sm: '[--tg-fs:var(--field-fs-sm)]',
      md: '[--tg-fs:var(--field-fs-md)]',
    },
    /** Let the options flow onto a second line rather than overflow. */
    wrap: { true: 'flex-wrap', false: '' },
    disabled: { true: 'opacity-50', false: '' },
  },
  defaultVariants: { size: 'sm', wrap: false, disabled: false },
})

const toggleVariants = cva(
  cn(
    'inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5',
    'text-[length:var(--tg-fs)] font-medium',
    'transition-[background-color,color] duration-(--transition-fast) motion-reduce:transition-none',
    'focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-glow)]',
    'disabled:pointer-events-none disabled:opacity-50'
  ),
  {
    variants: {
      pressed: { true: '', false: 'text-text-tertiary hover:text-text-primary hover:bg-hover' },
      /** An "on" filter is a wash of its own meaning, not a solid fill — a row
       *  of solid chips would shout louder than the data they filter. */
      tone: {
        default: '',
        accent: '',
        success: '',
        warning: '',
        error: '',
      },
    },
    compoundVariants: [
      { pressed: true, tone: 'default', class: 'bg-hover text-text-primary' },
      { pressed: true, tone: 'accent', class: 'bg-accent/15 text-accent' },
      { pressed: true, tone: 'success', class: 'bg-success/15 text-success' },
      { pressed: true, tone: 'warning', class: 'bg-warning/15 text-warning' },
      { pressed: true, tone: 'error', class: 'bg-error/15 text-error' },
    ],
    defaultVariants: { pressed: false, tone: 'accent' },
  }
)

export type ToggleTone = NonNullable<VariantProps<typeof toggleVariants>['tone']>

export interface ToggleOption<T extends string = string> {
  value: T
  label?: React.ReactNode
  icon?: React.ReactNode
  disabled?: boolean
  /** The pressed colour. Defaults to the group's `tone`. */
  tone?: ToggleTone
  /** Accessible name. Required when there's no text `label`. */
  ariaLabel?: string
}

export interface ToggleGroupProps<T extends string = string>
  extends Omit<VariantProps<typeof groupVariants>, 'disabled'> {
  options: ToggleOption<T>[]
  /** The options currently on. */
  value: readonly T[]
  onChange: (value: T[]) => void
  tone?: ToggleTone
  disabled?: boolean
  /** Names the group for assistive tech. */
  label?: string
  className?: string
}

export const ToggleGroup = forwardRef<HTMLDivElement, ToggleGroupProps<string>>(
  function ToggleGroup(
    { options, value, onChange, size, wrap, tone = 'accent', disabled, label, className },
    ref
  ) {
    const toggle = (v: string) => {
      // Rebuild rather than mutate: callers hold this in state, and a mutated
      // array is the same reference, which won't re-render.
      onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v])
    }

    return (
      <div
        ref={ref}
        role="group"
        aria-label={label}
        className={cn(groupVariants({ size, wrap, disabled }), className)}
      >
        {options.map((o) => {
          const pressed = value.includes(o.value)
          return (
            <button
              key={o.value}
              type="button"
              aria-pressed={pressed}
              aria-label={o.ariaLabel}
              disabled={disabled || o.disabled}
              onClick={() => toggle(o.value)}
              className={cn(toggleVariants({ pressed, tone: o.tone ?? tone }))}
            >
              {o.icon}
              {o.label}
            </button>
          )
        })}
      </div>
    )
  }
) as <T extends string>(
  props: ToggleGroupProps<T> & { ref?: React.Ref<HTMLDivElement> }
) => React.ReactElement
