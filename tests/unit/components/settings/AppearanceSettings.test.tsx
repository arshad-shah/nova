import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AppearanceSettings } from '../../../../src/renderer/src/components/settings/categories/AppearanceSettings'

const appearance = {
  uiDensity: 'comfortable', sidebarPosition: 'left', accentColor: '',
  showStatusBar: true, showSecondarySidebar: true, showBottomDock: true, animations: true,
}
const mockSet = vi.fn()
const mockResetCategory = vi.fn()

vi.mock('../../../../src/renderer/src/stores/settings', () => ({
  useSettingsStore: (selector: any) => selector({ settings: { appearance }, set: mockSet, resetCategory: mockResetCategory }),
}))

const mockSetTheme = vi.fn()
const mockSetMode = vi.fn()
let themeCtx = { theme: 'ion', setTheme: mockSetTheme, mode: 'dark' as const, setMode: mockSetMode, themes: ['ion'] }

vi.mock('../../../../src/renderer/src/primitives/theme/ThemeProvider', () => ({
  useTheme: () => themeCtx,
  ThemeProvider: ({ children }: { children: React.ReactNode }) => children,
}))

const THEMES = [
  { id: 'ion', name: 'Ion', type: 'dark', preview: { bg: '#000', sidebar: '#111', text: '#fff', accent: '#7A5CFF' } },
  { id: 'broken-plugin-theme', name: 'Broken', type: 'dark', validation: { ok: false, missingRequired: ['--color-accent'], missingRecommended: [] } },
  { id: 'lab', name: 'Lab', type: 'light', preview: { bg: '#fff', sidebar: '#eee', text: '#000', accent: '#333' } },
]

vi.mock('../../../../src/renderer/src/stores/themes', () => ({
  useThemesStore: (selector: any) => selector({ themes: THEMES }),
}))

vi.mock('../../../../src/renderer/src/components/settings/PluginContributedSettings', () => ({
  PluginContributedSettings: () => null,
}))

describe('AppearanceSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('clicking a selectable theme tile calls setTheme with its id', async () => {
    const user = userEvent.setup()
    render(<AppearanceSettings />)
    await user.click(screen.getByText('Lab'))
    expect(mockSetTheme).toHaveBeenCalledWith('lab')
  })

  it('a theme with missing required tokens renders disabled and clicking it is a no-op', async () => {
    const user = userEvent.setup()
    render(<AppearanceSettings />)
    const brokenTile = screen.getByText('Broken').closest('button')!
    expect(brokenTile).toBeDisabled()
    await user.click(brokenTile)
    expect(mockSetTheme).not.toHaveBeenCalled()
  })

  it('a selectable theme tile is not disabled', () => {
    render(<AppearanceSettings />)
    expect(screen.getByText('Ion').closest('button')).not.toBeDisabled()
  })

  it('clicking a mode option calls setMode', async () => {
    const user = userEvent.setup()
    render(<AppearanceSettings />)
    await user.click(screen.getByText('Light'))
    expect(mockSetMode).toHaveBeenCalledWith('light')
  })

  it('shows the system-preference hint only in "system" mode', () => {
    themeCtx = { ...themeCtx, mode: 'system' }
    render(<AppearanceSettings />)
    expect(screen.getByText(/Following the OS/i)).toBeInTheDocument()
  })

  it('hides the system-preference hint in a fixed mode', () => {
    themeCtx = { ...themeCtx, mode: 'dark' }
    render(<AppearanceSettings />)
    expect(screen.queryByText(/Following the OS/i)).toBeNull()
  })

  it('shows a "use theme default" reset button only when a custom accent is set', () => {
    appearance.accentColor = '#ff0000'
    render(<AppearanceSettings />)
    expect(screen.getByRole('button', { name: 'Use theme default' })).toBeInTheDocument()
    appearance.accentColor = ''
  })

  it('hides the accent reset button when no custom accent is set', () => {
    appearance.accentColor = ''
    render(<AppearanceSettings />)
    expect(screen.queryByRole('button', { name: 'Use theme default' })).toBeNull()
  })

  it('clicking "use theme default" clears the accent color setting', async () => {
    appearance.accentColor = '#ff0000'
    const user = userEvent.setup()
    render(<AppearanceSettings />)
    await user.click(screen.getByRole('button', { name: 'Use theme default' }))
    expect(mockSet).toHaveBeenCalledWith('appearance.accentColor', '')
    appearance.accentColor = ''
  })

  it('toggling the status bar switch writes the boolean straight through', async () => {
    const user = userEvent.setup()
    render(<AppearanceSettings />)
    await user.click(screen.getByRole('switch', { name: 'Show status bar' }))
    expect(mockSet).toHaveBeenCalledWith('appearance.showStatusBar', false)
  })

  it('"Reset to Defaults" resets only the appearance category', async () => {
    const user = userEvent.setup()
    render(<AppearanceSettings />)
    await user.click(screen.getByRole('button', { name: 'Reset to Defaults' }))
    expect(mockResetCategory).toHaveBeenCalledWith('appearance')
  })
})
