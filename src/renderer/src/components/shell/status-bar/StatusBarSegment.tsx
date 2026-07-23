import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import type React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/primitives/utils/cn'
import { Box, Button } from '@/primitives'

const segmentVariants = cva(
  'inline-flex items-center gap-1.5 h-full px-2.5 text-2xs leading-none whitespace-nowrap select-none transition-colors',
  {
    variants: {
      tone: {
        default: 'text-text-secondary',
        primary: 'bg-accent text-text-inverse font-semibold',
        schema: 'bg-accent/12 text-accent font-mono text-3xs',
        'accent-soft': 'text-warning',
        dev: 'bg-accent text-text-inverse font-bold uppercase tracking-wider text-3xs',
        muted: 'bg-bg-tertiary text-text-primary',
      },
      side: {
        left: 'border-r border-border-default',
        right: 'border-l border-border-default',
        none: '',
      },
      interactive: {
        true: 'cursor-pointer hover:bg-hover/60',
        false: 'cursor-default',
      },
    },
    compoundVariants: [
      { tone: 'primary', interactive: true, className: 'hover:bg-accent-emphasis' },
      { tone: 'schema', interactive: true, className: 'hover:bg-accent/20' },
      { tone: 'muted', interactive: true, className: 'hover:bg-hover' },
    ],
    defaultVariants: {
      tone: 'default',
      side: 'right',
      interactive: false,
    },
  }
)

type SegmentBaseProps = Omit<VariantProps<typeof segmentVariants>, 'interactive'> & {
  children: ReactNode
  className?: string
}

export type StatusBarSegmentProps =
  // Interactive: must be a button
  | (SegmentBaseProps & {
      interactive: true
      as: 'button'
    } & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'>)
  // Non-interactive: div (default) or button
  | (SegmentBaseProps & {
      interactive?: false
      as?: 'div'
    } & Omit<React.HTMLAttributes<HTMLDivElement>, 'children'>)
  | (SegmentBaseProps & {
      interactive?: false
      as: 'button'
    } & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'>)

export const StatusBarSegment = forwardRef<HTMLElement, StatusBarSegmentProps>(
  ({ tone, side, interactive, className, children, as = 'div', ...rest }, ref) => {
    const cls = cn(segmentVariants({ tone, side, interactive }), className)
    if (as === 'button') {
      return (
        <Button
          variant="bare"
          size="none"
          ref={ref as React.Ref<HTMLButtonElement>}
          type="button"
          className={cls}
          {...(rest as ButtonHTMLAttributes<HTMLButtonElement>)}
        >
          {children}
        </Button>
      )
    }
    return (
      <Box ref={ref as React.Ref<HTMLDivElement>} className={cls} {...(rest as React.HTMLAttributes<HTMLDivElement>)}>
        {children}
      </Box>
    )
  }
)
StatusBarSegment.displayName = 'StatusBarSegment'
