import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConnectionListItem } from '../../../../src/renderer/src/components/connections/ConnectionListItem'
import type { ConnectionProfile } from '../../../../shared/types'

const base: ConnectionProfile = {
  id: 'c-1',
  name: 'prod-orders',
  type: 'postgresql',
  host: 'db.prod.internal',
  port: 5432,
  database: 'orders',
  username: 'app_reader',
  password: '',
  color: '#7c6ff7',
}

function renderItem(overrides: Partial<React.ComponentProps<typeof ConnectionListItem>> = {}) {
  const onActivate = vi.fn()
  const onEdit = vi.fn()
  const onConnect = vi.fn()
  const onDisconnect = vi.fn()
  const onOpenQueryTab = vi.fn()
  const onDelete = vi.fn()
  const utils = render(
    <ConnectionListItem
      connection={base}
      connected
      active={false}
      onActivate={onActivate}
      onEdit={onEdit}
      onConnect={onConnect}
      onDisconnect={onDisconnect}
      onOpenQueryTab={onOpenQueryTab}
      onDelete={onDelete}
      {...overrides}
    />
  )
  return { ...utils, onActivate, onEdit, onConnect, onDisconnect, onOpenQueryTab, onDelete }
}

async function openMenu(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'More actions' }))
  return screen.findByRole('menu')
}

describe('ConnectionListItem', () => {
  it('clicking the row activates the connection', async () => {
    const user = userEvent.setup()
    const { onActivate } = renderItem()
    // Clicking the visible name text, not just some wrapper div, exercises the
    // real row surface a user would click.
    await user.click(screen.getByText('prod-orders'))
    expect(onActivate).toHaveBeenCalledTimes(1)
  })

  it('clicking the overflow trigger does not also activate the row (stopPropagation)', async () => {
    const user = userEvent.setup()
    const { onActivate } = renderItem()
    await openMenu(user)
    expect(onActivate).not.toHaveBeenCalled()
  })

  it('shows Disconnect and Open query tab when connected, and Connect is absent', async () => {
    const user = userEvent.setup()
    renderItem({ connected: true })
    const menu = await openMenu(user)
    expect(within(menu).getByRole('menuitem', { name: 'Disconnect' })).toBeInTheDocument()
    expect(within(menu).getByRole('menuitem', { name: 'Open query tab' })).toBeInTheDocument()
    expect(within(menu).queryByRole('menuitem', { name: 'Connect' })).toBeNull()
  })

  it('shows Connect and hides Open query tab when disconnected', async () => {
    const user = userEvent.setup()
    renderItem({ connected: false })
    const menu = await openMenu(user)
    expect(within(menu).getByRole('menuitem', { name: 'Connect' })).toBeInTheDocument()
    expect(within(menu).queryByRole('menuitem', { name: 'Open query tab' })).toBeNull()
    expect(within(menu).queryByRole('menuitem', { name: 'Disconnect' })).toBeNull()
  })

  it('selecting Delete from the menu calls onDelete, not onActivate', async () => {
    const user = userEvent.setup()
    const { onDelete, onActivate } = renderItem()
    const menu = await openMenu(user)
    await user.click(within(menu).getByRole('menuitem', { name: 'Delete connection…' }))
    expect(onDelete).toHaveBeenCalledTimes(1)
    expect(onActivate).not.toHaveBeenCalled()
  })

  it('shows the "Live" badge only when connected but not the active connection', () => {
    renderItem({ connected: true, active: false })
    expect(screen.getByText('Live')).toBeInTheDocument()
    expect(screen.queryByText('Active')).toBeNull()
  })

  it('shows the "Active" badge (not "Live") for the active connection', () => {
    renderItem({ connected: true, active: true })
    expect(screen.getByText('Active')).toBeInTheDocument()
    expect(screen.queryByText('Live')).toBeNull()
  })

  it('shows neither badge for a disconnected, non-active connection', () => {
    renderItem({ connected: false, active: false })
    expect(screen.queryByText('Live')).toBeNull()
    expect(screen.queryByText('Active')).toBeNull()
  })

  it('builds the summary line from username/host/port/database, omitting missing pieces', () => {
    renderItem({
      connection: { ...base, host: undefined, port: undefined, username: undefined, database: 'orders' },
    })
    // No "@", no ":", just a leading "/" plus the bare database name.
    expect(screen.getByText('/orders')).toBeInTheDocument()
  })

  // BUG: `describe()` in ConnectionListItem.tsx unconditionally prepends "/"
  // to `database` (`` `/${c.database}` ``). For file-backed drivers (SQLite)
  // the stored "database" is already an absolute path, so the summary line
  // renders a doubled leading slash — cosmetic, but visible on every SQLite
  // row (also present in the FileBackedSqlite story fixture). Documenting
  // current behaviour, not fixing it here.
  it('BUG: doubles the leading slash when database is already an absolute path (SQLite)', () => {
    renderItem({
      connection: { ...base, type: 'sqlite', host: undefined, port: undefined, username: undefined, database: '/Users/me/local-dev.db' },
    })
    expect(screen.getByText('//Users/me/local-dev.db')).toBeInTheDocument()
  })

  it('omits the summary line entirely when every describable field is empty', () => {
    renderItem({
      connection: { ...base, host: undefined, port: undefined, username: undefined, database: undefined },
    })
    expect(screen.queryByText(/@|:/)).toBeNull()
    // A stray "/undefined" (an unguarded `database` interpolation) would still
    // pass the assertion above, since it contains neither "@" nor ":" — assert
    // no summary text renders at all, not just that it lacks those two chars.
    expect(screen.queryByText((_, el) => (el?.textContent ?? '').startsWith('/'))).toBeNull()
  })

  it('falls back to the first two letters uppercased for an unrecognized engine', () => {
    renderItem({ connection: { ...base, type: 'duckdb' as ConnectionProfile['type'] } })
    expect(screen.getByText('DU')).toBeInTheDocument()
  })

  it('uses the known two-letter chip for a recognized engine', () => {
    renderItem({ connection: { ...base, type: 'postgresql' } })
    expect(screen.getByText('PG')).toBeInTheDocument()
  })
})
