import React, { forwardRef } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../utils/cn'
import { Spinner } from '../feedback/Spinner'

const buttonVariants = cva(
  'inline-flex items-center justify-center font-medium transition-all duration-[var(--transition-fast)] focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-glow)] disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        // Repeated actions (Run, Save, Connect…) are solid and functional:
        // the same action blue on every theme, white label, never gradient.
        solid: 'bg-action text-action-fg hover:bg-action-hover shadow-[inset_0_1px_0_var(--color-button-highlight),0_1px_2px_var(--color-overlay-soft)] hover:shadow-[inset_0_1px_0_var(--color-button-highlight),0_2px_4px_var(--color-overlay-soft)] active:shadow-[inset_0_2px_4px_var(--color-overlay-strong)]',
        // The action colour at a quieter weight: a wash of the hue, labelled
        // in the hue. For a secondary action that belongs to the same task as
        // a solid button — "Cancel" next to "Run" — where `outline` would read
        // as unrelated chrome and a second solid would compete.
        subtle:
          'bg-action-subtle text-action-subtle-fg hover:bg-action-subtle-hover',
        outline:
          'border border-border-default bg-transparent hover:bg-hover hover:border-border-strong text-text-primary',
        ghost: 'bg-transparent hover:bg-hover text-text-primary',
        error:
          'bg-error-emphasis text-error-fg hover:bg-error-emphasis-hover shadow-[inset_0_1px_0_var(--color-button-highlight),0_1px_2px_var(--color-overlay-soft)] hover:shadow-[inset_0_1px_0_var(--color-button-highlight),0_2px_4px_var(--color-overlay-soft)] active:shadow-[inset_0_2px_4px_var(--color-overlay-strong)]',
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

/** The spinner that fits inside each button height without touching the edges. */
const spinnerForSize: Record<
  NonNullable<ButtonVariants['size']>,
  'xs' | 'sm' | 'md'
> = {
  xs: 'xs',
  sm: 'xs',
  md: 'sm',
  lg: 'sm',
  xl: 'md',
  none: 'xs',
}

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    ButtonVariants {
  /** Show a spinner and stop accepting clicks while an action is in flight.
   *  The label stays in place (hidden, not removed) so the button keeps its
   *  width — a button that resizes the moment you click it moves the thing
   *  next to it out from under the cursor. */
  loading?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { className, variant, size, loading = false, disabled, children, ...props },
    ref
  ) => {
    return (
      <button
        ref={ref}
        // A loading button is not disabled *as a state* — it's busy. But it
        // must not fire twice, and `aria-busy` alone doesn't stop a click.
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        className={cn(
          buttonVariants({ variant, size }),
          loading && 'relative',
          className
        )}
        {...props}
      >
        {loading ? (
          <>
            <span className="absolute inset-0 flex items-center justify-center">
              <Spinner
                size={spinnerForSize[size ?? 'md']}
                className="text-current"
              />
            </span>
            {/* Still laid out, so the button keeps its width. `gap:inherit`
                picks up whatever gap the caller set on the button itself —
                every icon+label caller puts it there, and without this the
                hidden label would collapse against its icon and shrink the
                button anyway. */}
            <span
              aria-hidden
              className="invisible inline-flex items-center justify-center [gap:inherit]"
            >
              {children}
            </span>
          </>
        ) : (
          children
        )}
      </button>
    )
  }
)

Button.displayName = 'Button'

/** Exported for the rare caller that needs an IconButton's *look* on an
 *  element that must not be a native `<button>` — see the tab strip's close
 *  affordance, which lives inside a `[role=tab]` (a role whose children are
 *  presentational, so a focusable descendant there is an axe
 *  `nested-interactive` violation). Reach for `IconButton` everywhere else;
 *  this exists so those callers reuse these classes instead of restating them. */
export const iconButtonVariants = cva(
  'inline-flex items-center justify-center font-medium transition-all duration-[var(--transition-fast)] focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-glow)] disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      // Kept in step with Button's variants — the two are the same control
      // with and without a label, and a variant that exists on one but not
      // the other is a trap for whoever reaches for it.
      variant: {
        solid: 'bg-action text-action-fg hover:bg-action-hover shadow-[inset_0_1px_0_var(--color-button-highlight),0_1px_2px_var(--color-overlay-soft)]',
        subtle: 'bg-action-subtle text-action-subtle-fg hover:bg-action-subtle-hover',
        outline: 'border border-border-default bg-transparent hover:bg-hover hover:border-border-strong text-text-primary',
        ghost: 'bg-transparent hover:bg-hover text-text-primary',
        error: 'bg-error-emphasis text-error-fg hover:bg-error-emphasis-hover shadow-[inset_0_1px_0_var(--color-button-highlight),0_1px_2px_var(--color-overlay-soft)]',
        'tab-action': 'bg-transparent hover:bg-hover text-text-tertiary hover:text-text-primary rounded-full',
        bare: '',
      },
      size: {
        xs: 'h-7 w-7 rounded',
        sm: 'h-8 w-8 rounded',
        md: 'h-9 w-9 rounded-md',
        lg: 'h-10 w-10 rounded-md',
        xl: 'h-12 w-12 rounded-lg',
        'tab-action': 'h-4 w-4',
        none: '',
      },
      // Separate from `size` so roundness and box are independent: an avatar
      // menu and a toolbar button are the same 32px, and only one is a pill.
      // Declared after `size` so `circle` wins the radius conflict.
      shape: {
        square: '',
        circle: 'rounded-full',
      },
    },
    defaultVariants: {
      variant: 'ghost',
      size: 'md',
      shape: 'square',
    },
  }
)

type IconButtonVariants = VariantProps<typeof iconButtonVariants>

const iconSpinnerForSize: Record<
  NonNullable<IconButtonVariants['size']>,
  'xs' | 'sm' | 'md'
> = {
  xs: 'xs',
  sm: 'xs',
  md: 'sm',
  lg: 'sm',
  xl: 'md',
  'tab-action': 'xs',
  none: 'xs',
}

export interface IconButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    IconButtonVariants {
  /** Required — an icon-only control has no accessible name without it. Also
   *  used as the spinner's label while `loading`. */
  label: string
  /** Swap the icon for a spinner and stop accepting clicks. */
  loading?: boolean
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  (
    { className, variant, size, shape, label, loading = false, disabled, children, ...props },
    ref
  ) => {
    return (
      <button
        ref={ref}
        aria-label={label}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        className={cn(iconButtonVariants({ variant, size, shape }), className)}
        {...props}
      >
        {/* No width to preserve here — the box is fixed by `size` — so the
            spinner simply stands in for the icon. */}
        {loading ? (
          <Spinner
            size={iconSpinnerForSize[size ?? 'md']}
            className="text-current"
            label={label}
          />
        ) : (
          children
        )}
      </button>
    )
  }
)

IconButton.displayName = 'IconButton'
