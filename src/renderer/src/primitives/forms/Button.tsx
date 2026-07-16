import React, { forwardRef } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../utils/cn'

const buttonVariants = cva(
  'inline-flex items-center justify-center font-medium transition-all duration-[var(--transition-fast)] focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-glow)] disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        // Repeated actions (Run, Save, Connect…) are solid and functional:
        // the same action blue on every theme, white label, never gradient.
        solid: 'bg-action text-action-fg hover:bg-action-hover shadow-[inset_0_1px_0_var(--color-button-highlight),0_1px_2px_var(--color-overlay-soft)] hover:shadow-[inset_0_1px_0_var(--color-button-highlight),0_2px_4px_var(--color-overlay-soft)] active:shadow-[inset_0_2px_4px_var(--color-overlay-strong)]',
        outline:
          'border border-border-default bg-transparent hover:bg-hover hover:border-border-strong text-text-primary',
        ghost: 'bg-transparent hover:bg-hover text-text-primary',
        error: 'bg-error-emphasis text-action-fg hover:bg-error shadow-[inset_0_1px_0_var(--color-button-highlight),0_1px_2px_var(--color-overlay-soft)]',
        // Chrome-less: no fill, no text colour, no hover of its own. For
        // buttons whose look is fully owned by the caller (a clickable row, a
        // tab, a bespoke chip) — it exists so those don't have to drop to a
        // native <button> and escape the design system. Pair with size="none".
        bare: '',
      },
      size: {
        xs: 'h-7 px-2 text-xs rounded',
        sm: 'h-8 px-2.5 text-xs rounded',
        md: 'h-9 px-3 text-sm rounded-md',
        lg: 'h-10 px-4 text-sm rounded-md',
        xl: 'h-12 px-5 text-base rounded-lg',
        // No height, padding or radius — the caller supplies the box.
        none: '',
      },
    },
    defaultVariants: {
      variant: 'solid',
      size: 'md',
    },
  }
)

export type ButtonVariants = VariantProps<typeof buttonVariants>

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    ButtonVariants {}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        {...props}
      />
    )
  }
)

Button.displayName = 'Button'

const iconButtonVariants = cva(
  'inline-flex items-center justify-center font-medium transition-all duration-[var(--transition-fast)] focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-glow)] disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        solid: 'bg-action text-action-fg hover:bg-action-hover shadow-[inset_0_1px_0_var(--color-button-highlight),0_1px_2px_var(--color-overlay-soft)]',
        outline: 'border border-border-default bg-transparent hover:bg-hover hover:border-border-strong text-text-primary',
        ghost: 'bg-transparent hover:bg-hover text-text-primary',
        'tab-action': 'bg-transparent hover:bg-hover text-text-tertiary hover:text-text-primary rounded-full',
      },
      size: {
        xs: 'h-7 w-7 rounded',
        sm: 'h-8 w-8 rounded',
        md: 'h-9 w-9 rounded-md',
        lg: 'h-10 w-10 rounded-md',
        xl: 'h-12 w-12 rounded-lg',
        'tab-action': 'h-4 w-4',
      },
    },
    defaultVariants: {
      variant: 'ghost',
      size: 'md',
    },
  }
)

export interface IconButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof iconButtonVariants> {
  label: string
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ className, variant, size, label, ...props }, ref) => {
    return (
      <button
        ref={ref}
        aria-label={label}
        className={cn(iconButtonVariants({ variant, size }), className)}
        {...props}
      />
    )
  }
)

IconButton.displayName = 'IconButton'
