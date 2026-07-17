import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MultiConnectionSegment } from '@/components/shell/status-bar/MultiConnectionSegment'
import { useConnectionsStore } from '@/stores/connections'

describe('MultiConnectionSegment', () => {
  beforeEach(() => {
    useConnectionsStore.setState({ connectedIds: new Set() })
  })

  it('renders nothing with zero connections', () => {
    const { container } = render(<MultiConnectionSegment onClick={() => {}} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing with exactly one connection (not "multi" yet)', () => {
    useConnectionsStore.setState({ connectedIds: new Set(['a']) })
    const { container } = render(<MultiConnectionSegment onClick={() => {}} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders the count once two or more connections are active', () => {
    useConnectionsStore.setState({ connectedIds: new Set(['a', 'b', 'c']) })
    render(<MultiConnectionSegment onClick={() => {}} />)
    expect(screen.getByText('3')).toBeInTheDocument()
  })

  it('invokes onClick when clicked', () => {
    useConnectionsStore.setState({ connectedIds: new Set(['a', 'b']) })
    const onClick = vi.fn()
    render(<MultiConnectionSegment onClick={onClick} />)
    fireEvent.click(screen.getByRole('button'))
    expect(onClick).toHaveBeenCalledOnce()
  })
})
