import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import { Popover } from '@/primitives/surfaces/Popover'

/**
 * Behavioural tests for Popover's controlled/uncontrolled open state, the
 * dismiss paths (Escape, outside click), and the trigger onClick contract.
 * `popover.test.tsx` only covers the uncontrolled click-to-open case.
 */

describe('Popover — uncontrolled', () => {
  it('toggles open/closed on repeated trigger clicks', async () => {
    const user = userEvent.setup()
    render(<Popover trigger={<button>Open</button>} content={<div>panel</div>} />)
    await user.click(screen.getByText('Open'))
    expect(screen.getByText('panel')).toBeInTheDocument()
    await user.click(screen.getByText('Open'))
    expect(screen.queryByText('panel')).not.toBeInTheDocument()
  })

  it('closes on Escape', async () => {
    const user = userEvent.setup()
    render(<Popover trigger={<button>Open</button>} content={<div>panel</div>} />)
    await user.click(screen.getByText('Open'))
    expect(screen.getByText('panel')).toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByText('panel')).not.toBeInTheDocument()
  })

  it('closes on an outside click', async () => {
    const user = userEvent.setup()
    render(
      <div>
        <Popover trigger={<button>Open</button>} content={<div>panel</div>} />
        <button>elsewhere</button>
      </div>
    )
    await user.click(screen.getByText('Open'))
    expect(screen.getByText('panel')).toBeInTheDocument()
    fireEvent.mouseDown(screen.getByText('elsewhere'))
    expect(screen.queryByText('panel')).not.toBeInTheDocument()
  })

  it('does not close when clicking inside the panel', async () => {
    const user = userEvent.setup()
    render(
      <Popover
        trigger={<button>Open</button>}
        content={<button>inside action</button>}
      />
    )
    await user.click(screen.getByText('Open'))
    fireEvent.mouseDown(screen.getByText('inside action'))
    expect(screen.getByText('inside action')).toBeInTheDocument()
  })
})

describe('Popover — controlled', () => {
  it('does not open on trigger click by itself — the caller must react to onOpenChange', async () => {
    const user = userEvent.setup()
    const onOpenChange = vi.fn()
    render(
      <Popover
        trigger={<button>Open</button>}
        content={<div>panel</div>}
        open={false}
        onOpenChange={onOpenChange}
      />
    )
    await user.click(screen.getByText('Open'))
    expect(onOpenChange).toHaveBeenCalledWith(true)
    expect(screen.queryByText('panel')).not.toBeInTheDocument()
  })

  it('renders the panel once the caller flips `open` to true', () => {
    const { rerender } = render(
      <Popover trigger={<button>Open</button>} content={<div>panel</div>} open={false} onOpenChange={() => {}} />
    )
    expect(screen.queryByText('panel')).not.toBeInTheDocument()
    rerender(
      <Popover trigger={<button>Open</button>} content={<div>panel</div>} open={true} onOpenChange={() => {}} />
    )
    expect(screen.getByText('panel')).toBeInTheDocument()
  })

  it('reports Escape and outside-click dismissal via onOpenChange instead of closing itself', () => {
    const onOpenChange = vi.fn()
    render(
      <Popover trigger={<button>Open</button>} content={<div>panel</div>} open={true} onOpenChange={onOpenChange} />
    )
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onOpenChange).toHaveBeenCalledWith(false)
    // The panel is still in the DOM — only the callback fired, the caller
    // hasn't re-rendered with open=false yet.
    expect(screen.getByText('panel')).toBeInTheDocument()
  })
})

describe('Popover — trigger onClick contract', () => {
  it('still calls the trigger element\'s own onClick handler', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    render(<Popover trigger={<button onClick={onClick}>Open</button>} content={<div>panel</div>} />)
    await user.click(screen.getByText('Open'))
    expect(onClick).toHaveBeenCalledTimes(1)
    expect(screen.getByText('panel')).toBeInTheDocument()
  })

  it('does not toggle open when the trigger onClick calls preventDefault', async () => {
    const user = userEvent.setup()
    render(
      <Popover
        trigger={
          <button onClick={(e) => e.preventDefault()}>Open</button>
        }
        content={<div>panel</div>}
      />
    )
    await user.click(screen.getByText('Open'))
    expect(screen.queryByText('panel')).not.toBeInTheDocument()
  })

  it('sets aria-haspopup and aria-expanded on the trigger', async () => {
    const user = userEvent.setup()
    render(<Popover trigger={<button>Open</button>} content={<div>panel</div>} />)
    const trigger = screen.getByText('Open')
    expect(trigger).toHaveAttribute('aria-haspopup', 'dialog')
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    await user.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
  })
})
