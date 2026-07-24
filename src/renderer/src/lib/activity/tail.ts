/**
 * Tail (auto-follow) state for the stream — a pure reducer so the follow/detach
 * behaviour is testable without a DOM.
 *
 * The stream is newest-at-bottom (a console-style tail). While the user is at
 * the bottom it stays **pinned**, auto-scrolling as entries arrive. Scrolling up
 * **detaches** it and counts how many entries arrived since — surfaced as a
 * "N new" pill that re-pins and jumps to the latest on click.
 */

export interface TailState {
  /** Following the tail (auto-scroll to bottom on new entries). */
  pinned: boolean
  /** Entries that arrived while detached (0 while pinned). */
  unseen: number
}

export const INITIAL_TAIL: TailState = { pinned: true, unseen: 0 }

export type TailEvent =
  | { type: 'scrolled'; atBottom: boolean }
  | { type: 'appended'; count: number }
  /** A wholesale change (filter switch, clear): re-pin to the tail. */
  | { type: 'reset' }
  /** The user clicked the "N new" pill. */
  | { type: 'repin' }

export function tailReducer(state: TailState, event: TailEvent): TailState {
  switch (event.type) {
    case 'scrolled':
      // Reaching the bottom re-pins and clears the unseen count; leaving it
      // detaches. Staying detached keeps whatever unseen count we had.
      if (event.atBottom) return state.pinned && state.unseen === 0 ? state : { pinned: true, unseen: 0 }
      return state.pinned ? { pinned: false, unseen: 0 } : state
    case 'appended':
      if (event.count <= 0) return state
      return state.pinned ? state : { ...state, unseen: state.unseen + event.count }
    case 'reset':
    case 'repin':
      return state.pinned && state.unseen === 0 ? state : { pinned: true, unseen: 0 }
  }
}

/**
 * How many entries were prepended to a newest-first list since the last render.
 * Returns the count of new leading entries, or `-1` when the previous newest is
 * gone (a filter switch or clear — the caller should reset the tail rather than
 * treat the difference as arrivals).
 */
export function countPrepended(prevTopId: string | null, next: readonly { id: string }[]): number {
  if (prevTopId === null) return next.length
  const index = next.findIndex((e) => e.id === prevTopId)
  return index
}

/** Whether a scroll position counts as "at the bottom" within a tolerance. */
export function isAtBottom(scrollTop: number, scrollHeight: number, clientHeight: number, tolerance = 8): boolean {
  return scrollHeight - scrollTop - clientHeight <= tolerance
}
