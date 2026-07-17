import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import { Select, type SelectItem } from '@/primitives/forms/Select'

/**
 * Behavioural tests for Select's floating-ui-backed listbox: opening, keyboard
 * navigation, selection, typeahead, search filtering, and the clear
 * affordance. `controls.test.tsx` only asserts trigger rendering/sizing/state
 * props — it never opens the dropdown once, so none of the real interaction
 * logic below was covered.
 */

const fruitOptions: SelectItem[] = [
  { value: 'apple', label: 'Apple' },
  { value: 'banana', label: 'Banana', disabled: true },
  { value: 'cherry', label: 'Cherry' },
]

describe('Select — open/close', () => {
  it('opens the listbox on trigger click and shows every option', async () => {
    const user = userEvent.setup()
    render(<Select options={fruitOptions} value="" onChange={() => {}} />)
    expect(screen.queryByRole('option')).not.toBeInTheDocument()
    await user.click(screen.getByRole('combobox'))
    expect(screen.getByRole('option', { name: 'Apple' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Cherry' })).toBeInTheDocument()
  })

  it('does not open when the trigger is disabled', () => {
    render(<Select options={fruitOptions} value="" onChange={() => {}} disabled />)
    fireEvent.click(screen.getByRole('combobox'))
    expect(screen.queryByRole('option')).not.toBeInTheDocument()
  })

  it('opens on ArrowDown while closed instead of navigating', async () => {
    const user = userEvent.setup()
    render(<Select options={fruitOptions} value="" onChange={() => {}} />)
    screen.getByRole('combobox').focus()
    await user.keyboard('{ArrowDown}')
    expect(screen.getByRole('combobox')).toHaveAttribute('aria-expanded', 'true')
  })
})

describe('Select — selection', () => {
  it('calls onChange with the clicked option value and closes the menu', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Select options={fruitOptions} value="" onChange={onChange} />)
    await user.click(screen.getByRole('combobox'))
    await user.click(screen.getByRole('option', { name: 'Cherry' }))
    expect(onChange).toHaveBeenCalledWith('cherry')
    expect(screen.getByRole('combobox')).toHaveAttribute('aria-expanded', 'false')
  })

  it('does not select a disabled option and keeps the menu open', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Select options={fruitOptions} value="" onChange={onChange} />)
    await user.click(screen.getByRole('combobox'))
    fireEvent.click(screen.getByRole('option', { name: 'Banana' }))
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByRole('combobox')).toHaveAttribute('aria-expanded', 'true')
  })

  it('marks a disabled option aria-disabled for assistive tech', async () => {
    const user = userEvent.setup()
    render(<Select options={fruitOptions} value="" onChange={() => {}} />)
    await user.click(screen.getByRole('combobox'))
    expect(screen.getByRole('option', { name: 'Banana' })).toHaveAttribute('aria-disabled', 'true')
  })

  it('marks the currently selected option aria-selected', async () => {
    const user = userEvent.setup()
    render(<Select options={fruitOptions} value="cherry" onChange={() => {}} />)
    await user.click(screen.getByRole('combobox'))
    expect(screen.getByRole('option', { name: 'Cherry' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('option', { name: 'Apple' })).toHaveAttribute('aria-selected', 'false')
  })
})

describe('Select — keyboard navigation', () => {
  it('skips a disabled option when arrowing down', async () => {
    const user = userEvent.setup()
    render(<Select options={fruitOptions} value="" onChange={() => {}} />)
    await user.click(screen.getByRole('combobox'))
    // Focus starts on the first enabled option (Apple); ArrowDown should
    // skip the disabled Banana and land on Cherry.
    await user.keyboard('{ArrowDown}')
    expect(screen.getByRole('option', { name: 'Cherry' })).toHaveClass('bg-hover')
    expect(screen.getByRole('option', { name: 'Apple' })).not.toHaveClass('bg-hover')
  })

  it('wraps from the last enabled option back to the first on ArrowDown', async () => {
    const user = userEvent.setup()
    render(<Select options={fruitOptions} value="" onChange={() => {}} />)
    await user.click(screen.getByRole('combobox'))
    await user.keyboard('{ArrowDown}{ArrowDown}') // Apple -> Cherry -> wrap -> Apple
    expect(screen.getByRole('option', { name: 'Apple' })).toHaveClass('bg-hover')
  })

  it('wraps from the first enabled option to the last on ArrowUp', async () => {
    const user = userEvent.setup()
    render(<Select options={fruitOptions} value="" onChange={() => {}} />)
    await user.click(screen.getByRole('combobox'))
    await user.keyboard('{ArrowUp}')
    expect(screen.getByRole('option', { name: 'Cherry' })).toHaveClass('bg-hover')
  })

  it('jumps to the first/last enabled option on Home/End', async () => {
    const user = userEvent.setup()
    render(<Select options={fruitOptions} value="" onChange={() => {}} />)
    await user.click(screen.getByRole('combobox'))
    await user.keyboard('{ArrowDown}') // move off Apple onto Cherry first
    await user.keyboard('{Home}')
    expect(screen.getByRole('option', { name: 'Apple' })).toHaveClass('bg-hover')
    await user.keyboard('{End}')
    expect(screen.getByRole('option', { name: 'Cherry' })).toHaveClass('bg-hover')
  })

  it('selects the focused option on Enter', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Select options={fruitOptions} value="" onChange={onChange} />)
    await user.click(screen.getByRole('combobox'))
    await user.keyboard('{ArrowDown}{Enter}') // Apple -> Cherry -> select
    expect(onChange).toHaveBeenCalledWith('cherry')
  })

  it('closes without selecting on Escape', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Select options={fruitOptions} value="" onChange={onChange} />)
    await user.click(screen.getByRole('combobox'))
    await user.keyboard('{Escape}')
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByRole('combobox')).toHaveAttribute('aria-expanded', 'false')
  })

  it('closes without selecting on Tab', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Select options={fruitOptions} value="" onChange={onChange} />)
    await user.click(screen.getByRole('combobox'))
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Tab' })
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByRole('combobox')).toHaveAttribute('aria-expanded', 'false')
  })

  it('jumps focus to the option matching typed letters (typeahead)', async () => {
    const user = userEvent.setup()
    render(<Select options={fruitOptions} value="" onChange={() => {}} />)
    await user.click(screen.getByRole('combobox'))
    await user.keyboard('c')
    expect(screen.getByRole('option', { name: 'Cherry' })).toHaveClass('bg-hover')
  })

  it('matches typeahead against the start of the label only, not any substring', async () => {
    // 'ra' is a substring of both 'Grape' and 'Orange' but a prefix of
    // neither, so a real prefix match should leave focus untouched. A
    // matcher weakened to `.includes()` would jump to 'Grape' instead.
    const user = userEvent.setup()
    const options: SelectItem[] = [
      { value: 'apple', label: 'Apple' },
      { value: 'grape', label: 'Grape' },
      { value: 'orange', label: 'Orange' },
    ]
    render(<Select options={options} value="" onChange={() => {}} />)
    await user.click(screen.getByRole('combobox'))
    expect(screen.getByRole('option', { name: 'Apple' })).toHaveClass('bg-hover')
    await user.keyboard('ra')
    expect(screen.getByRole('option', { name: 'Apple' })).toHaveClass('bg-hover')
    expect(screen.getByRole('option', { name: 'Grape' })).not.toHaveClass('bg-hover')
  })
})

describe('Select — searchable', () => {
  it('filters the option list as the search query changes', async () => {
    const user = userEvent.setup()
    render(<Select options={fruitOptions} value="" onChange={() => {}} searchable />)
    await user.click(screen.getByRole('combobox'))
    await user.type(screen.getByPlaceholderText('Search…'), 'ch')
    expect(screen.getByRole('option', { name: 'Cherry' })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'Apple' })).not.toBeInTheDocument()
  })

  it('shows a no-matches message when the filter matches nothing', async () => {
    const user = userEvent.setup()
    render(<Select options={fruitOptions} value="" onChange={() => {}} searchable />)
    await user.click(screen.getByRole('combobox'))
    await user.type(screen.getByPlaceholderText('Search…'), 'zzz')
    expect(screen.getByText('No matches')).toBeInTheDocument()
  })

  it('allows a literal space in the search box instead of selecting', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Select options={fruitOptions} value="" onChange={onChange} searchable />)
    await user.click(screen.getByRole('combobox'))
    await user.type(screen.getByPlaceholderText('Search…'), 'a p')
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByPlaceholderText('Search…')).toHaveValue('a p')
  })
})

describe('Select — clearable', () => {
  it('calls onClear and does not open the menu or change value when clear is clicked', () => {
    const onClear = vi.fn()
    const onChange = vi.fn()
    const { container } = render(
      <Select options={fruitOptions} value="apple" onChange={onChange} clearable onClear={onClear} />
    )
    const clearAffordance = container.querySelector('[role="presentation"]')!
    fireEvent.click(clearAffordance)
    expect(onClear).toHaveBeenCalledTimes(1)
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByRole('combobox')).toHaveAttribute('aria-expanded', 'false')
  })

  it('does not render the clear affordance when nothing is selected', () => {
    const { container } = render(
      <Select options={fruitOptions} value="" onChange={() => {}} clearable onClear={() => {}} />
    )
    expect(container.querySelector('[role="presentation"]')).not.toBeInTheDocument()
  })
})

describe('Select — groups', () => {
  it('renders a group header alongside its options', async () => {
    const user = userEvent.setup()
    const grouped: SelectItem[] = [
      { label: 'Fruits', options: [{ value: 'apple', label: 'Apple' }] },
      { value: 'carrot', label: 'Carrot' },
    ]
    render(<Select options={grouped} value="" onChange={() => {}} />)
    await user.click(screen.getByRole('combobox'))
    expect(screen.getByText('Fruits')).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Apple' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Carrot' })).toBeInTheDocument()
  })
})
