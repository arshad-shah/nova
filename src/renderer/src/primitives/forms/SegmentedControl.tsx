import React, { forwardRef, useId, useRef } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../utils/cn'

/**
 * SegmentedControl: pick one of a few options, all visible at once.
 *
 * Not Tabs and not Radio, though it sits between them:
 * - `Tabs` navigates between views and renders an underlined strip
 *   (`role="tablist"`). Choosing a *value* is not navigation.
 * - `Radio` is one input; a list of them is a column of dots. This is the same
 *   semantics in a compact horizontal track, for 2-5 short options.
 *
 * It is a `radiogroup`, not a row of `aria-pressed` buttons: the options are
 * mutually exclusive and exactly one is always chosen, which is what a radio
 * group means. That also buys the expected keyboard model — one tab stop for
 * the whole control, then arrows to move between options. Use `ToggleGroup`
 * (aria-pressed) when options are independent and none may be selected.
 *
 * Colour comes entirely from the theme. The track is recessed and the selected
 * segment is a raised chip on it, so selection reads from the lift as well as
 * the colour — it survives a theme whose accent is low-contrast, and it doesn't
 * rely on colour alone.
 */

const trackVariants = cva(
  cn(
    'inline-flex items-center gap-0.5 rounded-[var(--field-ctl-r)] border border-border-default',
    'bg-bg-inset p-0.5 shadow-[var(--shadow-input-inset)]'
  ),
  {
    variants: {
      // Sized off the same density tokens as every other field, so one
      // `[data-density]` flip on <html> rescales this with the rest.
      size: {
        xs: '[--seg-h:var(--field-h-xs)] [--seg-fs:var(--field-fs-xs)] [--field-ctl-r:var(--field-r-sm)]',
        sm: '[--seg-h:var(--field-h-sm)] [--seg-fs:var(--field-fs-sm)] [--field-ctl-r:var(--field-r-sm)]',
        md: '[--seg-h:var(--field-h-md)] [--seg-fs:var(--field-fs-md)] [--field-ctl-r:var(--field-r-md)]',
        lg: '[--seg-h:var(--field-h-lg)] [--seg-fs:var(--field-fs-lg)] [--field-ctl-r:var(--field-r-md)]',
      },
      /** Share the width evenly instead of hugging each label. */
      stretch: { true: 'flex w-full', false: '' },
      /** Dims the whole track. Deliberately a variant rather than a
       *  `has-[:disabled]` selector: that would dim the entire control when a
       *  single option happened to be disabled. */
      disabled: { true: 'opacity-50', false: '' },
    },
    defaultVariants: { size: 'md', stretch: false, disabled: false },
  }
)

const segmentVariants = cva(
  cn(
    'relative inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap',
    // The track's own padding is 2px, so the segment is the track height less
    // that — a segment never dictates the control's height.
    'h-[calc(var(--seg-h)-4px)] rounded-[calc(var(--field-ctl-r)-1px)] px-2',
    'text-[length:var(--seg-fs)] font-medium',
    'transition-[background-color,color,box-shadow] duration-(--transition-fast) motion-reduce:transition-none',
    'focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-glow)]',
    'disabled:pointer-events-none disabled:opacity-50'
  ),
  {
    variants: {
      selected: {
        // The raised chip: same inner highlight + lift as the solid Button, so
        // a chosen segment reads as the same "filled control" language.
        true: 'bg-bg-elevated shadow-[inset_0_1px_0_var(--color-button-highlight),0_1px_2px_var(--color-overlay-soft)]',
        false: 'text-text-tertiary hover:text-text-primary hover:bg-hover',
      },
      /** The selected label's colour. The chip stays neutral on every tone —
       *  only the text carries the meaning, so a row of segments doesn't turn
       *  into a row of coloured blocks. */
      tone: {
        default: '',
        accent: '',
        success: '',
        warning: '',
        error: '',
      },
      stretch: { true: 'flex-1', false: '' },
    },
    compoundVariants: [
      { selected: true, tone: 'default', class: 'text-text-primary' },
      { selected: true, tone: 'accent', class: 'text-accent' },
      { selected: true, tone: 'success', class: 'text-success' },
      { selected: true, tone: 'warning', class: 'text-warning' },
      { selected: true, tone: 'error', class: 'text-error' },
    ],
    defaultVariants: { selected: false, tone: 'default', stretch: false },
  }
)

export type SegmentedTone = NonNullable<
  VariantProps<typeof segmentVariants>['tone']
>

export interface SegmentedOption<T extends string = string> {
  value: T
  /** Omit for an icon-only segment — then `label` is required for the a11y name. */
  label?: React.ReactNode
  icon?: React.ReactNode
  disabled?: boolean
  /** The selected label's colour. Defaults to the control's `tone`. */
  tone?: SegmentedTone
  /** Accessible name. Required when there's no text `label`. */
  ariaLabel?: string
}

export interface SegmentedControlProps<T extends string = string>
  extends Omit<VariantProps<typeof trackVariants>, 'stretch'> {
  options: SegmentedOption<T>[]
  value: T
  onChange: (value: T) => void
  /** Default colour for the selected label; an option may override it. */
  tone?: SegmentedTone
  /** Share the width evenly instead of hugging each label. */
  stretch?: boolean
  disabled?: boolean
  /** Names the group for assistive tech. */
  label?: string
  className?: string
}

export const SegmentedControl = forwardRef<
  HTMLDivElement,
  SegmentedControlProps<string>
>(function SegmentedControl(
  { options, value, onChange, size, tone = 'default', stretch = false, disabled, label, className },
  ref
) {
  const groupId = useId()
  const refs = useRef<Record<string, HTMLButtonElement | null>>({})

  const enabled = options.filter((o) => !o.disabled)

  /**
   * Which segment Tab lands on. Normally the selected one — that's the roving
   * tabindex that makes the group a single tab stop.
   *
   * When `value` matches no option the group would otherwise have every
   * segment at -1 and become unreachable by keyboard entirely. That is not
   * hypothetical: the export/import pickers hold `null` until the driver's
   * formats arrive. A radio group with nothing checked keeps its first option
   * focusable, so do that.
   */
  const focusableValue = options.some((o) => o.value === value)
    ? value
    : enabled[0]?.value

  /** Arrows move the selection AND focus, which is the radiogroup contract —
   *  a radio group is selected by arrowing, not by arrowing then confirming. */
  const move = (delta: number) => {
    if (!enabled.length) return
    const at = enabled.findIndex((o) => o.value === value)
    // A wrap keeps the ends reachable in one keystroke; `at` is -1 when the
    // current value isn't in the list, and then `next` lands on the first.
    const next = enabled[(at + delta + enabled.length) % enabled.length]
    if (!next || next.value === value) return
    onChange(next.value)
    refs.current[next.value]?.focus()
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        e.preventDefault()
        move(1)
        break
      case 'ArrowLeft':
      case 'ArrowUp':
        e.preventDefault()
        move(-1)
        break
      case 'Home':
        e.preventDefault()
        if (enabled[0]) { onChange(enabled[0].value); refs.current[enabled[0].value]?.focus() }
        break
      case 'End': {
        e.preventDefault()
        const last = enabled[enabled.length - 1]
        if (last) { onChange(last.value); refs.current[last.value]?.focus() }
        break
      }
    }
  }

  return (
    <div
      ref={ref}
      role="radiogroup"
      aria-label={label}
      onKeyDown={onKeyDown}
      className={cn(trackVariants({ size, stretch, disabled }), className)}
    >
      {options.map((o) => {
        const selected = o.value === value
        const isDisabled = disabled || o.disabled
        return (
          <button
            key={o.value}
            ref={(n) => { refs.current[o.value] = n }}
            type="button"
            role="radio"
            id={`${groupId}-${o.value}`}
            aria-checked={selected}
            // Only needed when there's no text label to name the segment; a
            // text label already names it via its content.
            aria-label={o.ariaLabel}
            disabled={isDisabled}
            // Roving tabindex: the group is ONE tab stop, and Tab out of it
            // goes to the next control rather than the next segment.
            tabIndex={o.value === focusableValue ? 0 : -1}
            onClick={() => { if (!selected) onChange(o.value) }}
            className={cn(segmentVariants({ selected, tone: o.tone ?? tone, stretch }))}
          >
            {o.icon}
            {o.label}
          </button>
        )
      })}
    </div>
  )
}) as <T extends string>(
  props: SegmentedControlProps<T> & { ref?: React.Ref<HTMLDivElement> }
) => React.ReactElement
