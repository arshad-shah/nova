import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { usePanelResize } from '@/hooks/usePanelResize'

/** Builds options backed by a tiny in-memory "persisted value" so `read`/`commit`
 *  behave like the real ui-store selector/setter pair the hook is designed around. */
function makeOptions(overrides: Partial<Parameters<typeof usePanelResize>[0]> = {}) {
  let persisted = overrides.value ?? 200
  const commit = vi.fn((next: number) => {
    persisted = next
  })
  const read = vi.fn(() => persisted)
  return {
    value: persisted,
    min: 100,
    max: 400,
    restoreDefault: 250,
    direction: 1 as const,
    read,
    commit,
    ...overrides,
    // keep read/commit wired to the same closure even if overrides supplied a value
    getPersisted: () => persisted,
  }
}

describe('usePanelResize', () => {
  it('effective starts at the persisted value with no draft', () => {
    const opts = makeOptions({ value: 250 })
    const { result } = renderHook(() => usePanelResize(opts))
    expect(result.current.effective).toBe(250)
  })

  it('onResize sets a draft from read() + direction*delta without committing', () => {
    const opts = makeOptions({ value: 200 })
    const { result, rerender } = renderHook(() => usePanelResize(opts))
    result.current.onResize(30)
    rerender()
    expect(result.current.effective).toBe(230)
    expect(opts.commit).not.toHaveBeenCalled()
  })

  it('direction -1 inverts the delta (shrinking handles)', () => {
    const opts = makeOptions({ value: 200, direction: -1 })
    const { result, rerender } = renderHook(() => usePanelResize(opts))
    result.current.onResize(30)
    rerender()
    expect(result.current.effective).toBe(170)
  })

  it('clamps the draft to [min, max] while dragging past either edge', () => {
    const opts = makeOptions({ value: 380, min: 100, max: 400 })
    const { result, rerender } = renderHook(() => usePanelResize(opts))
    result.current.onResize(1000)
    rerender()
    expect(result.current.effective).toBe(400)

    const opts2 = makeOptions({ value: 120, min: 100, max: 400 })
    const { result: result2, rerender: rerender2 } = renderHook(() => usePanelResize(opts2))
    result2.current.onResize(-1000)
    rerender2()
    expect(result2.current.effective).toBe(100)
  })

  it('accumulates successive onResize calls from the prior draft, not from read() again', () => {
    const opts = makeOptions({ value: 200 })
    const { result, rerender } = renderHook(() => usePanelResize(opts))
    result.current.onResize(10)
    rerender()
    result.current.onResize(10)
    rerender()
    // 200 -> 210 -> 220, even though read() still reports the un-committed 200
    expect(result.current.effective).toBe(220)
    expect(opts.read).toHaveBeenCalled()
  })

  it('onResizeEnd commits the draft and clears it back to the persisted value', () => {
    const opts = makeOptions({ value: 200 })
    const { result, rerender } = renderHook((props) => usePanelResize(props), { initialProps: opts })
    result.current.onResize(50)
    rerender(opts)
    result.current.onResizeEnd()
    expect(opts.commit).toHaveBeenCalledExactlyOnceWith(250)
    // Simulate the caller re-rendering with the newly committed persisted value.
    rerender({ ...opts, value: 250 })
    expect(result.current.effective).toBe(250)
  })

  it('onResizeEnd commits even when the draft settles at exactly 0 (falsy-but-valid, not "no prior resize")', () => {
    // A naive `if (draft)` guard (instead of `draft !== null`) would treat a
    // drag that lands exactly on 0 as "nothing pending" and silently drop it.
    const opts = makeOptions({ value: 30, min: 0, max: 400 })
    const { result, rerender } = renderHook(() => usePanelResize(opts))
    result.current.onResize(-30)
    rerender()
    expect(result.current.effective).toBe(0)
    result.current.onResizeEnd()
    expect(opts.commit).toHaveBeenCalledExactlyOnceWith(0)
  })

  it('onResizeEnd without a prior onResize is a no-op (no commit)', () => {
    const opts = makeOptions({ value: 200 })
    const { result } = renderHook(() => usePanelResize(opts))
    result.current.onResizeEnd()
    expect(opts.commit).not.toHaveBeenCalled()
  })

  it('onDoubleClick collapses to min and remembers the pre-collapse size', () => {
    const opts = makeOptions({ value: 300, min: 100 })
    const { result } = renderHook(() => usePanelResize(opts))
    result.current.onDoubleClick()
    expect(opts.commit).toHaveBeenCalledExactlyOnceWith(100)
  })

  it('onDoubleClick restores the remembered size on the second toggle', () => {
    const opts = makeOptions({ value: 300, min: 100, restoreDefault: 250 })
    const { result, rerender } = renderHook((props) => usePanelResize(props), { initialProps: opts })
    result.current.onDoubleClick() // collapse: commit(100), prev remembered as 300
    rerender({ ...opts, value: 100 })
    result.current.onDoubleClick() // restore: current (100) is not > min, so commit(prev=300)
    expect(opts.commit).toHaveBeenNthCalledWith(2, 300)
  })

  it('onDoubleClick falls back to restoreDefault when already at/below min with no remembered size', () => {
    // Panel starts already collapsed at min — `prev` was seeded from the
    // initial `value`, which is also `min`, so it isn't a usable "prior" size.
    const opts = makeOptions({ value: 100, min: 100, restoreDefault: 250 })
    const { result } = renderHook(() => usePanelResize(opts))
    result.current.onDoubleClick()
    expect(opts.commit).toHaveBeenCalledExactlyOnceWith(250)
  })
})
