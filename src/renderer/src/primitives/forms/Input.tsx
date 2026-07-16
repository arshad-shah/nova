import React, { forwardRef, useCallback, useRef, useState } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { X } from 'lucide-react'
import { cn } from '../utils/cn'
import { fieldSizeVariants, fieldSurface } from './field-variants'
import { Spinner } from '../feedback/Spinner'

/**
 * Input: the single-line field, and the shell every other single-line field is
 * built from.
 *
 * It owns the *chrome* — the surface, the border, the focus ring, the sizing,
 * and the slots at either end. It does not own the label or the message under
 * the field: `FormField` already does, and a field that grew its own `label`
 * prop would mean two ways to write the same form.
 *
 * The shell lives here rather than being copy-pasted because it had already
 * been copy-pasted: SearchInput and PasswordInput each rebuilt it, and
 * SearchInput's copy had drifted onto hardcoded heights that ignore the density
 * tokens. Both are thin wrappers over this now.
 */

const rootVariants = cva(
  [
    'group/input relative flex w-full items-center gap-[var(--field-gap)] border text-text-primary',
    fieldSurface,
    'h-[var(--field-ctl-h)] px-[var(--field-px)] text-[length:var(--field-ctl-fs)] rounded-[var(--field-ctl-r)]',
    'transition-[border-color,box-shadow] duration-[var(--transition-fast)] motion-reduce:transition-none',
  ].join(' '),
  {
    variants: {
      size: fieldSizeVariants,
      /**
       * Validity. Replaces the old `error` boolean so success can exist too —
       * a boolean can't express three outcomes, and the kit needs the green.
       * Only ever the border + ring; the message belongs to FormField.
       */
      state: {
        default:
          'border-border-default hover:border-border-strong focus-within:border-accent focus-within:shadow-[var(--shadow-focus-glow),var(--shadow-input-inset)]',
        error:
          'border-error focus-within:shadow-[var(--shadow-error-ring),var(--shadow-input-inset)]',
        success:
          'border-success focus-within:shadow-[var(--shadow-success-ring),var(--shadow-input-inset)]',
      },
      disabled: { true: 'pointer-events-none opacity-50', false: '' },
    },
    defaultVariants: { size: 'md', state: 'default', disabled: false },
  }
)

/** The end slots: muted, out of the tab order, and not stealing the click.
 *  Tapping the icon beside a field should focus the field, not do nothing. */
const affixClass = 'flex shrink-0 items-center text-text-muted [&>svg]:block'

export type InputState = NonNullable<VariantProps<typeof rootVariants>['state']>

export interface InputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size' | 'prefix'> {
  size?: VariantProps<typeof rootVariants>['size']
  /** Validity styling. The message itself belongs to `FormField`. */
  state?: InputState
  /** Leading slot — an icon, a sigil. Decorative: it forwards clicks to the field. */
  prefix?: React.ReactNode
  /** Trailing slot — a unit, a shortcut, an action. Sits before the clear button. */
  suffix?: React.ReactNode
  /** Show a clear button once there's a value. */
  clearable?: boolean
  onClear?: () => void
  /** Swap the trailing slot for a spinner and stop input. */
  loading?: boolean
  /** Soft character limit — shows a counter, and flips the field to `error` past it. */
  limit?: number
  /** Force the counter without a limit (implied when `limit` is set). */
  showCount?: boolean
  className?: string
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    {
      className,
      size,
      state = 'default',
      prefix,
      suffix,
      clearable,
      onClear,
      loading,
      limit,
      showCount,
      value,
      defaultValue,
      disabled,
      readOnly,
      onChange,
      ...props
    },
    ref
  ) => {
    const innerRef = useRef<HTMLInputElement>(null)
    const [count, setCount] = useState(() => String(value ?? defaultValue ?? '').length)

    const setRefs = useCallback(
      (node: HTMLInputElement | null) => {
        innerRef.current = node
        if (typeof ref === 'function') ref(node)
        else if (ref) (ref as React.MutableRefObject<HTMLInputElement | null>).current = node
      },
      [ref]
    )

    // Controlled callers own the value; keep the counter in step with it.
    React.useEffect(() => {
      if (value !== undefined) setCount(String(value).length)
    }, [value])

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (value === undefined) setCount(e.target.value.length)
      onChange?.(e)
    }

    const handleClear = () => {
      const el = innerRef.current
      if (el && value === undefined) el.value = ''
      setCount(0)
      onClear?.()
      // Clearing is a step in typing, not the end of it — keep the caret here.
      el?.focus()
    }

    const overLimit = limit != null && count > limit
    const showCounter = showCount ?? limit != null
    const hasValue = (value !== undefined ? String(value) : String(defaultValue ?? '')).length > 0 || count > 0
    const clearShown = clearable && hasValue && !disabled && !readOnly && !loading
    // Over the limit is an error whether or not the caller said so — the field
    // is invalid by its own rule at that point.
    const resolvedState: InputState = overLimit ? 'error' : state

    return (
      <div
        className={cn(
          rootVariants({ size, state: resolvedState, disabled: Boolean(disabled) }),
          className
        )}
        // The affixes are padding, so clicking anywhere in the shell should
        // land in the field — otherwise the icon is a dead zone.
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) innerRef.current?.focus()
        }}
      >
        {prefix && <span className={affixClass}>{prefix}</span>}

        <input
          ref={setRefs}
          value={value}
          defaultValue={defaultValue}
          disabled={disabled}
          readOnly={readOnly}
          onChange={handleChange}
          aria-invalid={resolvedState === 'error' || undefined}
          className={cn(
            'h-full min-w-0 flex-1 bg-transparent text-inherit outline-none',
            'placeholder:text-text-muted'
          )}
          {...props}
        />

        {showCounter && (
          <span
            className={cn(
              'shrink-0 font-mono text-[10px] tabular-nums text-text-muted',
              overLimit && 'text-error'
            )}
          >
            {count}
            {limit != null && `/${limit}`}
          </span>
        )}

        {loading ? (
          <span className={affixClass}>
            <Spinner size="xs" className="text-current" />
          </span>
        ) : (
          suffix && <span className={affixClass}>{suffix}</span>
        )}

        {clearShown && (
          <button
            type="button"
            // Out of the tab order deliberately: Tab should move to the next
            // field, not into a button that Escape/select-all already covers.
            tabIndex={-1}
            onClick={handleClear}
            aria-label="Clear"
            className="shrink-0 text-text-muted transition-colors duration-[var(--transition-fast)] hover:text-text-primary motion-reduce:transition-none"
          >
            <X size={14} />
          </button>
        )}
      </div>
    )
  }
)

Input.displayName = 'Input'
