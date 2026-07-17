import React, { useState } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../utils/cn'

type MenuItem = {
  label: string
  onSelect: () => void
  disabled?: boolean
}

const menuItemVariants = cva(
  'w-full text-left whitespace-nowrap hover:bg-hover focus:bg-hover disabled:opacity-50 disabled:pointer-events-none transition-colors duration-[var(--transition-fast)]',
  {
    variants: {
      size: {
        sm: 'text-xs py-1 px-2',
        md: 'text-sm py-1.5 px-3',
        lg: 'text-base py-2 px-4',
      },
    },
    defaultVariants: {
      size: 'md',
    },
  }
)

type ContextMenuProps = VariantProps<typeof menuItemVariants> & {
  items: MenuItem[]
  className?: string
  children: React.ReactNode
}

type Position = { x: number; y: number }

export function ContextMenu({ items, size, className, children }: ContextMenuProps) {
  const [position, setPosition] = useState<Position | null>(null)

  function handleContextMenu(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    setPosition({ x: e.clientX, y: e.clientY })
  }

  function close() {
    setPosition(null)
  }

  return (
    <div onContextMenu={handleContextMenu}>
      {children}
      {position && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={close}
            aria-hidden="true"
          />
          <div
            role="menu"
            className={cn(
              'fixed z-50 bg-bg-elevated border border-border-default rounded-lg py-1 min-w-[7rem] shadow-[var(--shadow-dropdown)]',
              className
            )}
            style={{ top: position.y, left: position.x }}
          >
            {items.map((item) => (
              <button
                key={item.label}
                role="menuitem"
                disabled={item.disabled}
                className={menuItemVariants({ size })}
                onClick={() => {
                  item.onSelect()
                  close()
                }}
              >
                {item.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
