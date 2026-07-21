import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { NotificationBell } from '@/components/shell/NotificationBell'
import { useNotificationsStore } from '@/stores/notifications'
import { useUiStore, SECONDARY_PANEL } from '@/stores/ui'

describe('NotificationBell', () => {
  beforeEach(() => {
    useNotificationsStore.setState({ notifications: [] })
    useUiStore.setState({ secondarySidebarVisible: false, secondaryActivePanel: SECONDARY_PANEL.INSPECTOR })
  })

  it('shows no badge count when there are no unread notifications', () => {
    render(<NotificationBell />)
    expect(screen.queryByText('0')).not.toBeInTheDocument()
  })

  it('shows the unread count as a badge', () => {
    useNotificationsStore.getState().addNotification({ type: 'info', title: 'a' })
    useNotificationsStore.getState().addNotification({ type: 'info', title: 'b' })
    render(<NotificationBell />)
    expect(screen.getByText('2')).toBeInTheDocument()
  })

  it('clicking the bell opens the notifications panel in the secondary sidebar', () => {
    render(<NotificationBell />)
    fireEvent.click(screen.getByRole('button'))
    expect(useUiStore.getState().secondaryActivePanel).toBe(SECONDARY_PANEL.NOTIFICATIONS)
    expect(useUiStore.getState().secondarySidebarVisible).toBe(true)
  })

  it('clicking the bell again while the panel is already active hides the sidebar (toggle-off)', () => {
    useUiStore.setState({ secondarySidebarVisible: true, secondaryActivePanel: SECONDARY_PANEL.NOTIFICATIONS })
    render(<NotificationBell />)
    fireEvent.click(screen.getByRole('button'))
    expect(useUiStore.getState().secondarySidebarVisible).toBe(false)
  })

  it('is not marked active when the matching panel id is set but the sidebar is hidden', () => {
    useUiStore.setState({ secondarySidebarVisible: false, secondaryActivePanel: SECONDARY_PANEL.NOTIFICATIONS })
    render(<NotificationBell />)
    expect(screen.getByRole('button')).not.toHaveAttribute('data-active')
  })

  it('is marked active only once both the sidebar is visible and its panel is showing', () => {
    useUiStore.setState({ secondarySidebarVisible: true, secondaryActivePanel: SECONDARY_PANEL.NOTIFICATIONS })
    render(<NotificationBell />)
    expect(screen.getByRole('button')).toHaveAttribute('data-active', 'true')
  })
})
