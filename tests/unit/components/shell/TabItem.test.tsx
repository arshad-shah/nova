import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { TabItem } from '@/components/shell/tab-bar/TabItem'
import type { QueryTab } from '@shared/types'
import type { MenuNode } from '@/primitives/surfaces/menu/types'

function makeTab(overrides: Partial<QueryTab> = {}): QueryTab {
  return {
    id: 't1',
    type: 'query',
    title: 'Untitled Query',
    connectionId: null,
    database: null,
    schema: null,
    sql: '',
    results: null,
    isExecuting: false,
    error: null,
    isDirty: false,
    aiExplanation: null,
    ...overrides,
  }
}

function renderTabItem(props: Partial<React.ComponentProps<typeof TabItem>> = {}) {
  const onActivate = vi.fn()
  const onClose = vi.fn()
  const contextMenuItems: MenuNode[] = [
    { kind: 'item', id: 'close', label: 'Close', onSelect: onClose },
  ]
  const utils = render(
    <TabItem
      tab={makeTab()}
      index={0}
      isActive={false}
      isDragged={false}
      isDropTarget={false}
      contextMenuItems={contextMenuItems}
      onActivate={onActivate}
      onClose={onClose}
      onDragStart={() => {}}
      onDragOver={() => {}}
      onDragEnd={() => {}}
      {...props}
    />
  )
  return { ...utils, onActivate, onClose }
}

describe('TabItem', () => {
  it('activates the tab when clicked', () => {
    const { onActivate } = renderTabItem()
    fireEvent.click(screen.getByText('Untitled Query'))
    expect(onActivate).toHaveBeenCalledOnce()
  })

  it('middle-click (auxclick button 1) closes the tab without activating it', () => {
    const { onActivate, onClose } = renderTabItem()
    const row = screen.getByText('Untitled Query').closest('[data-tab-id]')!
    fireEvent(row, new MouseEvent('auxclick', { button: 1, bubbles: true, cancelable: true }))
    expect(onClose).toHaveBeenCalledOnce()
    expect(onActivate).not.toHaveBeenCalled()
  })

  it('right-click (button other than middle) does not close the tab', () => {
    const { onClose } = renderTabItem()
    const row = screen.getByText('Untitled Query').closest('[data-tab-id]')!
    fireEvent(row, new MouseEvent('auxclick', { button: 2, bubbles: true, cancelable: true }))
    expect(onClose).not.toHaveBeenCalled()
  })

  it('shows a warning dot instead of the X for a dirty tab, until the close button is hovered', () => {
    renderTabItem({ tab: makeTab({ isDirty: true }) })
    // The dot signals unsaved state; no X rendered underneath it yet.
    expect(screen.getByLabelText('Unsaved changes')).toBeInTheDocument()

    const closeBtn = screen.getByLabelText('Close tab (unsaved changes)')
    fireEvent.mouseEnter(closeBtn)
    // Hovering swaps the dot for an actionable X so the user can still click to close.
    expect(screen.queryByLabelText('Unsaved changes')).not.toBeInTheDocument()

    fireEvent.mouseLeave(closeBtn)
    expect(screen.getByLabelText('Unsaved changes')).toBeInTheDocument()
  })

  it('a non-dirty tab has no unsaved-changes dot', () => {
    renderTabItem({ tab: makeTab({ isDirty: false }) })
    expect(screen.queryByLabelText('Unsaved changes')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Close tab')).toBeInTheDocument()
  })

  it('clicking the close button closes without also activating the tab (stopPropagation)', () => {
    const { onActivate, onClose } = renderTabItem()
    fireEvent.click(screen.getByLabelText('Close tab'))
    expect(onClose).toHaveBeenCalledOnce()
    expect(onActivate).not.toHaveBeenCalled()
  })

  it('right-clicking the row opens the context menu with the supplied items', () => {
    renderTabItem()
    const row = screen.getByText('Untitled Query').closest('[data-tab-id]')!
    fireEvent.contextMenu(row)
    expect(screen.getByRole('menuitem', { name: 'Close' })).toBeInTheDocument()
  })

  it('selecting a context-menu item invokes its onSelect handler', () => {
    const { onClose } = renderTabItem()
    const row = screen.getByText('Untitled Query').closest('[data-tab-id]')!
    fireEvent.contextMenu(row)
    fireEvent.click(screen.getByRole('menuitem', { name: 'Close' }))
    expect(onClose).toHaveBeenCalledOnce()
  })
})
