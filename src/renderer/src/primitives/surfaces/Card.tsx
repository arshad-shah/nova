import React, { forwardRef } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../utils/cn'

/**
 * Card: a bounded surface for one topic.
 *
 * The variants are a ladder of how much the surface asserts itself — from
 * `elevated` (lifted off the page) down to `ghost` (only the padding is real).
 * Picking one is picking how much the container should compete with what's in
 * it, which in a dense tool is usually "less than you think".
 *
 * There is deliberately no `gradient` variant. `GradientSurface` already paints
 * a theme-derived gradient, and the brand gradient is reserved by the design
 * law in tokens.css for hero/splash/empty-state moments — "never on repeated
 * actions, hovers, borders-at-large". A variant here would make breaking that
 * one keystroke away on any card in the app. Compose instead:
 * `<GradientSurface><Card variant="ghost">…</Card></GradientSurface>`.
 */
const cardVariants = cva(
  'transition-[box-shadow,border-color,background-color] duration-[var(--transition-fast)] motion-reduce:transition-none',
  {
    variants: {
      variant: {
        /** The default surface: a panel that sits on the page. */
        default: 'border border-border-default bg-bg-secondary shadow-[var(--shadow-card)]',
        /** Lifted off the page. The shadow does the separating, so the border
         *  would only add noise — a lifted card doesn't need an outline too. */
        elevated: 'border border-transparent bg-bg-elevated shadow-[var(--shadow-elevated)]',
        /** An outline and nothing else — for grouping on an already-busy
         *  surface, where another fill would just add a tone. */
        outline: 'border border-border-default bg-transparent',
        /** Structure only. No fill, no border; the padding is the whole point. */
        ghost: 'border border-transparent bg-transparent',
        /**
         * Translucent, blurred to whatever it covers. Only meaningful ON
         * something — over a plain background it's just a slightly lighter
         * card. Built from the overlay tokens rather than a white wash, so it
         * doesn't invert on a light theme.
         */
        glass: cn(
          'border border-border-subtle bg-[color-mix(in_oklab,var(--color-bg-elevated)_72%,transparent)]',
          'shadow-[var(--shadow-card)] backdrop-blur-md'
        ),
      },
      padding: {
        none: '',
        sm: 'p-2',
        md: 'p-3',
        lg: 'p-4',
        // The kit's 24px. Available, but not the default: Verql is a dense SQL
        // IDE and 24px on every card would inflate the whole app.
        xl: 'p-6',
      },
      /**
       * Roundness. `lg` (8px) stays the default for the same density reason —
       * the kit's 16px is a marketing card. `xl` is there when a card is a
       * feature rather than a row.
       */
      radius: {
        md: 'rounded-md',
        lg: 'rounded-lg',
        xl: 'rounded-xl',
      },
      /**
       * Hover and focus affordances for a card that is a control.
       *
       * Styling ONLY — it deliberately doesn't make the card a button. Wrap it:
       * `<Button variant="bare" size="none"><Card interactive/></Button>`.
       * Button already owns focus, keyboard and disabled; a div with
       * role="button" reimplements half of that and gets it wrong.
       */
      interactive: {
        true: cn(
          'cursor-pointer hover:border-border-strong hover:shadow-[var(--shadow-elevated)]',
          'focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-glow)]'
        ),
        false: '',
      },
    },
    defaultVariants: {
      variant: 'default',
      padding: 'md',
      radius: 'lg',
      interactive: false,
    },
  }
)

export type CardVariants = VariantProps<typeof cardVariants>

export type CardProps = React.HTMLAttributes<HTMLDivElement> & CardVariants

export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ variant, padding, radius, interactive, className, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(cardVariants({ variant, padding, radius, interactive }), className)}
        {...props}
      />
    )
  }
)

Card.displayName = 'Card'
