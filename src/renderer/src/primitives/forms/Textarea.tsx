import React, { forwardRef, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { X } from 'lucide-react'
import { cn } from '../utils/cn'
import { fieldSizeVariants, fieldSurface } from './field-variants'

const MIN_HEIGHT = 40
const MIN_WIDTH = 120
const WARN_AT = 0.8

const textareaRootVariants = cva(
  [
    'relative flex w-full max-w-full flex-col font-sans text-[length:var(--field-ctl-fs)]',
    'rounded-[var(--field-ctl-r)] border',
    fieldSurface,
    'transition-[border-color,box-shadow] duration-[var(--transition-fast)] motion-reduce:transition-none',
    'focus-within:border-accent focus-within:shadow-[var(--shadow-focus-glow),var(--shadow-input-inset)]',
  ].join(' '),
  {
    variants: {
      // Only --field-ctl-fs and --field-ctl-r matter for the card; height is content-driven.
      size: fieldSizeVariants,
      error: {
        true: 'border-error focus-within:shadow-[var(--shadow-error-ring),var(--shadow-input-inset)]',
        false: 'border-border-default hover:border-border-strong',
      },
      /**
       * Whether the field paints its own chrome.
       * - `field` (default): the standard bordered input surface.
       * - `bare`: no border, fill or focus ring. For a textarea that already
       *   sits inside a surface which owns the frame and focus affordance (the
       *   AI composer inside its Card) — without this, such callers drop to a
       *   native <textarea> and lose autoResize/limit/clearable.
       * Declared last so twMerge resolves its border/bg against `error`.
       */
      surface: {
        field: '',
        bare: 'border-transparent bg-none bg-transparent shadow-none focus-within:border-transparent focus-within:shadow-none hover:border-transparent',
      },
    },
    defaultVariants: { size: 'md', error: false, surface: 'field' },
  }
)

export type TextareaResizeMode = 'vertical' | 'horizontal' | 'both' | 'none'

export interface TextareaProps
  extends Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'size' | 'style'>,
    VariantProps<typeof textareaRootVariants> {
  /** Initial rows; minimum when autoResize is on. */
  rows?: number
  /** Grow with content; removes the resize grip. */
  autoResize?: boolean
  /** Row cap for autoResize, then scroll. */
  maxRows?: number
  /** Resize grip axis; 'none' removes it. */
  resize?: TextareaResizeMode
  /** Soft char limit; counter + invalid flip past it. */
  limit?: number
  /** Force the counter without a limit (implied when limit is set). */
  showCount?: boolean
  /** Corner clear button, visible once non-empty. */
  clearable?: boolean
  /** Footer-left actions. */
  toolbar?: React.ReactNode
  onClear?: () => void
  style?: React.CSSProperties
}

const supportsFieldSizing =
  typeof CSS !== 'undefined' && typeof CSS.supports === 'function' && CSS.supports('field-sizing', 'content')

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  (
    {
      className,
      style,
      size,
      error,
      surface,
      rows = 3,
      autoResize,
      maxRows,
      resize = 'vertical',
      limit,
      showCount,
      clearable,
      toolbar,
      onClear,
      value,
      defaultValue,
      disabled,
      readOnly,
      onChange,
      ...rest
    },
    ref
  ) => {
    const rootRef = useRef<HTMLDivElement>(null)
    const innerRef = useRef<HTMLTextAreaElement>(null)
    const [count, setCount] = useState(() => String(value ?? defaultValue ?? '').length)
    const [dragging, setDragging] = useState(false)

    const setRefs = useCallback(
      (node: HTMLTextAreaElement | null) => {
        innerRef.current = node
        if (typeof ref === 'function') ref(node)
        else if (ref) (ref as React.MutableRefObject<HTMLTextAreaElement | null>).current = node
      },
      [ref]
    )

    // Cap height (px) for autoResize + maxRows, derived from the resolved line metrics.
    const computeCap = useCallback(
      (el: HTMLTextAreaElement): number | null => {
        if (maxRows == null) return null
        const cs = getComputedStyle(el)
        const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.55
        const pt = parseFloat(cs.paddingTop) || 0
        const pb = parseFloat(cs.paddingBottom) || 0
        return lh * maxRows + pt + pb
      },
      [maxRows]
    )

    // JS fallback for engines without `field-sizing: content`.
    const adjustHeight = useCallback(() => {
      const el = innerRef.current
      if (!el || !autoResize || supportsFieldSizing) return
      el.style.height = 'auto'
      let next = el.scrollHeight
      const cap = computeCap(el)
      if (cap != null && next > cap) {
        next = cap
        el.style.overflowY = 'auto'
      } else {
        el.style.overflowY = 'hidden'
      }
      el.style.height = `${next}px`
    }, [autoResize, computeCap])

    // Native field-sizing path: enforce the maxRows cap via maxHeight + scroll.
    useLayoutEffect(() => {
      const el = innerRef.current
      if (!el) return
      if (!autoResize) {
        el.style.maxHeight = ''
        return
      }
      if (supportsFieldSizing) {
        const cap = computeCap(el)
        el.style.maxHeight = cap != null ? `${cap}px` : ''
        el.style.overflowY = cap != null ? 'auto' : 'hidden'
      } else {
        adjustHeight()
      }
    }, [autoResize, computeCap, adjustHeight, count, value])

    // Keep the counter in step with a controlled value.
    useEffect(() => {
      if (value !== undefined) setCount(String(value).length)
    }, [value])

    const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      if (value === undefined) setCount(e.target.value.length)
      adjustHeight()
      onChange?.(e)
    }

    const handleClear = () => {
      const el = innerRef.current
      if (el && value === undefined) el.value = ''
      setCount(0)
      onClear?.()
      el?.focus()
      requestAnimationFrame(adjustHeight)
    }

    const handleGripDown = (e: React.PointerEvent) => {
      const field = innerRef.current
      const root = rootRef.current
      if (!field || !root) return
      e.preventDefault()
      ;(e.target as Element).setPointerCapture?.(e.pointerId)
      const startX = e.clientX
      const startY = e.clientY
      // Resize the root (the `flex-1` field fills it). Setting the field's own
      // height is overridden by the flex layout, so drive the card instead —
      // symmetric with the horizontal axis below.
      const startH = root.getBoundingClientRect().height
      const startW = root.getBoundingClientRect().width
      const vertical = resize === 'vertical' || resize === 'both'
      const horizontal = resize === 'horizontal' || resize === 'both'
      setDragging(true)

      const onMove = (ev: PointerEvent) => {
        if (vertical) root.style.height = `${Math.max(MIN_HEIGHT, startH + (ev.clientY - startY))}px`
        if (horizontal) root.style.width = `${Math.max(MIN_WIDTH, startW + (ev.clientX - startX))}px`
      }
      const onUp = () => {
        setDragging(false)
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
        window.removeEventListener('pointercancel', onUp)
      }
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
      window.addEventListener('pointercancel', onUp)
    }

    const overLimit = limit != null && count > limit
    const warn = limit != null && !overLimit && count >= limit * WARN_AT
    const invalid = Boolean(error) || overLimit
    const showCounter = showCount ?? limit != null
    const hasFooter = showCounter || Boolean(toolbar)
    const empty = count === 0
    const gripShown = resize !== 'none' && !autoResize && !disabled && !readOnly
    const clearShown = clearable && !empty && !disabled && !readOnly

    const gripCursor =
      resize === 'both' ? 'cursor-nwse-resize' : resize === 'horizontal' ? 'cursor-ew-resize' : 'cursor-ns-resize'

    return (
      <div
        ref={rootRef}
        style={style}
        className={cn(
          textareaRootVariants({ size, error: invalid, surface }),
          disabled && 'opacity-50 pointer-events-none',
          dragging && 'select-none',
          className
        )}
      >
        <textarea
          ref={setRefs}
          rows={rows}
          value={value}
          defaultValue={defaultValue}
          disabled={disabled}
          readOnly={readOnly}
          onChange={handleChange}
          aria-invalid={invalid || undefined}
          className={cn(
            'block w-full flex-1 resize-none bg-transparent outline-none text-text-primary placeholder:text-text-muted',
            'py-[var(--ta-py)] px-[var(--field-px)] leading-[1.55] min-h-[40px]',
            autoResize && '[field-sizing:content]',
            clearable && 'pr-9',
            gripShown && !hasFooter && 'pb-4'
          )}
          {...rest}
        />

        {clearable && (
          <button
            type="button"
            onClick={handleClear}
            aria-label="Clear"
            aria-hidden={!clearShown}
            tabIndex={clearShown ? 0 : -1}
            className={cn(
              'absolute top-[6px] right-[6px] grid place-items-center rounded p-1 text-text-muted',
              'hover:bg-hover hover:text-text-primary transition-colors duration-[var(--transition-fast)] motion-reduce:transition-none',
              !clearShown && 'opacity-0 pointer-events-none'
            )}
          >
            <X size={14} />
          </button>
        )}

        {hasFooter && (
          <div
            className={cn(
              'flex items-center justify-between gap-2 border-t border-border-default px-[var(--field-px)] py-1',
              gripShown && 'pr-5'
            )}
          >
            <div className="flex items-center gap-1">{toolbar}</div>
            {showCounter && (
              <span
                className={cn(
                  'font-mono tabular-nums text-[10px] text-text-muted',
                  warn && 'text-warning',
                  overLimit && 'text-error'
                )}
              >
                {count}
                {limit != null && `/${limit}`}
              </span>
            )}
          </div>
        )}

        {gripShown && (
          <button
            type="button"
            tabIndex={-1}
            aria-label="Resize"
            onPointerDown={handleGripDown}
            style={{ width: 'calc(var(--field-ctl-fs) - 2px)', height: 'calc(var(--field-ctl-fs) - 2px)' }}
            className={cn(
              'absolute bottom-[3px] right-[3px] grid place-items-center text-text-muted hover:text-text-secondary touch-none',
              gripCursor
            )}
          >
            <svg
              viewBox="0 0 16 16"
              width="100%"
              height="100%"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              strokeLinecap="round"
              aria-hidden="true"
            >
              <line x1="1" y1="15" x2="15" y2="1" />
              <line x1="6" y1="15" x2="15" y2="6" />
              <line x1="11" y1="15" x2="15" y2="11" />
            </svg>
          </button>
        )}
      </div>
    )
  }
)

Textarea.displayName = 'Textarea'
