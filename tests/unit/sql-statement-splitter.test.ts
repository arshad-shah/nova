import { describe, it, expect } from 'vitest'
import { splitStatements, isCommentOnly } from '../../shared/sql/statement-splitter'

// The shared single walk both the SDK (text-only) and the renderer (positions)
// splitters are built on. The adapter test files exercise each surface; these
// pin the core's options and helpers directly.

describe('splitStatements (shared core)', () => {
  it('does not break on a newline-before-keyword unless asked to', () => {
    // The SDK surface relies on this default: two keyword-led lines with no
    // semicolon are a single statement.
    expect(splitStatements('SELECT 1\nSELECT 2').map((s) => s.text)).toEqual([
      'SELECT 1\nSELECT 2',
    ])
    expect(
      splitStatements('SELECT 1\nSELECT 2', { splitOnKeywordNewline: true }).map((s) => s.text),
    ).toEqual(['SELECT 1', 'SELECT 2'])
  })

  it('emits 1-based positions with an exclusive end column', () => {
    const [s] = splitStatements('SELECT 1')
    expect(s).toMatchObject({ startLine: 1, startColumn: 1, endLine: 1, text: 'SELECT 1' })
    expect(s.endColumn).toBe(9) // one past the '1'
  })

  it('retains comments but flags comment-only spans via isCommentOnly', () => {
    const stmts = splitStatements('-- lonely\nSELECT 1;\n/* just a note */', {
      splitOnKeywordNewline: true,
    })
    expect(stmts.map((s) => s.text)).toEqual(['-- lonely', 'SELECT 1', '/* just a note */'])
    expect(stmts.map((s) => isCommentOnly(s.text))).toEqual([true, false, true])
  })

  it('isCommentOnly recognises whitespace-and-comment-only text', () => {
    expect(isCommentOnly('   \n-- a\n/* b */  ')).toBe(true)
    expect(isCommentOnly('-- a\nSELECT 1')).toBe(false)
    expect(isCommentOnly('')).toBe(true)
  })
})
