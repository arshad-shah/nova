/**
 * Shared focus-visible treatment for interactive tiles/cards that aren't a
 * `Card interactive` (which pairs its own hover with `shadow-elevated`).
 * Centralizes the `focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-glow)]`
 * pair so it isn't copy-pasted across every hand-rolled interactive tile.
 */
export const FOCUS_GLOW = 'focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-glow)]'
