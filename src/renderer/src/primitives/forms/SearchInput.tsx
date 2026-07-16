import React, { forwardRef } from 'react'
import { Search } from 'lucide-react'
import { Input, type InputProps } from './Input'
import { Kbd } from '../typography/Kbd'

/**
 * SearchInput: an Input that knows it's a search box.
 *
 * Everything visual now comes from Input — this only supplies the magnifier,
 * turns on `clearable`, and puts the shortcut hint in the suffix slot. It used
 * to be a second copy of the field shell whose sizes had drifted onto
 * hardcoded heights (h-6/h-7/h-8…), which meant it silently ignored the
 * density setting that rescales every other field.
 */
export interface SearchInputProps
  extends Omit<InputProps, 'prefix' | 'suffix' | 'clearable' | 'type'> {
  /** Shortcut hint pinned to the right, e.g. "⌘K". */
  shortcut?: string
}

export const SearchInput = forwardRef<HTMLInputElement, SearchInputProps>(
  ({ shortcut, placeholder = 'Search...', onClear, ...props }, ref) => (
    <Input
      ref={ref}
      // Deliberately `text`, not `search`: WebKit draws its own clear button on
      // a search input, which would sit next to the one `clearable` renders.
      type="text"
      placeholder={placeholder}
      prefix={<Search size={14} />}
      // Only offer to clear if the caller can actually handle it.
      clearable={Boolean(onClear)}
      onClear={onClear}
      suffix={shortcut ? <Kbd size="sm">{shortcut}</Kbd> : undefined}
      {...props}
    />
  )
)

SearchInput.displayName = 'SearchInput'
