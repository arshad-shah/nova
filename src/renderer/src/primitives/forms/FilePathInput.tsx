import React, { forwardRef, useReducer, useCallback } from 'react'
import { type VariantProps } from 'class-variance-authority'
import { File, X, Upload, HardDrive } from 'lucide-react'
import { cn } from '../utils/cn'
import { fieldRowVariants } from './field-variants'
import { IPC_CHANNELS } from '@shared/ipc'
import { ipc } from '@/platform/client'

type FpState = { value: string; dragOver: boolean }
type FpAction =
  | { type: 'setValue'; value: string }
  | { type: 'clear' }
  | { type: 'setDrag'; dragOver: boolean }
function fpReducer(s: FpState, a: FpAction): FpState {
  switch (a.type) {
    case 'setValue':
      return { ...s, value: a.value }
    case 'clear':
      return { ...s, value: '' }
    case 'setDrag':
      return { ...s, dragOver: a.dragOver }
  }
}

export interface FilePathInputProps extends VariantProps<typeof fieldRowVariants> {
  value?: string
  defaultValue?: string
  onChange?: (filePath: string) => void
  placeholder?: string
  accept?: string
  disabled?: boolean
  className?: string
  id?: string
}

export const FilePathInput = forwardRef<HTMLDivElement, FilePathInputProps>(
  (
    {
      value: controlledValue,
      defaultValue = '',
      onChange,
      placeholder = 'No file selected',
      accept,
      disabled,
      size,
      className,
      id,
    },
    ref
  ) => {
    const isControlled = controlledValue !== undefined
    const [state, dispatch] = useReducer(fpReducer, { value: defaultValue, dragOver: false })

    const currentValue = isControlled ? controlledValue : state.value
    const hasValue = currentValue.length > 0
    const { dragOver } = state

    const setValue = (v: string) => {
      if (!isControlled) dispatch({ type: 'setValue', value: v })
      onChange?.(v)
    }

    const acceptExtensions = accept
      ?.split(',')
      .map((e) => e.trim().toLowerCase().replace(/^\./, ''))

    const isAcceptedFile = (name: string) => {
      if (!acceptExtensions) return true
      const ext = name.split('.').pop()?.toLowerCase()
      return ext ? acceptExtensions.includes(ext) : true
    }

    const handleBrowse = async () => {
      const filters = accept
        ? [{ name: 'Files', extensions: accept.split(',').map((e) => e.trim().replace(/^\./, '')) }]
        : undefined
      const result = await ipc.invoke(IPC_CHANNELS.DIALOG_OPEN_FILE_PATH, { filters })
      if ('cancelled' in result) return
      setValue(result.filePath)
    }

    const handleClear = () => {
      if (!isControlled) dispatch({ type: 'clear' })
      onChange?.('')
    }

    const handleDragOver = useCallback(
      (e: React.DragEvent) => {
        e.preventDefault()
        e.stopPropagation()
        if (!disabled) dispatch({ type: 'setDrag', dragOver: true })
      },
      [disabled]
    )

    const handleDragLeave = useCallback((e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      dispatch({ type: 'setDrag', dragOver: false })
    }, [])

    const handleDrop = useCallback(
      (e: React.DragEvent) => {
        e.preventDefault()
        e.stopPropagation()
        dispatch({ type: 'setDrag', dragOver: false })
        if (disabled) return
        const files = e.dataTransfer.files
        if (files.length === 0) return
        const file = files[0]
        if (!isAcceptedFile(file.name)) return
        // In Electron, dropped files expose a .path property with the full native path
        const filePath = (file as globalThis.File & { path?: string }).path
        if (filePath) {
          setValue(filePath)
        }
      },
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [disabled, acceptExtensions]
    )

    const displayName = hasValue ? currentValue.split(/[/\\]/).pop() ?? currentValue : null

    return (
      <div
        ref={ref}
        id={id}
        className={cn('flex flex-col', className)}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <div
          className={cn(
            fieldRowVariants({ size }),
            dragOver
              ? 'border-accent shadow-[var(--shadow-focus-glow),var(--shadow-input-inset)] bg-[color-mix(in_srgb,var(--color-accent)_12%,transparent)]'
              : hasValue
                ? 'border-[color-mix(in_srgb,var(--color-accent)_36%,transparent)] bg-[color-mix(in_srgb,var(--color-accent)_7%,transparent)]'
                : 'border-border-default hover:border-border-strong',
            disabled && 'opacity-50 pointer-events-none'
          )}
        >
          {dragOver ? (
            <Upload size={14} className="shrink-0 text-accent" />
          ) : hasValue ? (
            <HardDrive size={14} className="shrink-0 text-accent" />
          ) : (
            <File size={14} className="shrink-0 text-text-muted" />
          )}

          <span
            className={cn(
              'flex-1 truncate',
              dragOver ? 'text-accent font-medium' : hasValue ? 'font-mono text-text-primary' : 'text-text-muted'
            )}
            title={hasValue ? currentValue : undefined}
          >
            {dragOver ? 'Drop file here' : displayName ?? placeholder}
          </span>

          {hasValue && !dragOver && (
            <>
              <span className="inline-flex shrink-0 items-center rounded-full bg-accent-muted px-[7px] py-0.5 text-[10px] font-semibold text-accent">
                selected
              </span>
              <button
                type="button"
                onClick={handleClear}
                disabled={disabled}
                className="shrink-0 rounded p-0.5 text-text-muted hover:bg-hover hover:text-text-primary transition-colors duration-[var(--transition-fast)] motion-reduce:transition-none"
                aria-label="Clear"
              >
                <X size={12} />
              </button>
            </>
          )}

          {!hasValue && !dragOver && (
            <button
              type="button"
              onClick={handleBrowse}
              disabled={disabled}
              className="shrink-0 inline-flex items-center rounded-[var(--field-r-sm)] border border-border-default bg-bg-elevated px-2 text-[length:var(--field-ctl-fs)] text-text-secondary hover:border-border-strong hover:text-text-primary transition-colors duration-[var(--transition-fast)] motion-reduce:transition-none h-[calc(var(--field-ctl-h)*0.72)]"
            >
              Browse
            </button>
          )}
        </div>
      </div>
    )
  }
)

FilePathInput.displayName = 'FilePathInput'
