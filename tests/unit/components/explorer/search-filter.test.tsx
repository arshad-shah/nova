import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SearchFilter } from '../../../../src/renderer/src/components/explorer/SearchFilter'

/**
 * Behavioural tests for `SearchFilter` — the schema-explorer search box.
 * Covers the debounced commit to the store (typing fast shouldn't spam
 * `setFilterText`), the clear button resetting local state immediately (no
 * debounce) and refocusing, and the reset-on-connection-change effect that
 * stops a stale filter leaking into a newly selected connection's tree.
 */

let filterText = ''
const mockSetFilterText = vi.fn((v: string) => { filterText = v })
vi.mock('../../../../src/renderer/src/stores/schema', () => ({
  useSchemaStore: (selector: (s: { filterText: string; setFilterText: (v: string) => void }) => unknown) =>
    selector({ filterText, setFilterText: mockSetFilterText }),
}))

let activeConnectionId: string | null = 'conn-1'
vi.mock('../../../../src/renderer/src/stores/connections', () => ({
  useConnectionsStore: (selector: (s: { activeConnectionId: string | null }) => unknown) =>
    selector({ activeConnectionId }),
}))

vi.mock('../../../../src/renderer/src/hooks/useDataNouns', () => ({
  useDataNouns: () => ({ object: { one: 'table', many: 'tables' }, field: { one: 'column', many: 'columns' }, record: { one: 'row', many: 'rows' } }),
}))

beforeEach(() => {
  vi.clearAllMocks()
  filterText = ''
  activeConnectionId = 'conn-1'
  vi.useFakeTimers({ shouldAdvanceTime: true })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('SearchFilter', () => {
  it('debounces committing keystrokes to the store instead of calling setFilterText per character', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<SearchFilter />)
    // The mount effect itself calls setFilterText('') once — clear that before typing.
    mockSetFilterText.mockClear()

    await user.type(screen.getByRole('textbox'), 'use')
    // Not committed yet as one call per keystroke — still within the debounce window.
    expect(mockSetFilterText.mock.calls.length).toBeLessThan(3)

    await vi.advanceTimersByTimeAsync(100)
    expect(mockSetFilterText).toHaveBeenLastCalledWith('use')
  })

  it('clears immediately (no debounce) and refocuses the input', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<SearchFilter />)
    const input = screen.getByRole('textbox') as HTMLInputElement

    await user.type(input, 'orders')
    expect(input.value).toBe('orders')
    mockSetFilterText.mockClear()

    const clearButton = screen.getByRole('button')
    await user.click(clearButton)

    expect(input.value).toBe('')
    expect(mockSetFilterText).toHaveBeenCalledWith('')
    expect(input).toHaveFocus()
  })

  it('resets the filter when the active connection changes', () => {
    const { rerender } = render(<SearchFilter />)
    mockSetFilterText.mockClear()

    activeConnectionId = 'conn-2'
    rerender(<SearchFilter />)

    expect(mockSetFilterText).toHaveBeenCalledWith('')
  })

  it('shows the result count badge once a debounced filter commits and a count is given', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const { rerender } = render(<SearchFilter resultCount={3} />)

    await user.type(screen.getByRole('textbox'), 'ord')
    await vi.advanceTimersByTimeAsync(100)
    // The mocked store is not reactive — re-render to observe the committed value.
    rerender(<SearchFilter resultCount={3} />)

    expect(screen.getByText('3')).toBeInTheDocument()
  })

  it('shows no result count badge while the filter is empty even if resultCount is given', () => {
    render(<SearchFilter resultCount={3} />)
    expect(screen.queryByText('3')).not.toBeInTheDocument()
  })
})
