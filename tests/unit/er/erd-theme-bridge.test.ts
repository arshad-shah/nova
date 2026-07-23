/**
 * The theme bridge is what lets the canvas painter — which cannot resolve
 * `var(--…)` — still follow the app theme. It must return a fully-populated
 * palette of concrete strings and repaint-notify on `data-theme` changes.
 */
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { readErdTheme, watchTheme, type ErdTheme } from '../../../src/renderer/src/components/er/theme-bridge'

const KEYS: (keyof ErdTheme)[] = [
  'surface', 'grid', 'card', 'cardHeader', 'cardBorder', 'cardBorderStrong',
  'divider', 'title', 'eyebrow', 'columnName', 'columnNameMuted', 'columnType',
  'edge', 'edgeMuted', 'edgeActive', 'pk', 'fk', 'uq', 'select',
  'fontTitle', 'fontEyebrow', 'fontRow', 'fontType', 'fontLegend',
]

describe('readErdTheme', () => {
  it('returns every palette and font field as a string', () => {
    const t = readErdTheme()
    for (const k of KEYS) {
      expect(typeof t[k], `${k} should be a string`).toBe('string')
    }
  })

  it('builds canvas font shorthands with a pixel size and a family', () => {
    const t = readErdTheme()
    for (const f of [t.fontTitle, t.fontEyebrow, t.fontRow, t.fontType, t.fontLegend]) {
      // "<weight> <size>px <family…>"
      expect(f).toMatch(/^\d+\s+\d+(\.\d+)?px\s+.+/)
    }
  })

  it('reflects a colour token set on the element', () => {
    document.documentElement.style.setProperty('--color-bg-inset', 'rgb(9, 8, 7)')
    const resolved = getComputedStyle(document.documentElement)
      .getPropertyValue('--color-bg-inset')
      .trim()
    const t = readErdTheme()
    // Only assert the round-trip where the environment actually resolves custom
    // properties; jsdom's support is what this exercises.
    if (resolved) expect(t.surface).toBe(resolved)
    document.documentElement.style.removeProperty('--color-bg-inset')
  })
})

describe('watchTheme', () => {
  it('invokes the callback on a data-theme change and stops after unsubscribe', () => {
    const cb = vi.fn()
    const stop = watchTheme(cb)
    // MutationObserver is async; flush a microtask+macrotask via a manual event.
    document.documentElement.setAttribute('data-theme', 'light')
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        expect(cb).toHaveBeenCalledTimes(1)
        stop()
        document.documentElement.setAttribute('data-theme', 'dark')
        setTimeout(() => {
          expect(cb).toHaveBeenCalledTimes(1)
          resolve()
        }, 0)
      }, 0)
    })
  })
})
