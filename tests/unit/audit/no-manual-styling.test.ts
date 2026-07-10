// Guardrail — appearance is theme-owned. Component source under
// src/renderer/src/components must not hardcode color/appearance. Colors come
// from semantic token classes (text-success, bg-bg-tertiary, ...) or CSS vars
// (var(--color-*)); never raw hex, raw Tailwind palette scales, or arbitrary
// color values. Static-appearance inline styles are banned; dynamic runtime
// values (width: size, transform, marginLeft) are fine.
//
// Sanctioned escapes live in ALLOWLIST, each with a reason.
import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const COMPONENTS = path.join(
  __dirname, '..', '..', '..',
  'src', 'renderer', 'src', 'components',
)

// Files permitted to contain a raw color literal, with justification.
const ALLOWLIST = new Set<string>([
  // User-data default: the hex the connection color picker edits. Centralized
  // constant, not a theme concern. (Task 7)
  // NOTE: connection-color.ts lives under lib/, not components/, so it is not
  // scanned — listed here for the record only.
  //
  // Theme-preview fallback shown only when a theme omits `preview`. (Task 8)
  path.join(COMPONENTS, 'settings', 'categories', 'AppearanceSettings.tsx'),
])

// Raw 3/6/8-digit hex color literal.
const RAW_HEX = /#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3}(?:[0-9a-fA-F]{2})?)?\b/
// Raw Tailwind palette scale, e.g. bg-red-500, from-purple-600, text-gray-400.
const PALETTE_CLASS = /\b(?:bg|text|border|ring|from|to|via|fill|stroke)-(?:gray|red|blue|green|zinc|slate|neutral|stone|yellow|amber|emerald|indigo|purple|orange|sky|rose|teal|cyan|violet|pink|lime|fuchsia)-[0-9]{2,3}\b/
// Arbitrary Tailwind color value, e.g. bg-[#e81123], text-[#ff8c6b].
const ARBITRARY_COLOR = /\b(?:bg|text|border|ring|fill|stroke)-\[#[0-9a-fA-F]{3,8}\]/

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(p, out)
    else if (entry.isFile() && p.endsWith('.tsx') && !p.endsWith('.stories.tsx')) out.push(p)
  }
  return out
}

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
}

describe('guardrail — components carry no manual styling', () => {
  const files = walk(COMPONENTS)

  it('finds a representative number of component files (sanity)', () => {
    expect(files.length).toBeGreaterThan(50)
  })

  it.each(files)('%s uses tokens, not raw color literals', (file) => {
    if (ALLOWLIST.has(file)) return
    const src = stripComments(fs.readFileSync(file, 'utf-8'))
    const offenders: string[] = []
    for (const re of [RAW_HEX, PALETTE_CLASS, ARBITRARY_COLOR]) {
      const m = src.match(re)
      if (m) offenders.push(m[0])
    }
    expect(
      offenders,
      `Manual styling found — use a semantic token class or var(--color-*): ${offenders.join(', ')}`,
    ).toEqual([])
  })
})
