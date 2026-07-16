import React, { ComponentPropsWithoutRef, forwardRef } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../utils/cn'

const kbdVariants = cva(
  'inline-flex items-center justify-center font-mono leading-none align-middle select-none',
  {
    variants: {
      size: {
        xs: 'text-[9px] px-0.5 py-px rounded-[2px] gap-0.5 min-w-[13px] h-[13px]',
        sm: 'text-[10px] px-1 py-[1px] rounded-[3px] gap-0.5 min-w-[16px] h-[16px]',
        md: 'text-xs px-1.5 py-0.5 rounded gap-0.5 min-w-[20px] h-[20px]',
        lg: 'text-sm px-2 py-1 rounded-md gap-1 min-w-[26px] h-[26px]',
        xl: 'text-base px-2.5 py-1.5 rounded-md gap-1 min-w-[32px] h-[32px]',
      },
      variant: {
        solid:
          'border bg-bg-tertiary border-border-default text-text-secondary shadow-[inset_0_-1px_0_var(--color-overlay-soft)]',
        outline: 'border border-border-default bg-transparent text-text-secondary',
        ghost: 'bg-transparent text-text-tertiary',
      },
    },
    defaultVariants: {
      size: 'md',
      variant: 'solid',
    },
  },
)

export type KbdProps = {
  className?: string
  children?: React.ReactNode
} & VariantProps<typeof kbdVariants> &
  Omit<ComponentPropsWithoutRef<'kbd'>, 'className' | 'children'>

export const Kbd = forwardRef<HTMLElement, KbdProps>(
  ({ className, size, variant, children, ...props }, ref) => {
    return (
      <kbd ref={ref} className={cn(kbdVariants({ size, variant }), className)} {...props}>
        {children}
      </kbd>
    )
  },
)

Kbd.displayName = 'Kbd'

export { kbdVariants }
