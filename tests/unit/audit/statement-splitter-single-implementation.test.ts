import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs'
import path from 'node:path'

/**
 * Guardrail — there is exactly ONE SQL statement splitter.
 *
 * The codebase used to carry two independently hand-written `splitSqlStatements`
 * tokenisers — `src/main/plugins/sdk/sql-statements.ts` (returning `string[]`)
 * and `src/renderer/src/lib/statement-contributions/sql.ts` (returning
 * `Statement[]` with positions). They were not an interface and an
 * implementation; they were two walks that disagreed about what a statement is:
 * comment retention, backtick quoting, `''` doubling vs `\'` escapes, and
 * newline-before-keyword splitting. "Run statement 2" (renderer splitter) and
 * the SQL importer (SDK splitter) could operate on different text for the same
 * buffer, and the SDK walk silently deleted comments.
 *
 * The single walk now lives in `shared/sql/statement-splitter.ts`; both surfaces
 * are thin adapters over it. A second hand-rolled tokeniser is easy to add by
 * accident — a `;`-splitting loop that also skips strings and comments is a
 * natural thing to reach for. This test fails if one appears.
 */

const ROOTS = [
  path.join(process.cwd(), 'shared'),
  path.join(process.cwd(), 'src', 'main'),
  path.join(process.cwd(), 'src', 'renderer', 'src'),
]

/** The one module allowed to walk SQL statement boundaries. */
const CORE_MODULE = path.join(process.cwd(), 'shared', 'sql', 'statement-splitter.ts')

function walk(dir: string): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry)
    if (statSync(full).isDirectory()) return walk(full)
    return /\.(ts|tsx)$/.test(full) && !/\.(stories|test)\.tsx?$/.test(full) ? [full] : []
  })
}

const sourceFiles = ROOTS.flatMap(walk)
const rel = (p: string) => path.relative(process.cwd(), p)

/**
 * The fingerprint of a hand-rolled SQL statement tokeniser: a character walk
 * that splits on a top-level `;`, skips block comments (matching on `*`), and
 * skips single-quoted strings. Any file with all three is walking statement
 * boundaries itself instead of calling the shared splitter. Requiring the
 * co-occurrence keeps ordinary SQL string-building (which uses at most one of
 * these) from tripping the guard.
 */
const FINGERPRINTS = [
  /===\s*';'/, // semicolon split
  /===\s*'\*'/, // block-comment scan
  /===\s*"'"/, // single-quoted string scan
]

function isTokeniser(file: string): boolean {
  const src = readFileSync(file, 'utf8')
  return FINGERPRINTS.every((re) => re.test(src))
}

describe('guardrail — one statement splitter', () => {
  it('the shared core splitter exists', () => {
    // A rename/move of the core must fail loudly here (and prompt updating this
    // guard) rather than leaving the "only one implementation" claim vacuously
    // true because nothing matches the fingerprint any more.
    expect(existsSync(CORE_MODULE)).toBe(true)
    expect(isTokeniser(CORE_MODULE)).toBe(true)
  })

  it('no file outside the core module hand-rolls a statement tokeniser', () => {
    // Compose `splitStatements` from `@shared/sql/statement-splitter` instead of
    // writing another `;`-splitting walk. It already handles strings (with `''`
    // doubling and `\'` escapes), backticks, `--`/`/* */` comments (retained in
    // the emitted text), newline-before-keyword breaks, and dollar quoting.
    const offenders = sourceFiles
      .filter((f) => path.resolve(f) !== path.resolve(CORE_MODULE))
      .filter(isTokeniser)
      .map(rel)

    expect(offenders).toEqual([])
  })
})
