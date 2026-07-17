/** Small numeric helpers shared across the renderer. */

/** Constrain `n` to the inclusive `[min, max]` range. The one home for the
 *  `Math.min(max, Math.max(min, n))` idiom that panels/popovers/resize handles
 *  used to hand-roll. */
export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}
