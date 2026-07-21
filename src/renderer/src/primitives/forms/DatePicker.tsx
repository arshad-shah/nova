import React, { forwardRef, useReducer, useCallback, useRef, useEffect } from 'react'
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../utils/cn'
import { fieldSizeVariants } from './field-variants'
import { useClickOutside } from '@/hooks/useClickOutside'

const dateInputVariants = cva(
  [
    'flex items-center gap-[var(--field-gap)] border text-text-primary',
    'bg-[linear-gradient(180deg,var(--color-input-gradient-top),var(--color-input-gradient-bottom)),var(--color-bg-tertiary)]',
    'shadow-[var(--shadow-input-inset)]',
    'h-[var(--field-ctl-h)] px-[var(--field-px)] text-[length:var(--field-ctl-fs)] rounded-[var(--field-ctl-r)]',
    'transition-all duration-[var(--transition-fast)] motion-reduce:transition-none',
    'focus-within:shadow-[var(--shadow-focus-glow),var(--shadow-input-inset)]',
    'border-border-default hover:border-border-strong',
  ].join(' '),
  {
    variants: { size: fieldSizeVariants },
    defaultVariants: { size: 'md' },
  }
)

function formatDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function parseDate(s: string): Date | null {
  const match = s.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return null
  const d = new Date(+match[1], +match[2] - 1, +match[3])
  return isNaN(d.getTime()) ? null : d
}

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate()
}

function getFirstDayOfWeek(year: number, month: number): number {
  return new Date(year, month, 1).getDay()
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const DAY_HEADERS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

type DpState = {
  value: string
  draft: string
  editing: boolean
  open: boolean
  viewYear: number
  viewMonth: number
}
type DpAction =
  | { type: 'focus' }
  | { type: 'edit'; text: string }
  | { type: 'commit'; value: string | null }
  | { type: 'toggle' }
  | { type: 'close' }
  | { type: 'prevMonth' }
  | { type: 'nextMonth' }
  | { type: 'pick'; value: string }
  | { type: 'syncView'; value: string }

function syncTo(s: DpState, value: string): DpState {
  const d = parseDate(value)
  return d ? { ...s, value, viewYear: d.getFullYear(), viewMonth: d.getMonth() } : { ...s, value }
}

function dpReducer(s: DpState, a: DpAction): DpState {
  switch (a.type) {
    case 'focus':
      return { ...s, editing: true, draft: s.value }
    case 'edit':
      return { ...s, draft: a.text }
    case 'commit':
      return a.value != null ? { ...syncTo(s, a.value), editing: false } : { ...s, editing: false }
    case 'toggle':
      return s.open ? { ...s, open: false } : { ...syncTo(s, s.value), open: true }
    case 'close':
      return { ...s, open: false }
    case 'prevMonth':
      return s.viewMonth === 0 ? { ...s, viewYear: s.viewYear - 1, viewMonth: 11 } : { ...s, viewMonth: s.viewMonth - 1 }
    case 'nextMonth':
      return s.viewMonth === 11 ? { ...s, viewYear: s.viewYear + 1, viewMonth: 0 } : { ...s, viewMonth: s.viewMonth + 1 }
    case 'pick':
      return { ...syncTo(s, a.value), open: false }
    case 'syncView':
      return syncTo(s, a.value)
  }
}

export interface DatePickerProps extends VariantProps<typeof dateInputVariants> {
  value?: string
  defaultValue?: string
  onChange?: (value: string) => void
  min?: string
  max?: string
  disabled?: boolean
  placeholder?: string
  className?: string
}

export const DatePicker = forwardRef<HTMLInputElement, DatePickerProps>(
  ({ value: controlledValue, defaultValue, onChange, min, max, disabled, placeholder = 'YYYY-MM-DD', size, className }, ref) => {
    const isControlled = controlledValue !== undefined
    const [state, dispatch] = useReducer(dpReducer, undefined, () => {
      const d = parseDate(defaultValue ?? '') ?? new Date()
      return {
        value: defaultValue ?? '',
        draft: '',
        editing: false,
        open: false,
        viewYear: d.getFullYear(),
        viewMonth: d.getMonth(),
      }
    })
    const containerRef = useRef<HTMLDivElement>(null)

    const value = isControlled ? controlledValue : state.value
    const { editing, open, viewYear, viewMonth } = state

    // Day-select & Today: notify and sync the view + close. The stored value is
    // ignored when controlled (display reads props), so we always dispatch.
    const commitValue = useCallback(
      (v: string) => {
        onChange?.(v)
        dispatch({ type: 'pick', value: v })
      },
      [onChange]
    )

    const commitDraft = () => {
      const d = parseDate(state.draft)
      const v = d ? formatDate(d) : null
      if (v) onChange?.(v)
      dispatch({ type: 'commit', value: isControlled ? null : v })
    }

    // Keep the calendar view in step with a controlled value prop.
    useEffect(() => {
      if (isControlled) dispatch({ type: 'syncView', value: controlledValue! })
    }, [isControlled, controlledValue])

    const isDateDisabled = useCallback(
      (day: number) => {
        const dateStr = formatDate(new Date(viewYear, viewMonth, day))
        if (min && dateStr < min) return true
        if (max && dateStr > max) return true
        return false
      },
      [viewYear, viewMonth, min, max]
    )

    useClickOutside(containerRef, () => dispatch({ type: 'close' }), { enabled: open })

    const daysInMonth = getDaysInMonth(viewYear, viewMonth)
    const firstDay = getFirstDayOfWeek(viewYear, viewMonth)
    const selectedDateStr = value

    return (
      <div ref={containerRef} className="relative">
        <div className={cn(dateInputVariants({ size }), disabled && 'opacity-50 pointer-events-none', className)}>
          <button
            type="button"
            tabIndex={-1}
            onClick={() => dispatch({ type: 'toggle' })}
            className="shrink-0 text-text-muted hover:text-text-primary transition-colors duration-[var(--transition-fast)] motion-reduce:transition-none"
            aria-label="Toggle calendar"
          >
            <Calendar size={16} />
          </button>
          <input
            ref={ref}
            type="text"
            value={editing ? state.draft : value}
            onChange={(e) => dispatch({ type: 'edit', text: e.target.value })}
            onFocus={() => dispatch({ type: 'focus' })}
            onBlur={commitDraft}
            placeholder={placeholder}
            disabled={disabled}
            className="flex-1 h-full bg-transparent outline-none min-w-0 font-mono tabular-nums text-inherit placeholder:text-text-muted"
          />
        </div>

        {open && (
          <div className="absolute top-full left-0 mt-1 z-50 w-[264px] rounded-[10px] border border-border-default bg-bg-secondary shadow-[var(--shadow-dropdown)] p-3">
            <div className="flex items-center justify-between mb-2">
              <button
                type="button"
                onClick={() => dispatch({ type: 'prevMonth' })}
                className="p-1 rounded text-text-secondary hover:bg-hover transition-colors duration-[var(--transition-fast)] motion-reduce:transition-none"
                aria-label="Previous month"
              >
                <ChevronLeft size={14} />
              </button>
              <span className="text-sm font-medium text-text-primary">
                {MONTH_NAMES[viewMonth]} {viewYear}
              </span>
              <button
                type="button"
                onClick={() => dispatch({ type: 'nextMonth' })}
                className="p-1 rounded text-text-secondary hover:bg-hover transition-colors duration-[var(--transition-fast)] motion-reduce:transition-none"
                aria-label="Next month"
              >
                <ChevronRight size={14} />
              </button>
            </div>
            <div className="grid grid-cols-7 gap-0.5 text-center text-[11px] text-text-muted mb-1">
              {DAY_HEADERS.map((d) => (
                <div key={d}>{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-0.5">
              {Array.from({ length: firstDay }).map((_, i) => (
                <div key={`empty-${i}`} />
              ))}
              {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((day) => {
                const dateStr = formatDate(new Date(viewYear, viewMonth, day))
                const isSelected = dateStr === selectedDateStr
                const isToday = dateStr === formatDate(new Date())
                const isDayDisabled = isDateDisabled(day)

                return (
                  <button
                    key={day}
                    type="button"
                    onClick={() => !isDayDisabled && commitValue(dateStr)}
                    disabled={isDayDisabled}
                    className={cn(
                      'h-7 w-7 rounded-[7px] text-xs tabular-nums transition-colors duration-[var(--transition-fast)] motion-reduce:transition-none',
                      isSelected && 'bg-accent text-text-inverse',
                      !isSelected && isToday && 'border border-accent text-accent',
                      !isSelected && !isToday && 'hover:bg-hover text-text-primary',
                      isDayDisabled && 'opacity-30 pointer-events-none'
                    )}
                  >
                    {day}
                  </button>
                )
              })}
            </div>
            <button
              type="button"
              onClick={() => commitValue(formatDate(new Date()))}
              className="mt-2 w-full rounded-[var(--field-r-sm)] border border-border-default bg-bg-elevated py-1 text-xs text-text-secondary hover:border-border-strong hover:text-text-primary transition-colors duration-[var(--transition-fast)] motion-reduce:transition-none"
            >
              Today
            </button>
          </div>
        )}
      </div>
    )
  }
)

DatePicker.displayName = 'DatePicker'
