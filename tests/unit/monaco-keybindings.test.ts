import { describe, it, expect } from 'vitest'
import type { Monaco } from '@monaco-editor/react'
import { parseKeybinding } from '../../src/renderer/src/lib/monaco-keybindings'

// Minimal Monaco stand-in: only the KeyMod flags and KeyCode lookups that
// parseKeybinding reads. The numeric values mirror Monaco's real bitmask so
// the OR-combination assertions are meaningful.
const KeyMod = { CtrlCmd: 2048, Shift: 1024, Alt: 512, WinCtrl: 256 }
const KeyCode: Record<string, number> = {
  Enter: 3, Escape: 9, Tab: 2, Space: 10, Backslash: 93, Comma: 87,
  KeyA: 31, KeyS: 49, KeyP: 46, KeyZ: 56,
  Digit1: 22, Digit9: 30,
  F1: 59, F5: 63,
}
const monaco = { KeyMod, KeyCode } as unknown as Monaco

describe('parseKeybinding', () => {
  it('combines a single modifier with a letter key', () => {
    expect(parseKeybinding('Cmd+Enter', monaco)).toBe(KeyMod.CtrlCmd | KeyCode.Enter)
    expect(parseKeybinding('Ctrl+S', monaco)).toBe(KeyMod.CtrlCmd | KeyCode.KeyS)
  })

  it('combines multiple modifiers', () => {
    expect(parseKeybinding('Ctrl+Shift+P', monaco)).toBe(KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyP)
    expect(parseKeybinding('Cmd+Alt+A', monaco)).toBe(KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KeyA)
  })

  it('treats cmd/ctrl/meta as the same CtrlCmd modifier', () => {
    const expected = KeyMod.CtrlCmd | KeyCode.KeyS
    expect(parseKeybinding('meta+s', monaco)).toBe(expected)
    expect(parseKeybinding('ctrl+s', monaco)).toBe(expected)
    expect(parseKeybinding('cmd+s', monaco)).toBe(expected)
  })

  it('is case-insensitive and tolerant of whitespace', () => {
    expect(parseKeybinding('  CTRL + s ', monaco)).toBe(KeyMod.CtrlCmd | KeyCode.KeyS)
  })

  it('resolves digits, function keys and named keys', () => {
    expect(parseKeybinding('Cmd+1', monaco)).toBe(KeyMod.CtrlCmd | KeyCode.Digit1)
    expect(parseKeybinding('F5', monaco)).toBe(KeyCode.F5)
    expect(parseKeybinding('Cmd+\\', monaco)).toBe(KeyMod.CtrlCmd | KeyCode.Backslash)
  })

  it('returns 0 for an unrecognised key so the caller can drop it', () => {
    expect(parseKeybinding('Cmd+£', monaco)).toBe(0)
    expect(parseKeybinding('Ctrl+nope', monaco)).toBe(0)
  })

  it('resolves the winCtrl modifier', () => {
    expect(parseKeybinding('WinCtrl+S', monaco)).toBe(KeyMod.WinCtrl | KeyCode.KeyS)
  })

  it('returns 0 when no key is present (modifiers only)', () => {
    expect(parseKeybinding('Ctrl', monaco)).toBe(0)
    expect(parseKeybinding('Cmd+Shift', monaco)).toBe(0)
  })
})
