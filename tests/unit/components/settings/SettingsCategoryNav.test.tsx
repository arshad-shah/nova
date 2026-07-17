import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SettingsCategoryNav } from '../../../../src/renderer/src/components/settings/SettingsCategoryNav'
import { SETTINGS_CATEGORY } from '../../../../src/renderer/src/lib/settings-categories'

let activeCategory = SETTINGS_CATEGORY.GENERAL
const mockSetActive = vi.fn((id: string) => { activeCategory = id })

vi.mock('../../../../src/renderer/src/stores/ui', () => ({
  useUiStore: (selector: any) => selector({ activeSettingsCategory: activeCategory, setActiveSettingsCategory: mockSetActive }),
}))

let invokeImpl: (channel: string) => unknown
const mockInvoke = vi.fn((channel: string) => Promise.resolve(invokeImpl(channel)))
const mockOn = vi.fn().mockReturnValue(vi.fn())

function setupIpc(pluginList: { name: string; status: { state: string } }[] = []) {
  invokeImpl = (channel: string) => (channel === 'plugins:list' ? pluginList : undefined)
}

describe('SettingsCategoryNav', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    activeCategory = SETTINGS_CATEGORY.GENERAL
    Object.defineProperty(window, 'electronAPI', { value: { invoke: mockInvoke, on: mockOn }, writable: true, configurable: true })
    setupIpc([])
  })

  it('hides a plugin-owned category (AI) until its owning plugin reports active', async () => {
    render(<SettingsCategoryNav />)
    // No active plugins yet ⇒ AI (ownedBy verql-plugin-ai) stays hidden.
    await waitFor(() => expect(mockInvoke).toHaveBeenCalledWith('plugins:list'))
    expect(screen.queryByText('AI')).toBeNull()
    expect(screen.getByText('General')).toBeInTheDocument()
  })

  it('reveals the AI category once its plugin is reported active', async () => {
    setupIpc([{ name: 'verql-plugin-ai', status: { state: 'active' } }])
    render(<SettingsCategoryNav />)
    expect(await screen.findByText('AI')).toBeInTheDocument()
  })

  it('also reveals it for a "degraded" (not just "active") plugin state', async () => {
    setupIpc([{ name: 'verql-plugin-ai', status: { state: 'degraded' } }])
    render(<SettingsCategoryNav />)
    expect(await screen.findByText('AI')).toBeInTheDocument()
  })

  it('falls back to showing every un-owned category if the plugin list IPC call fails', async () => {
    mockInvoke.mockRejectedValueOnce(new Error('ipc down'))
    render(<SettingsCategoryNav />)
    await waitFor(() => expect(screen.getByText('General')).toBeInTheDocument())
    expect(screen.queryByText('AI')).toBeNull() // still hidden — no plugin reported active
  })

  it('clicking a category button sets it active', async () => {
    const user = userEvent.setup()
    render(<SettingsCategoryNav />)
    await user.click(screen.getByText('Editor'))
    expect(mockSetActive).toHaveBeenCalledWith(SETTINGS_CATEGORY.EDITOR)
  })

  it('respects a caller-supplied filtered category list (the settings search box) instead of the full catalogue', () => {
    render(<SettingsCategoryNav categories={[{ id: SETTINGS_CATEGORY.GENERAL, label: 'General' }]} />)
    expect(screen.getByText('General')).toBeInTheDocument()
    expect(screen.queryByText('Editor')).toBeNull()
  })

  it('intersects a filtered list with plugin-ownership rules — a filtered-in but plugin-owned-and-inactive category still hides', () => {
    render(<SettingsCategoryNav categories={[{ id: SETTINGS_CATEGORY.AI, label: 'AI', ownedBy: 'verql-plugin-ai' }]} />)
    expect(screen.queryByText('AI')).toBeNull()
  })
})
