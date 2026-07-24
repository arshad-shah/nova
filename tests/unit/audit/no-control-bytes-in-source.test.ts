// Guard — no tracked source file may contain a raw control byte.
//
// Filed from issue #208. Two TypeScript files carried a literal NUL byte (0x00) where the author meant the escape sequence `\0`:
//
//   src/renderer/src/components/er/metrics.ts        — cache-key separator
//   src/renderer/src/lib/monaco-ai-completion.ts     — fingerprint separator
//
// The intent was sound — a separator byte that cannot collide with content in a
// cache key — but writing it as a raw byte instead of `\0` had a real cost:
// `file(1)` reported both as `data`, and `grep`, ripgrep, `git diff` and every
// grep-based fitness function in this very suite treated them as binary and
// silently skipped them. During the audit that produced #208 both files were
// invisible to roughly a dozen scans. The escape sequence has the identical
// runtime value (`'\0'` is U+0000) and keeps the file text.
//
// This guard fails if any tracked source file contains a control byte, so a
// re-introduced raw byte fails CI at the point of introduction rather than
// quietly disappearing from tooling.
//
// A note on scope, because #208 phrased the rule as "a byte outside the
// printable ASCII range": taken literally that would also reject legitimate
// UTF-8 — `metrics.ts` itself contains a real ellipsis (`…`, U+2026), whose
// encoding is bytes >= 0x80. The actual defect is *control* bytes, not
// multibyte UTF-8, so this scans for C0 controls (0x00–0x1F) other than the
// three whitespace bytes source legitimately uses — tab (0x09), line feed
// (0x0A), carriage return (0x0D) — plus DEL (0x7F). High bytes are left alone
// so UTF-8 content passes.
//
// Enumeration is by `git ls-files` (tracked files only), filtered to a
// text/source extension allowlist so genuinely binary assets (.png, .ico,
// .icns, …) are never scanned.
import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const REPO_ROOT = path.join(__dirname, '..', '..', '..')

// Text/source file kinds we scan. An allowlist (not a denylist) so a new binary
// asset type can never silently opt itself into the scan and trip on its own
// bytes; a new *text* type just needs a one-line addition here.
const TEXT_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.json',
  '.jsonc',
  '.css',
  '.scss',
  '.html',
  '.md',
  '.mdx',
  '.astro',
  '.yml',
  '.yaml',
  '.sh',
  '.sql',
  '.svg',
  '.txt',
  '.tmpl',
  '.plist',
])

// Dotfiles with no extension that are nonetheless text source.
const TEXT_BASENAMES = new Set(['.gitignore', '.nvmrc'])

function isControlByte(b: number): boolean {
  if (b === 0x09 || b === 0x0a || b === 0x0d) return false // tab, LF, CR
  return b < 0x20 || b === 0x7f
}

function trackedTextFiles(): string[] {
  const out = execFileSync('git', ['ls-files', '-z'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
  return out
    .split('\0')
    .filter(Boolean)
    .filter((rel) => {
      const ext = path.extname(rel).toLowerCase()
      const base = path.basename(rel)
      return TEXT_EXTENSIONS.has(ext) || TEXT_BASENAMES.has(base)
    })
}

/** First offending control byte in `buf`, with a 1-based line number, or null. */
function firstControlByte(buf: Buffer): { offset: number; line: number; byte: number } | null {
  let line = 1
  for (let i = 0; i < buf.length; i++) {
    const b = buf[i]
    if (b === 0x0a) line++
    if (isControlByte(b)) return { offset: i, line, byte: b }
  }
  return null
}

describe('no control bytes in tracked source (#208)', () => {
  it('every tracked text/source file is free of raw control bytes', () => {
    const files = trackedTextFiles()
    // Sanity: the enumeration found a plausible amount of source. A near-empty
    // list would mean git changed shape and the guard silently scans nothing.
    expect(files.length).toBeGreaterThan(100)

    const offenders: string[] = []
    for (const rel of files) {
      const buf = fs.readFileSync(path.join(REPO_ROOT, rel))
      const hit = firstControlByte(buf)
      if (hit) {
        offenders.push(
          `${rel}:${hit.line} — control byte 0x${hit.byte
            .toString(16)
            .padStart(2, '0')} at offset ${hit.offset}. ` +
            `Write it as an escape sequence (e.g. '\\0' for NUL, '\\t' for tab) — ` +
            `the runtime value is identical and the file stays text so grep/ripgrep/git can see it.`
        )
      }
    }

    expect(offenders, `Raw control byte(s) in tracked source:\n${offenders.join('\n')}`).toEqual([])
  })
})
