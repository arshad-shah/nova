import React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../utils/cn'

const badgeVariants = cva(
  'inline-flex items-center font-medium rounded-full shadow-[inset_0_1px_0_var(--color-button-highlight)]',
  {
    variants: {
      /**
       * What the badge means. Every value here is a meaning — a weight would be
       * `variant`, and Badge has none. Named `tone` to match the rest of the
       * system: `tone` is what a thing means, `variant` is how much of itself
       * it wears.
       */
      tone: {
        default: 'bg-bg-elevated text-text-secondary',
        accent: 'bg-accent/10 text-accent-hover',
        success: 'bg-success/10 text-success',
        warning: 'bg-warning/10 text-warning',
        error: 'bg-error/10 text-error',
        info: 'bg-info/10 text-info',
        // Key kinds — for the constraint badges on columns (PK/FK/UNIQUE).
        // PK reads violet, FK follows the data accent, and UNIQUE stays a
        // neutral outline so it never competes with the two key kinds.
        pk: 'bg-key-pk-bg text-key-pk border border-key-pk-border',
        fk: 'bg-key-fk-bg text-key-fk border border-key-fk-border',
        unique: 'bg-transparent text-text-secondary border border-border-strong',
      },
      size: {
        xs: 'text-[10px] px-1 py-0',
        sm: 'text-xs px-1.5 py-0.5',
        md: 'text-xs px-2 py-0.5',
        lg: 'text-sm px-2.5 py-1',
        xl: 'text-base px-3 py-1.5',
      },
    },
    defaultVariants: {
      tone: 'default',
      size: 'md',
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, tone, size, ...props }: BadgeProps) {
  return (
    <span
      className={cn(badgeVariants({ tone, size }), className)}
      {...props}
    />
  )
}
