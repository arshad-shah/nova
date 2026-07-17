import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { ConnectionSegment } from '@/components/shell/status-bar/ConnectionSegment'
import { useConnectionsStore } from '@/stores/connections'
import type { ConnectionProfile } from '@shared/types'

const PROFILE: ConnectionProfile = {
  id: 'c1', name: 'Prod DB', type: 'postgresql', database: 'app',
}

describe('ConnectionSegment', () => {
  beforeEach(() => {
    useConnectionsStore.setState({ connections: [], activeConnectionId: null, connectedIds: new Set() })
  })

  it('shows "No connection" when nothing is active', () => {
    render(<ConnectionSegment onNewConnection={() => {}} />)
    expect(screen.getByText('No connection')).toBeInTheDocument()
  })

  it('shows the active profile name and driver abbreviation once connected', () => {
    useConnectionsStore.setState({
      connections: [PROFILE],
      activeConnectionId: 'c1',
      connectedIds: new Set(['c1']),
    })
    render(<ConnectionSegment onNewConnection={() => {}} />)
    expect(screen.getByText('Prod DB')).toBeInTheDocument()
    expect(screen.getByText('PG')).toBeInTheDocument()
  })

  it('treats an active connection id that is not in connectedIds as disconnected', () => {
    // Active id is set (e.g. last-used) but the session isn't live.
    useConnectionsStore.setState({
      connections: [PROFILE],
      activeConnectionId: 'c1',
      connectedIds: new Set(),
    })
    render(<ConnectionSegment onNewConnection={() => {}} />)
    expect(screen.getByText('No connection')).toBeInTheDocument()
    expect(screen.queryByText('Prod DB')).not.toBeInTheDocument()
  })

  it('falls back to the first two letters, upper-cased, for a driver with no abbreviation entry', () => {
    useConnectionsStore.setState({
      connections: [{ ...PROFILE, type: 'snowflake' as ConnectionProfile['type'] }],
      activeConnectionId: 'c1',
      connectedIds: new Set(['c1']),
    })
    render(<ConnectionSegment onNewConnection={() => {}} />)
    expect(screen.getByText('SN')).toBeInTheDocument()
  })

  it('toggles the switcher panel open and closed on repeated clicks', () => {
    render(<ConnectionSegment onNewConnection={() => {}} />)
    const trigger = screen.getByRole('button', { name: 'Toggle connection switcher' })
    expect(trigger).toHaveAttribute('aria-expanded', 'false')

    fireEvent.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'true')

    fireEvent.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
  })

  it('opens the switcher in response to the global statusbar:open-switcher event', () => {
    render(<ConnectionSegment onNewConnection={() => {}} />)
    const trigger = screen.getByRole('button', { name: 'Toggle connection switcher' })
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    act(() => { window.dispatchEvent(new Event('statusbar:open-switcher')) })
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
  })

  it('removes the statusbar:open-switcher listener on unmount', () => {
    const removeSpy = vi.spyOn(window, 'removeEventListener')
    const { unmount } = render(<ConnectionSegment onNewConnection={() => {}} />)
    unmount()
    expect(removeSpy.mock.calls.map((c) => c[0])).toContain('statusbar:open-switcher')
  })
})
