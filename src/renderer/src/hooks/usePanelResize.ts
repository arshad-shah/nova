import { useState } from 'react'
import { clamp } from '@/lib/math'

interface PanelResizeOptions {
  /** Persisted dimension (from a settings selector) — the baseline when idle. */
  value: number
  min: number
  max: number
  /** Width/height to expand to on a collapse-toggle when no prior size is known. */
  restoreDefault: number
  /** +1 if dragging right/down grows the panel, -1 if it shrinks it. */
  direction: 1 | -1
  /** Read the live persisted value (avoids a stale closure mid-drag). */
  read: () => number
  /** Persist a new value (typically the matching ui-store setter, which clamps). */
  commit: (next: number) => void
}

export interface PanelResize {
  /** Current dimension to render — the in-progress draft, or the persisted value. */
  effective: number
  onResize: (delta: number) => void
  onResizeEnd: () => void
  onDoubleClick: () => void
}

/**
 * Shared resize behavior for the sidebar / secondary-sidebar / bottom-dock
 * handles. Holds a draft size during the drag (so we don't write a setting on
 * every pixel), commits on release, and toggles collapse↔restore on
 * double-click. Extracted from three near-identical blocks in App.tsx.
 */
export function usePanelResize({
  value,
  min,
  max,
  restoreDefault,
  direction,
  read,
  commit,
}: PanelResizeOptions): PanelResize {
  const [draft, setDraft] = useState<number | null>(null)
  const [prev, setPrev] = useState(value)

  const clampToRange = (n: number) => clamp(n, min, max)

  return {
    effective: draft ?? value,
    onResize: (delta) =>
      setDraft((d) => clampToRange((d ?? read()) + direction * delta)),
    onResizeEnd: () => {
      if (draft !== null) {
        commit(draft)
        setDraft(null)
      }
    },
    onDoubleClick: () => {
      const current = read()
      if (current > min) {
        setPrev(current)
        commit(min)
      } else {
        commit(prev > min ? prev : restoreDefault)
      }
    },
  }
}
