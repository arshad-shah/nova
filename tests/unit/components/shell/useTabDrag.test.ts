import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { useTabDrag } from '@/components/shell/tab-bar/useTabDrag'
import type { DragEvent } from 'react'

/** Minimal fake of the bits of DragEvent the hook touches. */
function fakeDragEvent(clientX: number): DragEvent {
  return {
    clientX,
    preventDefault: vi.fn(),
    dataTransfer: {
      effectAllowed: '',
      dropEffect: '',
      setDragImage: vi.fn(),
    },
  } as unknown as DragEvent
}

describe('useTabDrag', () => {
  it('does not reorder when the pointer never moved past the drag threshold (a click, not a drag)', () => {
    const onReorder = vi.fn()
    const { result } = renderHook(() => useTabDrag({ onReorder }))

    act(() => result.current.onDragStart(fakeDragEvent(100), 0))
    // dragOver at the same x — within the 3px jitter threshold.
    act(() => result.current.onDragOver(fakeDragEvent(101), 2))
    act(() => result.current.onDragEnd())

    expect(onReorder).not.toHaveBeenCalled()
    expect(result.current.draggedIndex).toBeNull()
    expect(result.current.dropIndex).toBeNull()
  })

  it('reorders once the pointer moves past the threshold and drops on a different index', () => {
    const onReorder = vi.fn()
    const { result } = renderHook(() => useTabDrag({ onReorder }))

    act(() => result.current.onDragStart(fakeDragEvent(100), 0))
    act(() => result.current.onDragOver(fakeDragEvent(140), 2))
    act(() => result.current.onDragEnd())

    expect(onReorder).toHaveBeenCalledExactlyOnceWith(0, 2)
  })

  it('does not reorder when dropped back on the same index it started from', () => {
    const onReorder = vi.fn()
    const { result } = renderHook(() => useTabDrag({ onReorder }))

    act(() => result.current.onDragStart(fakeDragEvent(100), 1))
    act(() => result.current.onDragOver(fakeDragEvent(140), 1))
    act(() => result.current.onDragEnd())

    expect(onReorder).not.toHaveBeenCalled()
  })

  it('tracks dropIndex only while dragging, and clears both indices after drop', () => {
    const onReorder = vi.fn()
    const { result } = renderHook(() => useTabDrag({ onReorder }))

    act(() => result.current.onDragStart(fakeDragEvent(0), 0))
    expect(result.current.draggedIndex).toBe(0)

    act(() => result.current.onDragOver(fakeDragEvent(50), 3))
    expect(result.current.dropIndex).toBe(3)

    act(() => result.current.onDragEnd())
    expect(result.current.draggedIndex).toBeNull()
    expect(result.current.dropIndex).toBeNull()
  })

  it('ending a drag without ever calling onDragOver does not reorder', () => {
    // Regression for a drag that starts but the pointer leaves the trough
    // before any dragover fires — dropIndex stays null.
    const onReorder = vi.fn()
    const { result } = renderHook(() => useTabDrag({ onReorder }))

    act(() => result.current.onDragStart(fakeDragEvent(0), 0))
    act(() => result.current.onDragEnd())

    expect(onReorder).not.toHaveBeenCalled()
  })
})
