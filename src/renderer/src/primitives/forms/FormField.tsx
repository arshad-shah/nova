import React, { useId } from 'react'
import { Label } from './Label'
import { cn } from '../utils/cn'

/**
 * FormField owns the label and the line under the field. The field primitives
 * own their own chrome and never grow a `label` prop — otherwise there'd be two
 * ways to write the same form and they'd drift.
 */
export interface FormFieldProps {
  label?: string
  /** Why it's wrong. Wins over `success` and `hint`. */
  error?: string
  /** Confirmation that it's right. Shown when there's no `error`. */
  success?: string
  /** Guidance. Shown only when there's nothing more urgent to say. */
  hint?: string
  children: React.ReactElement<{ id?: string }>
  className?: string
}

export function FormField({ label, error, success, hint, children, className }: FormFieldProps) {
  const id = useId()

  const child = React.cloneElement(children, { id })

  // Exactly one line, in order of urgency: a problem outranks a confirmation,
  // and both outrank generic guidance. Stacking them would let a field say
  // "looks good" and "that's invalid" at once.
  const message = error
    ? { text: error, tone: 'text-error' }
    : success
      ? { text: success, tone: 'text-success' }
      : hint
        ? { text: hint, tone: 'text-text-muted' }
        : null

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {label && <Label htmlFor={id}>{label}</Label>}
      {child}
      {message && <span className={cn('text-xs', message.tone)}>{message.text}</span>}
    </div>
  )
}

FormField.displayName = 'FormField'
