import React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../utils/cn'

const progressVariants = cva(
  'w-full bg-bg-elevated rounded-full overflow-hidden shadow-[var(--shadow-input-inset)]',
  {
    variants: {
      size: {
        sm: 'h-1',
        md: 'h-1.5',
        lg: 'h-2',
      },
    },
    defaultVariants: {
      size: 'md',
    },
  }
)

const progressFillVariants = cva('h-full rounded-full transition-all duration-[var(--transition-normal)]', {
  variants: {
    /**
     * What the fill colour means. Same convention as Badge's `tone`: a
     * meaning, not a weight. `default` keeps today's plain accent fill.
     */
    tone: {
      default: 'bg-accent',
      accent: 'bg-accent',
      success: 'bg-success',
      warning: 'bg-warning',
      error: 'bg-error',
    },
  },
  defaultVariants: {
    tone: 'default',
  },
})

export interface ProgressProps extends VariantProps<typeof progressVariants> {
  value: number
  max?: number
  className?: string
  'aria-label'?: string
  /** Semantic fill colour. Defaults to the accent fill used today. */
  tone?: VariantProps<typeof progressFillVariants>['tone']
}

export function Progress({
  value,
  max = 100,
  size,
  tone,
  className,
  'aria-label': ariaLabel,
}: ProgressProps) {
  const percentage = Math.min(100, Math.max(0, (value / max) * 100))

  return (
    <div
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-label={ariaLabel}
      className={cn(progressVariants({ size }), className)}
    >
      <div
        className={progressFillVariants({ tone })}
        style={{ width: `${percentage}%` }}
      />
    </div>
  )
}
