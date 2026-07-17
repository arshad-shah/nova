import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FetchableFieldsWizard } from '../../../../src/renderer/src/components/connections/form/FetchableFieldsWizard'
import type { PluginField, AuthStatus } from '../../../../src/renderer/src/components/connections/form/types'

const fields: PluginField[] = [
  { key: 'role', label: 'Role', type: 'select', fetchable: true, step: 1 },
  { key: 'warehouse', label: 'Warehouse', type: 'select', fetchable: true, step: 1 },
  { key: 'database', label: 'Database', type: 'select', fetchable: true, step: 2 },
]

function renderWizard(overrides: Partial<React.ComponentProps<typeof FetchableFieldsWizard>> = {}) {
  const onAuthenticate = vi.fn()
  const onStepComplete = vi.fn()
  const onFieldChange = vi.fn()
  const utils = render(
    <FetchableFieldsWizard
      fetchableFields={fields}
      profile={{}}
      fetchableOptions={{}}
      authStatus="idle"
      authError=""
      completedSteps={new Set()}
      onAuthenticate={onAuthenticate}
      onStepComplete={onStepComplete}
      onFieldChange={onFieldChange}
      {...overrides}
    />
  )
  return { ...utils, onAuthenticate, onStepComplete, onFieldChange }
}

describe('FetchableFieldsWizard', () => {
  it('before authenticating, only step 1 fields are visible (later steps are collapsed/inert)', () => {
    renderWizard({ authStatus: 'idle' })
    expect(screen.queryByLabelText('Role')).toBeNull()
    expect(screen.queryByLabelText('Database')).toBeNull()
  })

  it('clicking Authenticate calls the handler', async () => {
    const user = userEvent.setup()
    const { onAuthenticate } = renderWizard({ authStatus: 'idle' })
    await user.click(screen.getByRole('button', { name: 'Authenticate' }))
    expect(onAuthenticate).toHaveBeenCalledTimes(1)
  })

  it('while authenticating, the button is disabled and shows the in-progress label', () => {
    renderWizard({ authStatus: 'authenticating' })
    expect(screen.getByRole('button', { name: /Authenticating/ })).toBeDisabled()
  })

  it('shows the auth error text only when authStatus is "error"', () => {
    renderWizard({ authStatus: 'error', authError: 'invalid credentials' })
    expect(screen.getByText('invalid credentials')).toBeInTheDocument()
  })

  it('after authenticating with no steps completed, step 1 fields become visible and step 2 does not', () => {
    renderWizard({ authStatus: 'authenticated' })
    expect(screen.getByLabelText('Role')).toBeInTheDocument()
    expect(screen.getByLabelText('Warehouse')).toBeInTheDocument()
    expect(screen.queryByLabelText('Database')).toBeNull()
  })

  it('completing step 1 reveals step 2 and hides step 1\'s Continue button', () => {
    renderWizard({ authStatus: 'authenticated', completedSteps: new Set([1]) })
    expect(screen.getByLabelText('Database')).toBeInTheDocument()
    // Step 1 is now "completed" (shown, but its own Continue is gone); only
    // step 2 (the active one) offers a Continue.
    expect(screen.getAllByRole('button', { name: 'Continue' })).toHaveLength(1)
  })

  it('clicking Continue reports the step number that was completed', async () => {
    const user = userEvent.setup()
    const { onStepComplete } = renderWizard({ authStatus: 'authenticated' })
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    expect(onStepComplete).toHaveBeenCalledWith(1)
  })

  it('once every step is completed, no Continue button remains', () => {
    renderWizard({ authStatus: 'authenticated', completedSteps: new Set([1, 2]) })
    expect(screen.queryByRole('button', { name: 'Continue' })).toBeNull()
  })

  it('re-authenticate is offered once already authenticated, instead of the initial Authenticate button', async () => {
    const user = userEvent.setup()
    const { onAuthenticate } = renderWizard({ authStatus: 'authenticated' })
    expect(screen.queryByRole('button', { name: 'Authenticate' })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Re-authenticate' }))
    expect(onAuthenticate).toHaveBeenCalledTimes(1)
  })

  it('field changes route through onFieldChange with the field key', async () => {
    const { onFieldChange } = renderWizard({
      authStatus: 'authenticated',
      fetchableOptions: { role: ['ADMIN', 'READER'] },
    })
    const user = userEvent.setup()
    await user.click(screen.getByRole('combobox', { name: 'Role' }))
    await user.click(await screen.findByRole('option', { name: 'READER' }))
    expect(onFieldChange).toHaveBeenCalledWith('role', 'READER')
  })
})
