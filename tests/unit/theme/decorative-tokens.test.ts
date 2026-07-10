import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const ROOT = path.join(__dirname, '..', '..', '..')
const TOKENS = path.join(ROOT, 'src', 'renderer', 'src', 'primitives', 'theme', 'tokens.css')
const THEMES = path.join(ROOT, 'src', 'main', 'plugins', 'bundled', 'core-themes', 'themes-data.ts')

// Tokens every theme must define; the decorative ramp derives from these.
const SOURCE_TOKENS = [
  '--color-accent',
  '--color-accent-emphasis',
  '--color-success',
  '--color-warning',
  '--color-error',
]

describe('decorative token ramp', () => {
  it('declares 8 decorative tokens in base tokens.css', () => {
    const css = fs.readFileSync(TOKENS, 'utf-8')
    for (let i = 1; i <= 8; i++) {
      expect(css, `missing --color-decorative-${i}`).toContain(`--color-decorative-${i}:`)
    }
  })

  it('every *_CSS theme block defines all source tokens', () => {
    const src = fs.readFileSync(THEMES, 'utf-8')
    // Each theme is a `const XXX_CSS = \`...\`` template literal.
    const blocks = [...src.matchAll(/const\s+(\w+_CSS)\s*=\s*`([\s\S]*?)`/g)]
    expect(blocks.length, 'found no *_CSS theme blocks').toBeGreaterThan(5)
    for (const [, name, body] of blocks) {
      for (const token of SOURCE_TOKENS) {
        expect(body.includes(`${token}:`), `${name} is missing ${token}`).toBe(true)
      }
    }
  })
})
