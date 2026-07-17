import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DataDisplaySettings } from '../../../../src/renderer/src/components/settings/categories/DataDisplaySettings'

const display = {
  nullDisplay: 'NULL', dateFormat: 'iso', customDateFormat: '', booleanDisplay: 'true_false',
  numberFormat: 'raw', maxColumnWidth: 300, truncateTextAt: 500,
}
const mockSet = vi.fn()
const mockResetCategory = vi.fn()

vi.mock('../../../../src/renderer/src/stores/settings', () => ({
  useSettingsStore: (selector: any) => selector({ settings: { dataDisplay: display }, set: mockSet, resetCategory: mockResetCategory }),
}))

vi.mock('../../../../src/renderer/src/components/settings/PluginContributedSettings', () => ({
  PluginContributedSettings: () => null,
}))

describe('DataDisplaySettings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    display.dateFormat = 'iso'
  })

  it('hides the custom date-pattern field when dateFormat is not "custom"', () => {
    display.dateFormat = 'iso'
    render(<DataDisplaySettings />)
    expect(screen.queryByLabelText('Custom Date Pattern')).toBeNull()
  })

  it('reveals the custom date-pattern field only when dateFormat is "custom"', () => {
    display.dateFormat = 'custom'
    render(<DataDisplaySettings />)
    expect(screen.getByLabelText('Custom Date Pattern')).toBeInTheDocument()
  })

  it('editing the null-display text field writes the raw string through', async () => {
    const user = userEvent.setup()
    render(<DataDisplaySettings />)
    const input = screen.getByDisplayValue('NULL')
    await user.type(input, 'X')
    expect(mockSet).toHaveBeenCalledWith('dataDisplay.nullDisplay', 'NULLX')
  })

  it('"Reset to Defaults" resets only the dataDisplay category', async () => {
    const user = userEvent.setup()
    render(<DataDisplaySettings />)
    await user.click(screen.getByRole('button', { name: 'Reset to Defaults' }))
    expect(mockResetCategory).toHaveBeenCalledWith('dataDisplay')
  })
})
