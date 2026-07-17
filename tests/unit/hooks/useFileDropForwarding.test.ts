import { renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useFileDropForwarding } from '@/hooks/useFileDropForwarding'
import { IPC_CHANNELS } from '@shared/ipc'

function mockInvoke() {
  const invoke = vi.fn(async () => undefined)
  // @ts-expect-error mocked global for the test
  globalThis.window.electronAPI = { invoke, on: vi.fn(() => () => {}) }
  return invoke
}

/** Builds a DragEvent with a fake DataTransfer — jsdom's DragEvent doesn't
 *  implement dataTransfer, so tests construct just enough of the shape the
 *  hook reads (`types`, `files`). */
function dragEvent(type: string, opts: { types?: string[]; files?: Partial<File>[] } = {}) {
  const event = new Event(type, { bubbles: true, cancelable: true }) as DragEvent
  Object.defineProperty(event, 'dataTransfer', {
    value: opts.types || opts.files
      ? { types: opts.types ?? [], files: opts.files ?? [] }
      : null,
    configurable: true,
  })
  return event
}

afterEach(() => vi.restoreAllMocks())

describe('useFileDropForwarding', () => {
  it('calls preventDefault on dragover only when files are present in the drag payload', () => {
    mockInvoke()
    renderHook(() => useFileDropForwarding())
    const withFiles = dragEvent('dragover', { types: ['Files'] })
    const preventSpy = vi.spyOn(withFiles, 'preventDefault')
    window.dispatchEvent(withFiles)
    expect(preventSpy).toHaveBeenCalled()

    const withoutFiles = dragEvent('dragover', { types: ['text/plain'] })
    const preventSpy2 = vi.spyOn(withoutFiles, 'preventDefault')
    window.dispatchEvent(withoutFiles)
    expect(preventSpy2).not.toHaveBeenCalled()
  })

  it('forwards each dropped file path to the plugin drag-drop IPC channel', () => {
    const invoke = mockInvoke()
    renderHook(() => useFileDropForwarding())
    const drop = dragEvent('drop', {
      files: [{ path: '/tmp/a.sqlite' } as Partial<File>, { path: '/tmp/b.sqlite' } as Partial<File>],
    })
    window.dispatchEvent(drop)
    expect(invoke).toHaveBeenCalledTimes(2)
    expect(invoke).toHaveBeenNthCalledWith(1, IPC_CHANNELS.PLUGINS_DRAG_DROP, '/tmp/a.sqlite')
    expect(invoke).toHaveBeenNthCalledWith(2, IPC_CHANNELS.PLUGINS_DRAG_DROP, '/tmp/b.sqlite')
  })

  it('skips files with no `path` (e.g. dropped from a web source, not the OS)', () => {
    const invoke = mockInvoke()
    renderHook(() => useFileDropForwarding())
    const drop = dragEvent('drop', { files: [{} as Partial<File>] })
    window.dispatchEvent(drop)
    expect(invoke).not.toHaveBeenCalled()
  })

  it('does nothing on drop when dataTransfer.files is empty', () => {
    const invoke = mockInvoke()
    renderHook(() => useFileDropForwarding())
    const drop = dragEvent('drop', { files: [] })
    const preventSpy = vi.spyOn(drop, 'preventDefault')
    window.dispatchEvent(drop)
    expect(invoke).not.toHaveBeenCalled()
    expect(preventSpy).not.toHaveBeenCalled()
  })

  it('does nothing when dataTransfer is null', () => {
    const invoke = mockInvoke()
    renderHook(() => useFileDropForwarding())
    const drop = dragEvent('drop')
    window.dispatchEvent(drop)
    expect(invoke).not.toHaveBeenCalled()
  })

  it('removes both listeners on unmount', () => {
    mockInvoke()
    const removeSpy = vi.spyOn(window, 'removeEventListener')
    const { unmount } = renderHook(() => useFileDropForwarding())
    unmount()
    const removedTypes = removeSpy.mock.calls.map((c) => c[0])
    expect(removedTypes).toContain('dragover')
    expect(removedTypes).toContain('drop')
  })
})
