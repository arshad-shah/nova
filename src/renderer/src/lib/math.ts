/** Small numeric helpers shared across the renderer. */

/** Constrain `n` to the inclusive `[min, max]` range. The one home for the
 *  `Math.min(max, Math.max(min, n))` idiom that panels/popovers/resize handles
 *  used to hand-roll. */
export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}

/** Left padding (px) for a tree row at a given nesting `depth`, in the
 *  explorer's row indent scheme: an 8px base gutter (room for the row's own
 *  chevron/icon) plus 16px per depth level. Shared by the explorer's
 *  Database/Schema/Table/View nodes so their indent math can't drift apart.
 *  Not used by every tree in the app — e.g. the query-plan view has no
 *  per-row chevron gutter and uses its own `depth * 24` margin. */
export function treeIndent(depth: number): number {
  return 8 + depth * 16
}
