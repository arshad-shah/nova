import { describe, it, expect, beforeEach } from 'vitest'
import { useExplainStore } from '../../../src/renderer/src/stores/explain'

describe('useExplainStore', () => {
  beforeEach(() => {
    useExplainStore.setState({ byTab: {} })
  })

  it('a tab with no activity has no entry at all (no eager default row)', () => {
    expect(useExplainStore.getState().byTab['tab-1']).toBeUndefined()
  })

  it('setLoading() on an untouched tab creates an entry seeded from the empty defaults', () => {
    useExplainStore.getState().setLoading('tab-1', true)
    const tab = useExplainStore.getState().byTab['tab-1']
    expect(tab.loading).toBe(true)
    expect(tab.streamingText).toBe('')
    expect(tab.streamId).toBeNull()
    expect(tab.error).toBeNull()
  })

  it('startStream() resets streamingText/durationMs/error even if the tab previously failed', () => {
    useExplainStore.getState().failStream('tab-1', 'boom')
    useExplainStore.getState().appendToken('tab-1', 'leftover') // shouldn't survive the restart
    useExplainStore.getState().startStream('tab-1', 'stream-2', 'gpt-4')
    const tab = useExplainStore.getState().byTab['tab-1']
    expect(tab.loading).toBe(true)
    expect(tab.streamId).toBe('stream-2')
    expect(tab.model).toBe('gpt-4')
    expect(tab.streamingText).toBe('')
    expect(tab.error).toBeNull()
    expect(tab.durationMs).toBeNull()
  })

  it('appendToken() accumulates text across multiple calls in order', () => {
    useExplainStore.getState().startStream('tab-1', 's1', 'gpt-4')
    useExplainStore.getState().appendToken('tab-1', 'SELECT ')
    useExplainStore.getState().appendToken('tab-1', '* FROM ')
    useExplainStore.getState().appendToken('tab-1', 'users')
    expect(useExplainStore.getState().byTab['tab-1'].streamingText).toBe('SELECT * FROM users')
  })

  it('appendToken() on a tab that never started a stream still records the text', () => {
    // Documents current behaviour: appendToken has no guard against being
    // called before startStream, so it silently creates a "loading: false"
    // entry that nonetheless carries streamed text. Not exercised by normal
    // app flow (which always calls startStream first) but worth pinning down.
    useExplainStore.getState().appendToken('tab-1', 'orphaned token')
    const tab = useExplainStore.getState().byTab['tab-1']
    expect(tab.streamingText).toBe('orphaned token')
    expect(tab.loading).toBe(false)
  })

  it('finishStream() stops loading, clears streamId, and records durationMs while keeping the model', () => {
    useExplainStore.getState().startStream('tab-1', 's1', 'gpt-4')
    useExplainStore.getState().appendToken('tab-1', 'plan text')
    useExplainStore.getState().finishStream('tab-1', 42)
    const tab = useExplainStore.getState().byTab['tab-1']
    expect(tab.loading).toBe(false)
    expect(tab.streamId).toBeNull()
    expect(tab.durationMs).toBe(42)
    expect(tab.model).toBe('gpt-4')
    expect(tab.streamingText).toBe('plan text')
  })

  it('failStream() stops loading, clears streamId, records the error, and preserves partial streamed text', () => {
    useExplainStore.getState().startStream('tab-1', 's1', 'gpt-4')
    useExplainStore.getState().appendToken('tab-1', 'partial plan...')
    useExplainStore.getState().failStream('tab-1', 'connection reset')
    const tab = useExplainStore.getState().byTab['tab-1']
    expect(tab.loading).toBe(false)
    expect(tab.streamId).toBeNull()
    expect(tab.error).toBe('connection reset')
    expect(tab.streamingText).toBe('partial plan...')
  })

  it('resetTab() clears a tab back to the initial empty shape', () => {
    useExplainStore.getState().startStream('tab-1', 's1', 'gpt-4')
    useExplainStore.getState().appendToken('tab-1', 'some text')
    useExplainStore.getState().failStream('tab-1', 'oops')
    useExplainStore.getState().resetTab('tab-1')
    const tab = useExplainStore.getState().byTab['tab-1']
    expect(tab).toEqual({
      loading: false, streamingText: '', streamId: null, model: null,
      durationMs: null, error: null,
    })
  })

  it('operations on one tab never leak into another tab', () => {
    useExplainStore.getState().startStream('tab-a', 's1', 'gpt-4')
    useExplainStore.getState().appendToken('tab-a', 'hello')
    useExplainStore.getState().startStream('tab-b', 's2', 'claude')
    useExplainStore.getState().appendToken('tab-b', 'world')

    const a = useExplainStore.getState().byTab['tab-a']
    const b = useExplainStore.getState().byTab['tab-b']
    expect(a.streamingText).toBe('hello')
    expect(a.streamId).toBe('s1')
    expect(b.streamingText).toBe('world')
    expect(b.streamId).toBe('s2')
  })

  it('resetTab() on one tab does not disturb a sibling tab', () => {
    useExplainStore.getState().startStream('tab-a', 's1', 'gpt-4')
    useExplainStore.getState().startStream('tab-b', 's2', 'claude')
    useExplainStore.getState().resetTab('tab-a')
    expect(useExplainStore.getState().byTab['tab-a'].streamId).toBeNull()
    expect(useExplainStore.getState().byTab['tab-b'].streamId).toBe('s2')
  })

  it('starting a second stream on the same tab overwrites accumulated text from the first', () => {
    useExplainStore.getState().startStream('tab-1', 's1', 'gpt-4')
    useExplainStore.getState().appendToken('tab-1', 'first attempt text')
    useExplainStore.getState().startStream('tab-1', 's2', 'gpt-4')
    expect(useExplainStore.getState().byTab['tab-1'].streamingText).toBe('')
    expect(useExplainStore.getState().byTab['tab-1'].streamId).toBe('s2')
  })
})
