// The one SQL statement splitter.
//
// There used to be two independently hand-written `splitSqlStatements`
// tokenisers — one in the SDK (`string[]`) and one in the renderer
// (`Statement[]` with positions) — that disagreed about what a statement is
// (comment retention, backtick quoting, backslash vs doubled escapes, newline
// splitting). "Run statement 2" and "Format" could operate on different text
// for the same buffer. This is the single walk both surfaces are built on, so
// they cannot drift again. The `statement-splitter-single-implementation`
// fitness function fails the build if a second tokeniser appears.
//
// Lives in `shared/` because the two consumers straddle the process boundary:
// the SDK runs in main, the statement gutter in the renderer. The walk is pure
// and dependency-free so both can import it.

/** A statement located in the source: its trimmed text plus 1-based
 *  line/column span (start inclusive, end exclusive of the trailing char). */
export interface SplitStatement {
  startLine: number
  startColumn: number
  endLine: number
  endColumn: number
  /** Statement text, trimmed. Comments inside the span are retained. */
  text: string
}

export interface SplitOptions {
  /** Also break when a newline's next non-whitespace token is a statement
   *  keyword (so a missing `;` still delimits). The gutter surface wants this;
   *  the SDK text splitter does not. Off by default. */
  splitOnKeywordNewline?: boolean
  /** Recognise Postgres dollar-quoted bodies (`$$…$$`, `$tag$…$tag$`) so a `;`
   *  inside a function body does not split the statement. Gated by the driver's
   *  `supportsDollarQuoting` capability. Off by default. */
  dollarQuoting?: boolean
}

/** Keywords that, at the start of a line, begin a new statement — used only
 *  when `splitOnKeywordNewline` is set. */
const STATEMENT_KEYWORDS = new Set([
  'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'WITH', 'CREATE', 'ALTER', 'DROP',
  'TRUNCATE', 'EXPLAIN', 'BEGIN', 'COMMIT', 'ROLLBACK', 'GRANT', 'REVOKE',
  'SHOW', 'USE', 'VACUUM', 'ANALYZE', 'SET',
])

interface Pos { line: number; col: number }

/**
 * Walk the source once and emit its top-level statements.
 *
 * Recognises — so their contents never trigger a split — single/double/backtick
 * quoted strings (with both `''` doubling and `\'` backslash escapes), `--`
 * line comments, `/* *​/` block comments, and (when enabled) `$tag$` dollar
 * quoting. Comment and string text is preserved in the emitted statement.
 * Empty / whitespace-only segments are dropped.
 */
export function splitStatements(source: string, options: SplitOptions = {}): SplitStatement[] {
  const { splitOnKeywordNewline = false, dollarQuoting = false } = options
  const out: SplitStatement[] = []
  let i = 0
  let line = 1
  let col = 1
  let stmtStart = 0
  let stmtStartLine = 1
  let stmtStartCol = 1

  const flush = (endExclusive: number) => {
    const text = source.slice(stmtStart, endExclusive)
    const trimmed = text.trim()
    if (!trimmed) return
    const lead = text.length - text.trimStart().length
    const trail = text.length - text.trimEnd().length
    const start = advancePos(source, stmtStart, stmtStartLine, stmtStartCol, lead)
    const end = advancePos(source, stmtStart, stmtStartLine, stmtStartCol, text.length - trail)
    out.push({
      startLine: start.line,
      startColumn: start.col,
      endLine: end.line,
      endColumn: end.col,
      text: trimmed,
    })
  }

  const setStart = (idx: number, l: number, c: number) => {
    stmtStart = idx
    stmtStartLine = l
    stmtStartCol = c
  }

  while (i < source.length) {
    const c = source[i]
    const next = source[i + 1]

    if (c === '\n') {
      if (splitOnKeywordNewline) {
        // Look ahead past whitespace for a statement keyword.
        let j = i + 1
        let jCol = 1
        while (j < source.length && (source[j] === ' ' || source[j] === '\t')) { j++; jCol++ }
        if (j < source.length && isKeywordStart(source, j)) {
          flush(i)
          line++; col = 1
          i++
          while (i < j) { i++; col++ }
          setStart(j, line, jCol)
          continue
        }
      }
      line++; col = 1; i++; continue
    }
    if (c === '-' && next === '-') {
      while (i < source.length && source[i] !== '\n') { i++; col++ }
      continue
    }
    if (c === '/' && next === '*') {
      i += 2; col += 2
      while (i < source.length && !(source[i] === '*' && source[i + 1] === '/')) {
        if (source[i] === '\n') { line++; col = 1 } else { col++ }
        i++
      }
      if (i < source.length) { i += 2; col += 2 }
      continue
    }
    if (dollarQuoting && c === '$') {
      const tag = dollarTag(source, i)
      if (tag !== null) {
        const close = source.indexOf(tag, i + tag.length)
        const regionEnd = close === -1 ? source.length : close + tag.length
        while (i < regionEnd) {
          if (source[i] === '\n') { line++; col = 1 } else { col++ }
          i++
        }
        continue
      }
    }
    if (c === "'" || c === '"' || c === '`') {
      const quote = c
      i++; col++
      while (i < source.length) {
        if (source[i] === '\\' && source[i + 1] === quote) { i += 2; col += 2; continue }
        if (source[i] === quote && source[i + 1] === quote) { i += 2; col += 2; continue }
        if (source[i] === quote) { i++; col++; break }
        if (source[i] === '\n') { line++; col = 1 } else { col++ }
        i++
      }
      continue
    }
    if (c === ';') {
      flush(i)
      i++; col++
      while (i < source.length && (source[i] === ' ' || source[i] === '\t')) { i++; col++ }
      if (source[i] === '\n') { i++; line++; col = 1 }
      setStart(i, line, col)
      continue
    }
    i++; col++
  }
  flush(source.length)
  return out
}

/**
 * If a `$` at `from` opens a Postgres dollar-quote tag (`$$` or `$name$`),
 * return the full tag text (e.g. `"$$"`, `"$body$"`); otherwise null. A tag is
 * `$`, an optional identifier (letter/underscore then letters/digits/
 * underscores — never starting with a digit, so `$1` parameters are not tags),
 * then a closing `$`.
 */
function dollarTag(source: string, from: number): string | null {
  let j = from + 1
  if (source[j] !== '$') {
    if (!/[A-Za-z_]/.test(source[j] ?? '')) return null
    j++
    while (j < source.length && /[A-Za-z0-9_]/.test(source[j])) j++
    if (source[j] !== '$') return null
  }
  return source.slice(from, j + 1)
}

function isKeywordStart(source: string, from: number): boolean {
  let end = from
  while (end < source.length && /[A-Za-z]/.test(source[end])) end++
  const word = source.slice(from, end).toUpperCase()
  return STATEMENT_KEYWORDS.has(word)
}

function advancePos(source: string, baseIdx: number, baseLine: number, baseCol: number, offset: number): Pos {
  let line = baseLine
  let col = baseCol
  for (let k = 0; k < offset; k++) {
    if (source[baseIdx + k] === '\n') { line++; col = 1 } else { col++ }
  }
  return { line, col }
}

/**
 * True when the text contains nothing but SQL comments + whitespace. Run/Explain
 * shouldn't render above a comment block, and the SQL importer shouldn't ship a
 * comment-only "statement" to the driver — both filter these out.
 */
export function isCommentOnly(text: string): boolean {
  const noBlock = text.replace(/\/\*[\s\S]*?\*\//g, '')
  const noLine = noBlock.replace(/--[^\n]*/g, '')
  return noLine.trim().length === 0
}
