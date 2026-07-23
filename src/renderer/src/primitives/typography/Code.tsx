import React, { ComponentPropsWithoutRef, forwardRef } from 'react'
import { cn } from '../utils/cn'

// Font-size steps Code can render at. `xs` (12px) is the default; the two
// sub-`xs` steps (see primitives/theme/tokens.css) exist for dense chrome —
// stack traces and inline code in tooltips/panels — so callers reach for a
// named step instead of an ad-hoc `text-[11px]` override.
const CODE_SIZE = {
  '3xs': 'text-3xs',
  '2xs': 'text-2xs',
  xs: 'text-xs',
  sm: 'text-sm',
} as const

type CodeProps = {
  block?: boolean
  size?: keyof typeof CODE_SIZE
  className?: string
  children?: React.ReactNode
} & Omit<ComponentPropsWithoutRef<'code'>, 'className' | 'children'>

export const Code = forwardRef<HTMLElement, CodeProps>(
  ({ block = false, size = 'xs', className, children, ...props }, ref) => {
    if (block) {
      return (
        <pre className={cn('block bg-bg-tertiary p-3 rounded-md overflow-x-auto shadow-[var(--shadow-input-inset)]', className)}>
          <code ref={ref} className={cn('font-mono', CODE_SIZE[size])} {...props}>
            {children}
          </code>
        </pre>
      )
    }

    return (
      <code
        ref={ref}
        className={cn('font-mono bg-bg-tertiary px-1.5 py-0.5 rounded', CODE_SIZE[size], className)}
        {...props}
      >
        {children}
      </code>
    )
  }
)

Code.displayName = 'Code'
