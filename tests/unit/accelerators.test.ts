// Direct tests for lib/accelerators.ts's parser. capture-keybinding.test.ts
// exercises matchesAccelerator only against strings chordFromEvent itself
// produces ("Ctrl+X"/"Cmd+X"); this covers the parser's own surface —
// cmdOrCtrl, exact-modifier matching, and malformed input — which a plugin
// manifest's freeform keybinding string can also hit.
import { describe, it, expect, vi } from 'vitest'
import { matchesAccelerator } from '../../src/renderer/src/lib/accelerators'

function ev(over: Partial<KeyboardEvent>): KeyboardEvent {
  return { key: '', metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, ...over } as KeyboardEvent
}

describe('matchesAccelerator', () => {
  it('returns false for an empty accelerator string', () => {
    expect(matchesAccelerator(ev({ key: 'a', ctrlKey: true }), '')).toBe(false)
  })

  it('matches a simple modifier+key combination', () => {
    expect(matchesAccelerator(ev({ key: 's', ctrlKey: true }), 'Ctrl+S')).toBe(true)
  })

  it('is case-insensitive in both the accelerator string and the key', () => {
    expect(matchesAccelerator(ev({ key: 'S', ctrlKey: true }), 'ctrl+s')).toBe(true)
  })

  it('tolerates whitespace around parts', () => {
    expect(matchesAccelerator(ev({ key: 'p', ctrlKey: true, shiftKey: true }), ' Ctrl + Shift + P ')).toBe(true)
  })

  it('requires an EXACT modifier match — extra held modifiers must not match', () => {
    // Event has Shift held too, but accelerator only asks for Ctrl+S.
    expect(matchesAccelerator(ev({ key: 's', ctrlKey: true, shiftKey: true }), 'Ctrl+S')).toBe(false)
  })

  it('requires all named modifiers to be held', () => {
    expect(matchesAccelerator(ev({ key: 'p', ctrlKey: true }), 'Ctrl+Shift+P')).toBe(false)
  })

  it('treats cmd/command/meta as the same modifier', () => {
    const accel = ev({ key: 's', metaKey: true })
    expect(matchesAccelerator(accel, 'Cmd+S')).toBe(true)
    expect(matchesAccelerator(accel, 'Command+S')).toBe(true)
    expect(matchesAccelerator(accel, 'Meta+S')).toBe(true)
  })

  it('treats ctrl/control as the same modifier', () => {
    expect(matchesAccelerator(ev({ key: 's', ctrlKey: true }), 'Control+S')).toBe(true)
  })

  it('treats alt/option as the same modifier', () => {
    expect(matchesAccelerator(ev({ key: 'a', altKey: true }), 'Option+A')).toBe(true)
  })

  it('resolves CmdOrCtrl to the platform-appropriate modifier (jsdom reports non-Mac)', () => {
    // navigator.platform in the jsdom test environment doesn't include "Mac",
    // so CmdOrCtrl resolves to Ctrl here.
    expect(matchesAccelerator(ev({ key: 's', ctrlKey: true }), 'CmdOrCtrl+S')).toBe(true)
    expect(matchesAccelerator(ev({ key: 's', metaKey: true }), 'CmdOrCtrl+S')).toBe(false)
  })

  it('returns false when the accelerator has no non-modifier key', () => {
    expect(matchesAccelerator(ev({ key: 's', ctrlKey: true }), 'Ctrl+Shift')).toBe(false)
  })

  it('returns false when the pressed key does not match', () => {
    expect(matchesAccelerator(ev({ key: 'x', ctrlKey: true }), 'Ctrl+S')).toBe(false)
  })
})

describe('matchesAccelerator — CmdOrCtrl on Mac', () => {
  it('resolves CmdOrCtrl to Cmd when navigator.platform reports Mac (MAC is computed once at module load)', async () => {
    const originalPlatform = navigator.platform
    Object.defineProperty(navigator, 'platform', { value: 'MacIntel', configurable: true })
    try {
      vi.resetModules()
      const { matchesAccelerator: matchesOnMac } = await import('../../src/renderer/src/lib/accelerators')
      expect(matchesOnMac(ev({ key: 's', metaKey: true }), 'CmdOrCtrl+S')).toBe(true)
      expect(matchesOnMac(ev({ key: 's', ctrlKey: true }), 'CmdOrCtrl+S')).toBe(false)
    } finally {
      Object.defineProperty(navigator, 'platform', { value: originalPlatform, configurable: true })
      vi.resetModules()
    }
  })
})
