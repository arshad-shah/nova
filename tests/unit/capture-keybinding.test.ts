import { describe, it, expect } from 'vitest'
import { chordFromEvent } from '../../src/renderer/src/lib/capture-keybinding'
import { matchesAccelerator } from '../../src/renderer/src/lib/accelerators'

/** Minimal KeyboardEvent-like stub for the matchers. */
function ev(over: Partial<KeyboardEvent>): KeyboardEvent {
  return {
    key: '',
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    ...over,
  } as KeyboardEvent
}

describe('chordFromEvent', () => {
  it('emits both platform variants for a primary-modifier chord', () => {
    expect(chordFromEvent(ev({ key: 'b', ctrlKey: true }))).toEqual(['Ctrl+B', 'Cmd+B'])
    expect(chordFromEvent(ev({ key: 'b', metaKey: true }))).toEqual(['Ctrl+B', 'Cmd+B'])
  })

  it('preserves shift/alt ordering and uppercases letters', () => {
    expect(chordFromEvent(ev({ key: 'p', metaKey: true, shiftKey: true }))).toEqual([
      'Ctrl+Shift+P',
      'Cmd+Shift+P',
    ])
    expect(chordFromEvent(ev({ key: 'b', ctrlKey: true, altKey: true }))).toEqual([
      'Ctrl+Alt+B',
      'Cmd+Alt+B',
    ])
  })

  it('captures punctuation keys shared by both matchers', () => {
    expect(chordFromEvent(ev({ key: ',', ctrlKey: true }))).toEqual(['Ctrl+,', 'Cmd+,'])
    expect(chordFromEvent(ev({ key: '/', metaKey: true }))).toEqual(['Ctrl+/', 'Cmd+/'])
  })

  it('rejects a single-character key that is not a letter, digit, or supported punctuation', () => {
    expect(chordFromEvent(ev({ key: '~', metaKey: true }))).toBeNull()
  })

  it('keeps digits and supported named keys', () => {
    expect(chordFromEvent(ev({ key: '1', metaKey: true }))).toEqual(['Ctrl+1', 'Cmd+1'])
    expect(chordFromEvent(ev({ key: 'Enter', metaKey: true }))).toEqual(['Ctrl+Enter', 'Cmd+Enter'])
  })

  it('allows bare function keys without a modifier', () => {
    expect(chordFromEvent(ev({ key: 'F5' }))).toEqual(['F5'])
  })

  it('rejects lone modifiers, modifier-less letters, and excluded keys', () => {
    expect(chordFromEvent(ev({ key: 'Meta', metaKey: true }))).toBeNull()
    expect(chordFromEvent(ev({ key: 'a' }))).toBeNull()
    expect(chordFromEvent(ev({ key: ' ', metaKey: true }))).toBeNull()
    expect(chordFromEvent(ev({ key: 'ArrowUp', metaKey: true }))).toBeNull()
    expect(chordFromEvent(ev({ key: 'Escape', metaKey: true }))).toBeNull()
  })

  it('produces strings matchesAccelerator can match on either platform', () => {
    const keys = chordFromEvent(ev({ key: 'k', metaKey: true, shiftKey: true }))!
    // A Cmd press matches the Cmd variant; a Ctrl press matches the Ctrl variant.
    expect(keys.some((k) => matchesAccelerator(ev({ key: 'k', metaKey: true, shiftKey: true }), k))).toBe(true)
    expect(keys.some((k) => matchesAccelerator(ev({ key: 'k', ctrlKey: true, shiftKey: true }), k))).toBe(true)
    // A different key does not match.
    expect(keys.some((k) => matchesAccelerator(ev({ key: 'j', metaKey: true, shiftKey: true }), k))).toBe(false)
  })
})
