import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PluginFieldInput } from '../../../../src/renderer/src/components/connections/form/PluginFieldInput'
import type { PluginField, AuthStatus } from '../../../../src/renderer/src/components/connections/form/types'

function renderField(field: PluginField, opts: {
  value?: unknown
  authStatus?: AuthStatus
  fetchableOptions?: Record<string, string[]>
} = {}) {
  const onChange = vi.fn()
  render(
    <PluginFieldInput
      field={field}
      value={opts.value}
      onChange={onChange}
      authStatus={opts.authStatus ?? 'idle'}
      fetchableOptions={opts.fetchableOptions ?? {}}
    />
  )
  return { onChange }
}

describe('PluginFieldInput', () => {
  it('a fetchable select before authentication renders a disabled placeholder input, not a picker', () => {
    renderField({ key: 'warehouse', label: 'Warehouse', type: 'select', fetchable: true }, { authStatus: 'idle' })
    const input = screen.getByLabelText('Warehouse') as HTMLInputElement
    expect(input).toBeDisabled()
    expect(input.placeholder).toBe('Authenticate first')
  })

  it('a fetchable select after authentication with options renders a real picker populated from fetchableOptions', () => {
    renderField(
      { key: 'warehouse', label: 'Warehouse', type: 'select', fetchable: true },
      { authStatus: 'authenticated', fetchableOptions: { warehouse: ['WH_A', 'WH_B'] } }
    )
    expect(screen.getByRole('combobox', { name: 'Warehouse' })).toBeInTheDocument()
    expect(screen.queryByRole('textbox')).toBeNull()
  })

  it('a fetchable select authenticated but with an empty option list still falls back to a (now-enabled) text input', () => {
    renderField(
      { key: 'warehouse', label: 'Warehouse', type: 'select', fetchable: true },
      { authStatus: 'authenticated', fetchableOptions: { warehouse: [] } }
    )
    const input = screen.getByLabelText('Warehouse') as HTMLInputElement
    expect(input).not.toBeDisabled()
    expect(input.placeholder).toBe('Type a value')
  })

  it('a non-fetchable select with static options renders a picker directly, no auth gate', () => {
    renderField({
      key: 'sslmode', label: 'SSL Mode', type: 'select',
      options: [{ value: 'require', label: 'Require' }, { value: 'disable', label: 'Disable' }],
    })
    expect(screen.getByRole('combobox', { name: 'SSL Mode' })).toBeInTheDocument()
  })

  it('a password field renders masked input and forwards typed text via onChange', async () => {
    const user = userEvent.setup()
    const { onChange } = renderField({ key: 'password', label: 'Password', type: 'password' })
    const input = screen.getByLabelText('Password') as HTMLInputElement
    expect(input.type).toBe('password')
    await user.type(input, 'x')
    expect(onChange).toHaveBeenCalledWith('x')
  })

  it('a number field coerces a non-numeric stored value down to 0 rather than rendering NaN', () => {
    renderField({ key: 'port', label: 'Port', type: 'number' }, { value: 'not-a-number' })
    expect(screen.getByLabelText('Port')).toHaveAttribute('aria-valuenow', '0')
  })

  it('a number field renders the real numeric stored value', () => {
    renderField({ key: 'port', label: 'Port', type: 'number' }, { value: 5432 })
    expect(screen.getByLabelText('Port')).toHaveAttribute('aria-valuenow', '5432')
  })

  it('falls back to field.default when no value has been set yet', () => {
    renderField({ key: 'port', label: 'Port', type: 'text', default: 'localhost' })
    expect(screen.getByLabelText('Port')).toHaveValue('localhost')
  })

  it('a required plain-text field marks the underlying input required', () => {
    renderField({ key: 'database', label: 'Database', type: 'text', required: true })
    expect(screen.getByLabelText('Database')).toBeRequired()
  })

  it('a file-path field renders the file-path picker (Browse button), not the file-content textarea', () => {
    renderField({ key: 'dbFile', label: 'Database File', type: 'file-path' })
    expect(screen.getByRole('button', { name: 'Browse' })).toBeInTheDocument()
    expect(screen.queryByRole('textbox')).toBeNull()
  })
})
