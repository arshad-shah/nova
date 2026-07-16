import React, { forwardRef, useMemo, useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { cn } from '../utils/cn'
import { Input, type InputProps } from './Input'

/**
 * PasswordInput: an Input that can be unmasked, and can say how good the
 * password is.
 *
 * The shell, sizing and validity styling are Input's. What's left here is the
 * part that is actually about passwords: the reveal toggle and the strength
 * meter.
 */

interface Strength {
  label: string
  fill: 1 | 2 | 3 | 4
  bar: string
  text: string
}

function getStrength(password: string): Strength {
  let score = 0
  if (password.length >= 8) score++
  if (password.length >= 12) score++
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++
  if (/\d/.test(password)) score++
  if (/[^a-zA-Z0-9]/.test(password)) score++

  if (score <= 1) return { label: 'Weak', fill: 1, bar: 'bg-error', text: 'text-error' }
  if (score <= 2) return { label: 'Fair', fill: 2, bar: 'bg-warning', text: 'text-warning' }
  if (score <= 3) return { label: 'Strong', fill: 3, bar: 'bg-info', text: 'text-info' }
  return { label: 'Very strong', fill: 4, bar: 'bg-success', text: 'text-success' }
}

export interface PasswordInputProps
  extends Omit<InputProps, 'type' | 'suffix' | 'prefix'> {
  /** Show the strength meter under the field. */
  showStrength?: boolean
}

export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(
  (
    { showStrength, placeholder = 'Password', value, defaultValue, onChange, className, ...props },
    ref
  ) => {
    const [visible, setVisible] = useState(false)
    const [internal, setInternal] = useState(String(defaultValue ?? ''))

    const current = value !== undefined ? String(value) : internal
    const strength = useMemo(
      () => (showStrength ? getStrength(current) : null),
      [showStrength, current]
    )

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (value === undefined) setInternal(e.target.value)
      onChange?.(e)
    }

    return (
      <div className="flex flex-col gap-1.5">
        <Input
          ref={ref}
          type={visible ? 'text' : 'password'}
          placeholder={placeholder}
          value={value}
          defaultValue={value === undefined ? defaultValue : undefined}
          onChange={handleChange}
          className={className}
          suffix={
            <button
              type="button"
              // Out of the tab order: Tab should go to the next field. Revealing
              // a password is a mouse-reach affordance, not a step in the form.
              tabIndex={-1}
              onClick={() => setVisible((v) => !v)}
              aria-label={visible ? 'Hide password' : 'Show password'}
              className="text-text-muted transition-colors duration-[var(--transition-fast)] hover:text-text-primary active:[&>svg]:scale-90 motion-reduce:transition-none"
            >
              {visible ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          }
          {...props}
        />
        {strength && current.length > 0 && (
          <div className="flex items-center gap-2">
            <div className="flex flex-1 gap-1">
              {[0, 1, 2, 3].map((i) => (
                <span
                  key={i}
                  className={cn(
                    'h-[3px] flex-1 rounded-full bg-bg-tertiary transition-colors duration-[var(--transition-normal)] motion-reduce:transition-none',
                    i < strength.fill && strength.bar
                  )}
                />
              ))}
            </div>
            <span className={cn('min-w-[64px] text-right text-[10px] font-semibold', strength.text)}>
              {strength.label}
            </span>
          </div>
        )}
      </div>
    )
  }
)

PasswordInput.displayName = 'PasswordInput'
