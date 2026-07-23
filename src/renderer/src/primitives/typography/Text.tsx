import React, { ComponentPropsWithRef, ElementType, forwardRef } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../utils/cn'

const textVariants = cva('', {
  variants: {
    size: {
      // Dense-chrome steps below `xs` — fixed 10px/11px with their own tight
      // line-heights (see primitives/theme/tokens.css). Use these instead of
      // an ad-hoc `text-[10px]`; the renderer-no-arbitrary-font-size guard
      // enforces it.
      '3xs': 'text-3xs',
      '2xs': 'text-2xs',
      xs: 'text-xs',
      sm: 'text-sm',
      base: 'text-base',
      lg: 'text-lg',
      xl: 'text-xl',
    },
    color: {
      primary: 'text-text-primary',
      secondary: 'text-text-secondary',
      muted: 'text-text-muted',
      disabled: 'text-text-disabled',
      accent: 'text-accent',
      success: 'text-success',
      warning: 'text-warning',
      error: 'text-error',
    },
    weight: {
      normal: 'font-normal',
      medium: 'font-medium',
      semibold: 'font-semibold',
      bold: 'font-bold',
    },
  },
  defaultVariants: {
    size: 'sm',
    color: 'primary',
    weight: 'normal',
  },
})

type TextVariants = VariantProps<typeof textVariants>

type TextOwnProps<E extends ElementType = 'span'> = {
  as?: E
  truncate?: boolean
  className?: string
} & TextVariants

type TextProps<E extends ElementType = 'span'> = TextOwnProps<E> &
  Omit<ComponentPropsWithRef<E>, keyof TextOwnProps<E>>

function TextInner<E extends ElementType = 'span'>(
  { as, size, color, weight, truncate, className, ...props }: TextProps<E>,
  ref: React.Ref<Element>
) {
  const Component = (as ?? 'span') as ElementType
  return (
    <Component
      ref={ref}
      className={cn(textVariants({ size, color, weight }), truncate && 'truncate', className)}
      {...props}
    />
  )
}

export const Text = forwardRef(TextInner) as <E extends ElementType = 'span'>(
  props: TextProps<E>
) => React.ReactElement | null
