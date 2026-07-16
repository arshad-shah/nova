import React, { forwardRef, useState } from 'react'
import {
  useFloating,
  useDismiss,
  useInteractions,
  FloatingPortal,
  offset,
  flip,
  shift,
  autoUpdate,
} from '@floating-ui/react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../utils/cn'
import { ColorPicker } from './ColorPicker'
import { parseColor, rgbToHex, isValidColor } from './color-utils'

const colorInputVariants = cva(
  'flex items-center gap-2 border bg-[linear-gradient(180deg,var(--color-input-gradient-top),var(--color-input-gradient-bottom)),var(--color-bg-tertiary)] text-text-primary shadow-[var(--shadow-input-inset)] transition-all duration-[var(--transition-fast)] focus-within:shadow-[var(--shadow-focus-glow),var(--shadow-input-inset)] border-border-default hover:border-border-strong',
  {
    variants: {
      size: {
        xs: 'h-7 px-2 text-xs rounded',
        sm: 'h-8 px-2 text-xs rounded',
        md: 'h-9 px-3 text-sm rounded-md',
        lg: 'h-10 px-3 text-sm rounded-md',
        xl: 'h-12 px-4 text-base rounded-lg',
      },
    },
    defaultVariants: { size: 'md' },
  }
)

function isValidHex(s: string): boolean {
  return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(s)
}

export interface ColorInputProps extends VariantProps<typeof colorInputVariants> {
  value?: string
  defaultValue?: string
  onChange?: (value: string) => void
  presets?: string[]
  showPicker?: boolean
  disabled?: boolean
  className?: string
  'aria-label'?: string
}

export const ColorInput = forwardRef<HTMLInputElement, ColorInputProps>(
  ({ value: controlledValue, defaultValue = '#7A5CFF', onChange, presets, showPicker = true, disabled, size, className, 'aria-label': ariaLabel }, ref) => {
    const isControlled = controlledValue !== undefined
    const [internalValue, setInternalValue] = useState(defaultValue)
    const [isOpen, setIsOpen] = useState(false)

    const currentValue = isControlled ? controlledValue : internalValue

    const { refs, floatingStyles, context } = useFloating({
      placement: 'bottom-start',
      open: isOpen,
      onOpenChange: setIsOpen,
      whileElementsMounted: autoUpdate,
      middleware: [offset(4), flip({ padding: 8 }), shift({ padding: 8 })],
    })

    const dismiss = useDismiss(context)
    const { getReferenceProps, getFloatingProps } = useInteractions([dismiss])

    const setValue = (v: string) => {
      if (!isControlled) setInternalValue(v)
      onChange?.(v)
    }

    const handleTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value
      if (!isControlled) setInternalValue(raw)
      if (isValidHex(raw)) onChange?.(raw)
    }

    const handleBlur = () => {
      if (!isValidHex(currentValue)) {
        setValue(defaultValue)
      }
    }

    const handlePickerChange = (color: string) => {
      const [r, g, b] = parseColor(color)
      const hex = rgbToHex(r, g, b)
      setValue(hex)
    }

    return (
      <div ref={refs.setReference} className="relative" {...getReferenceProps()}>
        <div className={cn(colorInputVariants({ size }), disabled && 'opacity-50 pointer-events-none', className)}>
          <button
            type="button"
            tabIndex={-1}
            onClick={() => showPicker && setIsOpen(!isOpen)}
            className="shrink-0"
            aria-label="Pick color"
          >
            <div
              className="w-5 h-5 rounded border border-border-default"
              style={{ backgroundColor: isValidHex(currentValue) ? currentValue : defaultValue }}
            />
          </button>
          <input
            ref={ref}
            type="text"
            value={currentValue}
            onChange={handleTextChange}
            onBlur={handleBlur}
            disabled={disabled}
            aria-label={ariaLabel ?? 'Color value'}
            className="flex-1 h-full bg-transparent outline-none min-w-0 font-mono text-inherit"
            maxLength={7}
          />
        </div>

        {isOpen && showPicker && (
          <FloatingPortal>
            <div
              ref={refs.setFloating}
              style={{ ...floatingStyles, zIndex: 50 }}
              {...getFloatingProps()}
            >
              <ColorPicker
                value={isValidHex(currentValue) ? currentValue : defaultValue}
                onChange={handlePickerChange}
                presets={presets}
              />
            </div>
          </FloatingPortal>
        )}
      </div>
    )
  }
)

ColorInput.displayName = 'ColorInput'
