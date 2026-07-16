import React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../utils/cn'

const listRootVariants = cva('', {
  variants: {
    /**
     * How the list presents its items.
     * - `stack` (default): a flex column of rows — the app's own lists (nav,
     *   pickers, menus), where each item is a box rather than a bullet point.
     * - `disc` / `decimal`: real prose bullets. These deliberately do NOT set
     *   `flex`, because a flex container suppresses list markers — the bullets
     *   would simply vanish. Use these for rendered prose (e.g. markdown).
     */
    marker: {
      stack: 'flex flex-col',
      disc: 'list-disc pl-4',
      decimal: 'list-decimal pl-4',
    },
  },
  defaultVariants: {
    marker: 'stack',
  },
})

const listItemVariants = cva(
  'text-text-primary transition-colors duration-[var(--transition-fast)]',
  {
    variants: {
      size: {
        sm: 'text-xs py-1 px-2',
        md: 'text-sm py-2 px-3',
        lg: 'text-base py-3 px-4',
        /** No padding — for prose bullets, where the marker owns the indent. */
        none: '',
      },
    },
    defaultVariants: {
      size: 'md',
    },
  }
)

interface RootProps
  extends React.HTMLAttributes<HTMLElement>,
    VariantProps<typeof listRootVariants> {
  /** Render an `<ol>` instead of a `<ul>` — for genuinely ordered content. */
  ordered?: boolean
}

function ListRoot({ className, marker, ordered, ...props }: RootProps) {
  const Component = ordered ? 'ol' : 'ul'
  return <Component className={cn(listRootVariants({ marker }), className)} {...props} />
}

interface ItemProps
  extends React.HTMLAttributes<HTMLLIElement>,
    VariantProps<typeof listItemVariants> {}

function Item({ className, size, ...props }: ItemProps) {
  return (
    <li className={cn(listItemVariants({ size }), className)} {...props} />
  )
}

export const List = Object.assign(ListRoot, { Item })
