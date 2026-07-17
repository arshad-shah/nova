import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import { Popover } from '../../../../src/renderer/src/primitives/surfaces/Popover'
import { Tooltip } from '../../../../src/renderer/src/primitives/surfaces/Tooltip'

// DropdownMenu / ContextMenu are covered by `menu-behavior.test.tsx`.
// The suites that lived here asserted only that labels appeared in the DOM —
// nothing activated a row, and the ContextMenu suite never right-clicked.

describe('Popover', () => {
  it('renders trigger', () => {
    render(
      <Popover trigger={<button>Open</button>} content={<div>pop content</div>} />
    )
    expect(screen.getByText('Open')).toBeInTheDocument()
  })

  it('renders content element after the trigger is clicked', async () => {
    render(
      <Popover trigger={<button>Open</button>} content={<div>pop content</div>} />
    )
    expect(screen.queryByText('pop content')).not.toBeInTheDocument()
    await userEvent.click(screen.getByText('Open'))
    expect(screen.getByText('pop content')).toBeInTheDocument()
  })
})

describe('Tooltip', () => {
  it('renders children', () => {
    render(
      <Tooltip content="tooltip text">
        <button>hover me</button>
      </Tooltip>
    )
    expect(screen.getByText('hover me')).toBeInTheDocument()
  })

  it('renders tooltip content element in DOM', async () => {
    vi.useFakeTimers()
    render(
      <Tooltip content="my tooltip" delay={0}>
        <span>target</span>
      </Tooltip>
    )

    await act(async () => {
      fireEvent.mouseEnter(screen.getByText('target').parentElement!)
    })
    await act(async () => {
      vi.advanceTimersByTime(1)
    })

    expect(screen.getByRole('tooltip')).toBeInTheDocument()
    vi.useRealTimers()
  })
})
