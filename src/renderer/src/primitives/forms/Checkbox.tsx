import React, { forwardRef } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../utils/cn'

const checkboxVariants = cva(
  cn(
    // single styled native checkbox; the masked mark comes from `.cb-mark::before` (globals)
    'cb-mark relative shrink-0 cursor-pointer appearance-none',
    'h-[var(--cb-size)] w-[var(--cb-size)] rounded-[max(4px,calc(var(--cb-size)*0.28))]',
    'border border-border-default',
    'bg-[linear-gradient(180deg,var(--color-input-gradient-top),var(--color-input-gradient-bottom)),var(--color-bg-tertiary)]',
    'shadow-input-inset',
    'transition-[background-color,border-color,box-shadow,transform] duration-(--transition-fast) motion-reduce:transition-none',
    // hover — an empty box warms toward the accent it's about to become,
    // rather than only darkening its edge
    'hover:border-accent/60 hover:bg-accent/5',
    // press
    'active:scale-[0.94] motion-reduce:active:scale-100',
    // checked / indeterminate: a filled box carries the same inner highlight
    // and lift as the solid Button, so it reads as a raised filled control
    // instead of a flat swatch
    'checked:border-accent checked:bg-accent checked:hover:brightness-110',
    'checked:shadow-[inset_0_1px_0_var(--color-button-highlight),0_1px_3px_var(--color-overlay-soft)]',
    'indeterminate:border-accent indeterminate:bg-accent indeterminate:hover:brightness-110',
    'indeterminate:shadow-[inset_0_1px_0_var(--color-button-highlight),0_1px_3px_var(--color-overlay-soft)]',
    // keyboard focus only
    'focus-visible:outline-none focus-visible:shadow-focus-glow',
    // disabled
    'disabled:pointer-events-none disabled:opacity-50',
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
    VariantProps<typeof checkboxVariants> {}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, size, ...props }, ref) => {
    return (
      <input
        type="checkbox"
        ref={ref}
        className={cn(checkboxVariants({ size }), className)}
        {...props}
      />
    )
  }
)

Checkbox.displayName = 'Checkbox'
