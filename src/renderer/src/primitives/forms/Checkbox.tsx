import React, { forwardRef } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { Check, Minus } from 'lucide-react'
import { cn } from '../utils/cn'

/**
 * Checkbox: a transparent native input (`peer`) laid over a visual companion,
 * the same shape as `Switch` — the input owns behaviour and accessibility, the
 * companion owns looks, and `peer-*` variants keep them in sync.
 *
 * Why this shape:
 * - The companion is a real element, so the tick is a real (crisp, currentColor)
 *   SVG. The previous version styled the input directly and punched the tick out
 *   of it as an alpha mask, which meant the mark could never be a different
 *   colour from the fill and softened at small sizes.
 * - The input is `absolute inset-0 opacity-0` rather than `sr-only`, so the box
 *   itself is the hit target. It is NOT wrapped in a `<label>` (Switch can be,
 *   because it renders its own): callers commonly wrap a Checkbox in their own
 *   label, and nesting labels double-fires the toggle.
 * - Both marks are always mounted and cross-faded, so no layout shift on toggle.
 *
 * Colours come from `--color-checkbox-mark` + the accent tokens, so the box
 * reads correctly on every theme.
 */
const companionVariants = cva(
  cn(
    'pointer-events-none relative inline-flex shrink-0 items-center justify-center',
    'h-[var(--cb-size)] w-[var(--cb-size)] rounded-[max(4px,calc(var(--cb-size)*0.28))]',
    'border border-border-default',
    'bg-[linear-gradient(180deg,var(--color-input-gradient-top),var(--color-input-gradient-bottom)),var(--color-bg-tertiary)]',
    'shadow-input-inset',
    'transition-[background-color,border-color,box-shadow,transform] duration-(--transition-fast) motion-reduce:transition-none',
    // hover — an empty box warms toward the accent it is about to become
    'peer-hover:border-accent/60 peer-hover:bg-accent/5',
    'peer-active:scale-[0.94] motion-reduce:peer-active:scale-100',
    // filled: same inner highlight + lift as the solid Button, so a ticked box
    // reads as a raised filled control rather than a flat swatch
    'peer-checked:border-accent peer-checked:bg-accent',
    'peer-checked:shadow-[inset_0_1px_0_var(--color-button-highlight),0_1px_3px_var(--color-overlay-soft)]',
    'peer-indeterminate:border-accent peer-indeterminate:bg-accent',
    'peer-indeterminate:shadow-[inset_0_1px_0_var(--color-button-highlight),0_1px_3px_var(--color-overlay-soft)]',
    'peer-checked:peer-hover:brightness-110',
    'peer-indeterminate:peer-hover:brightness-110',
    'peer-focus-visible:shadow-focus-glow',
    'peer-disabled:opacity-50',
    // marks — stacked and centred, tinted by the mark token
    'text-[var(--color-checkbox-mark)]',
    '[&>svg]:absolute [&>svg]:h-[68%] [&>svg]:w-[68%] [&>svg]:opacity-0',
    '[&>svg]:transition-[opacity,transform] [&>svg]:duration-(--transition-normal)',
    '[&>svg]:ease-[cubic-bezier(0.34,1.56,0.64,1)] motion-reduce:[&>svg]:transition-none',
    // the tick springs in from low — it lands in the box rather than popping at
    // its centre. The dash is a state, not a gesture, so it only fades.
    '[&>[data-mark=tick]]:scale-50 [&>[data-mark=tick]]:translate-y-px',
    'peer-checked:[&>[data-mark=tick]]:opacity-100',
    'peer-checked:[&>[data-mark=tick]]:scale-100 peer-checked:[&>[data-mark=tick]]:translate-y-0',
    // indeterminate wins over checked: a partially-selected box shows the dash
    'peer-indeterminate:[&>[data-mark=tick]]:opacity-0',
    'peer-indeterminate:[&>[data-mark=dash]]:opacity-100',
  ),
  {
    variants: {
      size: {
        sm: '[--cb-size:var(--check-sm)]',
        md: '[--cb-size:var(--check-md)]',
        lg: '[--cb-size:var(--check-lg)]',
      },
    },
    defaultVariants: { size: 'md' },
  }
)

export interface CheckboxProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'>,
    VariantProps<typeof companionVariants> {}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, size, disabled, ...props }, ref) => {
    return (
      <span className={cn('relative inline-flex shrink-0 align-middle', className)}>
        <input
          type="checkbox"
          ref={ref}
          disabled={disabled}
          className={cn(
            'peer absolute inset-0 z-10 m-0 h-full w-full appearance-none rounded-[inherit] opacity-0',
            disabled ? 'cursor-not-allowed' : 'cursor-pointer'
          )}
          {...props}
        />
        <span aria-hidden="true" className={cn(companionVariants({ size }))}>
          <Check data-mark="tick" strokeWidth={3} />
          <Minus data-mark="dash" strokeWidth={3} />
        </span>
      </span>
    )
  }
)

Checkbox.displayName = 'Checkbox'
