import React, { useEffect, useRef } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../utils/cn'

const modalVariants = cva(
  'fixed backdrop:bg-black/50 backdrop:backdrop-blur-sm bg-bg-secondary border border-border-default rounded-lg p-0 w-full text-text-primary shadow-[var(--shadow-elevated)]',
  {
    variants: {
      size: {
        sm: 'max-w-sm max-h-[70vh]',
        md: 'max-w-lg max-h-[85vh]',
        lg: 'max-w-2xl max-h-[90vh]',
      },
      // `center` (default) is the classic dialog placement — perfectly
      // centered via inset-0 + margin:auto. `top` anchors near the top of
      // the viewport (still horizontally centered) for surfaces like the
      // command palette that shouldn't sit mid-screen.
      position: {
        center: 'inset-0 m-auto',
        top: 'inset-x-0 top-[15%] mx-auto mb-auto',
      },
    },
    defaultVariants: {
      size: 'md',
      position: 'center',
    },
  }
)

type ModalProps = VariantProps<typeof modalVariants> & {
  open: boolean
  onClose: () => void
  className?: string
  children?: React.ReactNode
}

export function Modal({ open, onClose, size, position, className, children }: ModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const closingRef = useRef(false)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open) {
      dialog.showModal()
    } else {
      closingRef.current = true
      dialog.close()
      closingRef.current = false
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
      onClose={() => { if (!closingRef.current) onClose() }}
      onClick={handleClick}
      className={cn(modalVariants({ size, position }), className)}
    >
      {children}
    </dialog>
  )
}
