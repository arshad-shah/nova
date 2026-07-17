import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AISettings } from '../../../../src/renderer/src/components/settings/categories/AISettings'

const aiSettings = { openaiKey: '', anthropicKey: '', ollamaEndpoint: '' }
const mockSet = vi.fn().mockResolvedValue(undefined)
const mockResetCategory = vi.fn()

vi.mock('../../../../src/renderer/src/stores/settings', () => ({
  useSettingsStore: (selector: any) => selector({ settings: { ai: aiSettings }, set: mockSet, resetCategory: mockResetCategory }),
}))

let invokeImpl: (channel: string, ...args: unknown[]) => unknown
const mockInvoke = vi.fn((channel: string, ...args: unknown[]) => Promise.resolve(invokeImpl(channel, ...args)))

function setupIpc(overrides: Partial<Record<string, (...args: unknown[]) => unknown>> = {}) {
  const base: Record<string, (...args: unknown[]) => unknown> = {
    'ai:keys:has': () => false,
    'plugins:get-categorized-settings': () => [],
    ...overrides,
  }
  invokeImpl = (channel, ...args) => base[channel]?.(...args)
}

describe('AISettings — ApiKeyField', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.defineProperty(window, 'electronAPI', { value: { invoke: mockInvoke, on: vi.fn().mockReturnValue(vi.fn()) }, writable: true, configurable: true })
    setupIpc()
  })

  it('Save is disabled until the user types a draft key', async () => {
    render(<AISettings />)
    const [save] = await screen.findAllByRole('button', { name: 'Save' })
    expect(save).toBeDisabled()

    const user = userEvent.setup()
    await user.type(screen.getAllByLabelText('OpenAI API Key input')[0], 'sk-abc')
    expect(save).not.toBeDisabled()
  })

  it('after AI_KEYS_HAS resolves true, the placeholder indicates a saved key and the button reads "Replace"', async () => {
    setupIpc({ 'ai:keys:has': (provider: unknown) => provider === 'openai' })
    render(<AISettings />)
    const input = await screen.findByLabelText('OpenAI API Key input') as HTMLInputElement
    expect(input.placeholder).toBe('••••••••  (saved)')
    expect(await screen.findByRole('button', { name: 'Replace' })).toBeInTheDocument()
  })

  it('saving persists the draft via ai:keys:set and clears the field afterward (never leaves the secret sitting in the input)', async () => {
    const setKey = vi.fn()
    setupIpc({ 'ai:keys:set': setKey })
    const user = userEvent.setup()
    render(<AISettings />)
    const input = await screen.findByLabelText('OpenAI API Key input') as HTMLInputElement
    await user.type(input, 'sk-secret-value')
    await user.click(screen.getAllByRole('button', { name: 'Save' })[0])

    expect(setKey).toHaveBeenCalledWith('openai', 'sk-secret-value')
    await waitFor(() => expect(input.value).toBe(''))
  })

  it('clearing an existing key calls ai:keys:set with an empty string and reverts the button back to "Save"', async () => {
    const setKey = vi.fn()
    setupIpc({ 'ai:keys:has': () => true, 'ai:keys:set': setKey })
    const user = userEvent.setup()
    render(<AISettings />)
    // Both providers report hasKey=true, so both start on "Replace"/"Clear".
    await waitFor(() => expect(screen.getAllByRole('button', { name: 'Replace' })).toHaveLength(2))
    const [clearBtn] = screen.getAllByRole('button', { name: 'Clear' })
    await user.click(clearBtn) // clears the OpenAI (first) field only

    expect(setKey).toHaveBeenCalledWith('openai', '')
    // Anthropic's row is untouched — exactly one "Replace" remains.
    await waitFor(() => expect(screen.getAllByRole('button', { name: 'Replace' })).toHaveLength(1))
  })

  it('the OpenAI and Anthropic fields are independent — checking one provider does not report the other as saved', async () => {
    setupIpc({ 'ai:keys:has': (provider: unknown) => provider === 'anthropic' })
    render(<AISettings />)
    await screen.findByLabelText('Anthropic API Key input')
    const openaiInput = screen.getByLabelText('OpenAI API Key input') as HTMLInputElement
    const anthropicInput = screen.getByLabelText('Anthropic API Key input') as HTMLInputElement
    expect(openaiInput.placeholder).toBe('sk-...')
    await waitFor(() => expect(anthropicInput.placeholder).toBe('••••••••  (saved)'))
  })

  it('editing the Ollama endpoint calls setSetting with the raw value', async () => {
    const user = userEvent.setup()
    render(<AISettings />)
    const input = await screen.findByLabelText('Ollama endpoint')
    await user.type(input, 'x')
    expect(mockSet).toHaveBeenCalledWith('ai.ollamaEndpoint', 'x')
  })

  it('"Reset to defaults" resets only the ai category', async () => {
    const user = userEvent.setup()
    render(<AISettings />)
    await user.click(screen.getByRole('button', { name: 'Reset to Defaults' }))
    expect(mockResetCategory).toHaveBeenCalledWith('ai')
  })
})
