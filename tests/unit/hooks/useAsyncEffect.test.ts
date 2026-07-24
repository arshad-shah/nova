import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useAsyncEffect } from '@/hooks/useAsyncEffect'

/** A deferred promise so a test can resolve an async effect on demand. */
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

describe('useAsyncEffect', () => {
  it('commits an awaited result when the effect is still current', async () => {
    const commit = vi.fn()
    const d = deferred<string>()
    renderHook(() =>
      useAsyncEffect(async (isCancelled) => {
        const value = await d.promise
        if (!isCancelled()) commit(value)
      }, []),
    )

    d.resolve('a')
    await d.promise
    expect(commit).toHaveBeenCalledExactlyOnceWith('a')
  })

  it('marks the effect cancelled when dependencies change before it resolves', async () => {
    const commit = vi.fn()
    const first = deferred<string>()
    const second = deferred<string>()
    const pending = [first, second]

    const { rerender } = renderHook(
      ({ dep }: { dep: number }) =>
        useAsyncEffect(async (isCancelled) => {
          const value = await pending[dep].promise
          if (!isCancelled()) commit(value)
        }, [dep]),
      { initialProps: { dep: 0 } },
    )

    // Switch dependencies before the first run resolves — the first run is now stale.
    rerender({ dep: 1 })

    second.resolve('B')
    await second.promise
    first.resolve('A')
    await first.promise

    // Only the current (second) run may commit; the stale first run is ignored.
    expect(commit).toHaveBeenCalledExactlyOnceWith('B')
  })

  it('marks the effect cancelled on unmount so a late resolution never commits', async () => {
    const commit = vi.fn()
    const d = deferred<string>()
    const { unmount } = renderHook(() =>
      useAsyncEffect(async (isCancelled) => {
        const value = await d.promise
        if (!isCancelled()) commit(value)
      }, []),
    )

    unmount()
    d.resolve('a')
    await d.promise
    expect(commit).not.toHaveBeenCalled()
  })

  it('swallows a rejecting effect instead of leaking an unhandled rejection', async () => {
    const onUnhandled = vi.fn()
    process.on('unhandledRejection', onUnhandled)
    try {
      renderHook(() =>
        useAsyncEffect(async () => {
          throw new Error('boom')
        }, []),
      )
      // Let the microtask queue drain so any missed catch would surface.
      await Promise.resolve()
      await Promise.resolve()
      expect(onUnhandled).not.toHaveBeenCalled()
    } finally {
      process.off('unhandledRejection', onUnhandled)
    }
  })

  it('re-runs the effect when a dependency changes', async () => {
    const runs: number[] = []
    const { rerender } = renderHook(
      ({ dep }: { dep: number }) =>
        useAsyncEffect(async () => {
          runs.push(dep)
        }, [dep]),
      { initialProps: { dep: 0 } },
    )
    await Promise.resolve()
    rerender({ dep: 1 })
    await Promise.resolve()
    expect(runs).toEqual([0, 1])
  })
})
