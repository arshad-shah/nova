import React, { useEffect, useRef } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../utils/cn'

type SheetSide = 'right' | 'left' | 'bottom'

const sheetVariants = cva(
  'backdrop:bg-overlay-backdrop bg-bg-secondary border border-border-default p-0 max-h-full text-text-primary shadow-[var(--shadow-elevated)]',
  {
    variants: {
      size: {
        sm: 'max-w-xs',
        md: 'max-w-sm',
        lg: 'max-w-md',
      },
    },
    defaultVariants: {
      size: 'md',
    },
  }
)

type SheetProps = VariantProps<typeof sheetVariants> & {
  open: boolean
  onClose: () => void
  side?: SheetSide
  className?: string
  children?: React.ReactNode
}

const sideStyles: Record<SheetSide, string> = {
  right: 'fixed top-0 right-0 h-full rounded-l-lg',
  left: 'fixed top-0 left-0 h-full rounded-r-lg',
  bottom: 'fixed bottom-0 left-0 w-full rounded-t-lg',
}

export function Sheet({ open, onClose, side = 'right', size, className, children }: SheetProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open) {
      dialog.showModal()
    } else {
      dialog.close()
    }
  }, [open])

  function handleClick(e: React.MouseEvent<HTMLDialogElement>) {
    if (e.target === dialogRef.current) {
      onClose()
    }
  }

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onClick={handleClick}
      className={cn(sheetVariants({ size }), sideStyles[side], className)}
    >
      {children}
    </dialog>
  )
}
