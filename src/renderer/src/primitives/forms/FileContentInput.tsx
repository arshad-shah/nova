import React, { forwardRef, useReducer, useCallback } from 'react'
import { type VariantProps } from 'class-variance-authority'
import { File, Shield, X, ChevronDown, ClipboardPaste, Upload } from 'lucide-react'
import { cn } from '../utils/cn'
import { DropdownMenu } from '../surfaces/DropdownMenu'
import type { MenuNode } from '../surfaces/menu/types'
import { Textarea } from './Textarea'
import { fieldRowVariants } from './field-variants'
import { IPC_CHANNELS } from '@shared/ipc'

type FcState = { mode: 'browse' | 'paste'; value: string; fileName: string | null; dragOver: boolean }
type FcAction =
  | { type: 'setMode'; mode: 'browse' | 'paste' }
  | { type: 'fileLoaded'; name: string; content: string }
  | { type: 'paste'; content: string }
  | { type: 'clear' }
  | { type: 'setDrag'; dragOver: boolean }
function fcReducer(s: FcState, a: FcAction): FcState {
  switch (a.type) {
    case 'setMode':
      return { ...s, mode: a.mode }
    case 'fileLoaded':
      return { ...s, fileName: a.name, value: a.content, mode: 'browse' }
    case 'paste':
      return { ...s, value: a.content }
    case 'clear':
      return { ...s, fileName: null, value: '' }
    case 'setDrag':
      return { ...s, dragOver: a.dragOver }
  }
}

export interface FileContentInputProps extends VariantProps<typeof fieldRowVariants> {
  value?: string
  defaultValue?: string
  onChange?: (content: string) => void
  placeholder?: string
  accept?: string
  disabled?: boolean
  className?: string
  id?: string
  defaultMode?: 'browse' | 'paste'
}

export const FileContentInput = forwardRef<HTMLDivElement, FileContentInputProps>(
  (
    {
      value: controlledValue,
      defaultValue = '',
      onChange,
      placeholder = 'Paste content here...',
      accept,
      disabled,
      size,
      className,
      id,
      defaultMode = 'browse',
    },
    ref
  ) => {
    const isControlled = controlledValue !== undefined
    const [state, dispatch] = useReducer(fcReducer, {
      mode: defaultMode,
      value: defaultValue,
      fileName: null,
      dragOver: false,
    })

    const { mode, fileName, dragOver } = state
    const currentValue = isControlled ? controlledValue : state.value
    const hasContent = currentValue.length > 0

    const acceptExtensions = accept
      ?.split(',')
      .map((e) => e.trim().toLowerCase().replace(/^\./, ''))

    const isAcceptedFile = (name: string) => {
      if (!acceptExtensions) return true
      const ext = name.split('.').pop()?.toLowerCase()
      return ext ? acceptExtensions.includes(ext) : true
    }

    const readFileContent = (file: globalThis.File) => {
      const reader = new FileReader()
      reader.onload = () => {
        const content = reader.result as string
        // One action captures content + name + flips to browse atomically. The
        // stored `value` is ignored when controlled (currentValue reads props),
        // but fileName + mode are internal, so we always dispatch.
        dispatch({ type: 'fileLoaded', name: file.name, content })
        onChange?.(content)
      }
      reader.readAsText(file)
    }

    const handleBrowse = async () => {
      const filters = accept
        ? [{ name: 'Files', extensions: accept.split(',').map((e) => e.trim().replace(/^\./, '')) }]
        : undefined
      const result = await window.electronAPI.invoke(IPC_CHANNELS.DIALOG_OPEN_FILE, { filters })
      if ('cancelled' in result) return
      dispatch({ type: 'fileLoaded', name: result.filePath, content: result.content })
      onChange?.(result.content)
    }

    const handleClear = () => {
      dispatch({ type: 'clear' })
      onChange?.('')
    }

    const handlePasteChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      dispatch({ type: 'paste', content: e.target.value })
      onChange?.(e.target.value)
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
        // For content reading, use FileReader (not the native .path)
        readFileContent(file)
      },
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [disabled, acceptExtensions]
    )

    const menuItems: MenuNode[] =
      mode === 'browse'
        ? [
            { kind: 'item', id: 'browse-file', label: 'Browse file', onSelect: handleBrowse },
            { kind: 'item', id: 'paste-content', label: 'Paste content', onSelect: () => dispatch({ type: 'setMode', mode: 'paste' }) },
          ]
        : [
            { kind: 'item', id: 'browse-file', label: 'Browse file', onSelect: () => { dispatch({ type: 'setMode', mode: 'browse' }); handleBrowse() } },
            { kind: 'item', id: 'paste-content', label: 'Paste content', onSelect: () => {}, disabled: true },
          ]

    const displayName = fileName ?? (hasContent ? 'Pasted content' : null)

    if (mode === 'paste') {
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
              'rounded-[var(--field-r-md)] border overflow-hidden',
              'bg-[linear-gradient(180deg,var(--color-input-gradient-top),var(--color-input-gradient-bottom)),var(--color-bg-tertiary)]',
              'shadow-[var(--shadow-input-inset)] transition-all duration-[var(--transition-fast)] motion-reduce:transition-none',
              dragOver ? 'border-accent shadow-[var(--shadow-focus-glow),var(--shadow-input-inset)]' : 'border-border-default',
              disabled && 'opacity-50 pointer-events-none'
            )}
          >
            <div className="flex items-center justify-between px-3 py-1.5 border-b border-border-default">
              <span className="flex items-center gap-1.5 text-xs text-text-muted">
                <ClipboardPaste size={12} />
                Paste content
              </span>
              <DropdownMenu
                trigger={
                  <button
                    type="button"
                    aria-label="Input mode"
                    className="flex items-center p-0.5 rounded text-text-muted hover:text-text-primary hover:bg-hover transition-colors duration-[var(--transition-fast)] motion-reduce:transition-none"
                  >
                    <ChevronDown size={12} />
                  </button>
                }
                items={menuItems}
              />
            </div>
            <Textarea
              value={currentValue}
              onChange={handlePasteChange}
              placeholder={placeholder}
              disabled={disabled}
              rows={6}
              className="border-0 rounded-none shadow-none focus-within:shadow-none bg-transparent font-mono text-xs"
            />
          </div>
        </div>
      )
    }

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
              : hasContent
                ? 'border-[color-mix(in_srgb,var(--color-accent)_36%,transparent)] bg-[color-mix(in_srgb,var(--color-accent)_7%,transparent)]'
                : 'border-border-default hover:border-border-strong',
            disabled && 'opacity-50 pointer-events-none'
          )}
        >
          {dragOver ? (
            <Upload size={14} className="shrink-0 text-accent" />
          ) : hasContent ? (
            <Shield size={14} className="shrink-0 text-accent" />
          ) : (
            <File size={14} className="shrink-0 text-text-muted" />
          )}

          <span
            className={cn(
              'flex-1 truncate',
              dragOver ? 'text-accent font-medium' : hasContent ? 'font-mono text-text-primary' : 'text-text-muted'
            )}
          >
            {dragOver ? 'Drop file here' : displayName ?? 'No file selected'}
          </span>

          {hasContent && !dragOver && (
            <>
              <span className="inline-flex shrink-0 items-center rounded-full bg-accent-muted px-[7px] py-0.5 text-[10px] font-semibold text-accent">
                loaded
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

          {!hasContent && !dragOver && (
            <button
              type="button"
              onClick={handleBrowse}
              disabled={disabled}
              className="shrink-0 inline-flex items-center rounded-[var(--field-r-sm)] border border-border-default bg-bg-elevated px-2 text-[length:var(--field-ctl-fs)] text-text-secondary hover:border-border-strong hover:text-text-primary transition-colors duration-[var(--transition-fast)] motion-reduce:transition-none h-[calc(var(--field-ctl-h)*0.72)]"
            >
              Browse
            </button>
          )}

          <DropdownMenu
            trigger={
              <button
                type="button"
                disabled={disabled}
                aria-label="Input mode"
                className="shrink-0 rounded p-0.5 text-text-muted hover:text-text-primary hover:bg-hover transition-colors duration-[var(--transition-fast)] motion-reduce:transition-none"
              >
                <ChevronDown size={12} />
              </button>
            }
            items={menuItems}
          />
        </div>
      </div>
    )
  }
)

FileContentInput.displayName = 'FileContentInput'
