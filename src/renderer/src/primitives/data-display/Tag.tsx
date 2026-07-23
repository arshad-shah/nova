import React from 'react'
import { X } from 'lucide-react'
import { cn } from '../utils/cn'

// Font-size steps a Tag can render at. `xs` (12px) is the default; the two
// sub-`xs` steps (see primitives/theme/tokens.css) let dense chrome use a named
// step rather than an ad-hoc `text-[10px]` override.
const TAG_SIZE = {
  '3xs': 'text-3xs',
  '2xs': 'text-2xs',
  xs: 'text-xs',
  sm: 'text-sm',
} as const

export interface TagProps extends React.HTMLAttributes<HTMLSpanElement> {
  onDismiss?: () => void
  size?: keyof typeof TAG_SIZE
}

export function Tag({ className, children, onDismiss, size = 'xs', ...props }: TagProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-2 py-0.5 rounded bg-bg-elevated text-text-secondary border border-border-default transition-all duration-[var(--transition-fast)]',
        TAG_SIZE[size],
        className
      )}
      {...props}
    >
      {children}
      {onDismiss && (
        <button
          type="button"
          aria-label="Remove"
          onClick={onDismiss}
          className="inline-flex items-center justify-center leading-none"
        >
          <X size={12} />
        </button>
      )}
    </span>
  )
}
