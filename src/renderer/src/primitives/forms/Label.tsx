import React, { forwardRef } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../utils/cn'

const labelVariants = cva('font-medium text-text-primary tracking-tight', {
  variants: {
    size: {
      // Sub-`sm` micro-labels (see primitives/theme/tokens.css) for the app's
      // densest chrome — declared steps, never an ad-hoc `text-[10px]`.
      '3xs': 'text-3xs',
      '2xs': 'text-2xs',
      sm: 'text-xs',
      md: 'text-sm',
      lg: 'text-base',
    },
  },
  defaultVariants: {
    size: 'md',
  },
})

export interface LabelProps
  extends React.LabelHTMLAttributes<HTMLLabelElement>,
    VariantProps<typeof labelVariants> {}

export const Label = forwardRef<HTMLLabelElement, LabelProps>(
  ({ className, size, ...props }, ref) => {
    return (
      <label
        ref={ref}
        className={cn(labelVariants({ size }), className)}
        {...props}
      />
    )
  }
)

Label.displayName = 'Label'
