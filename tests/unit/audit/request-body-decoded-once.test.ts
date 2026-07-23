// Architecture guard — pins the invariant documented in CLAUDE.md and beside
// the enforcement point (`readRequestBody` in `src/main/mcp/server.ts`):
//
//   An HTTP request body is assembled by collecting its data chunks as Buffers
//   and decoding ONCE with `Buffer.concat(chunks).toString('utf8')` — never by
//   decoding each chunk and concatenating the strings (`body += chunk` /
//   `body += chunk.toString()`).
//
// Why this matters (the reason, so it survives the rule): a multi-byte UTF-8
// character can straddle a TCP chunk boundary. Decoding each chunk on its own
// turns the split character into U+FFFD, silently corrupting the body once a
// payload is large enough to fragment and its content is non-ASCII — a bug that
// never shows up on small ASCII test inputs and so ships. Per-chunk `+=` also
// undercounts a byte-length size cap, since string `.length` is code units.
//
// Scope: files that read an `http.IncomingMessage` — i.e. request-body
// assemblers. A `'data'` listener on a child-process `stdout`/`stderr` or a
// piped TCP socket is a different concern and is not matched (those files do
// not reference `IncomingMessage`).
//
// Deliberately-planted regression that must turn this red:
//   let body = ''
//   req.on('data', (chunk) => { body += chunk.toString() })
// Introduced against issue #171.
import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const repoRoot = path.join(__dirname, '..', '..', '..')
const MAIN_DIR = path.join(repoRoot, 'src', 'main')

function collectSources(dir: string): string[] {
  const out: string[] = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue
      out.push(...collectSources(full))
    } else if (/\.tsx?$/.test(entry.name)) {
      out.push(full)
    }
  }
  return out
}

/** Strip comments so the doc comment in server.ts — which quotes the naive
 *  `body += chunk.toString()` it deliberately avoids — is not flagged. Blank
 *  out comment characters in place (keeping newlines) so line numbers stay
 *  aligned with the original source for accurate offender reporting. */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/\/\/[^\n]*/g, '')
}

/** Files whose job is to read an HTTP request body. */
function requestBodyFiles(): string[] {
  return collectSources(MAIN_DIR).filter((f) =>
    /\bIncomingMessage\b/.test(fs.readFileSync(f, 'utf-8')),
  )
}

interface Offender {
  file: string
  line: number
  snippet: string
}

/** Detect a `'data'` listener that accumulates the body by string concatenation.
 *
 *  The correct reader pushes Buffers into an array (`chunks.push(chunk)`) and
 *  concatenates once at `'end'`. The anti-pattern is `acc += <chunk>` /
 *  `acc += <chunk>.toString()`, i.e. concatenating the *chunk itself* per
 *  event. A numeric `size += chunk.length` byte counter is legitimate and must
 *  NOT be flagged, so we key on the listener's chunk parameter and exclude a
 *  `.length` (or other numeric member) right-hand side. */
function findPerChunkDecode(relFile: string, source: string): Offender[] {
  const code = stripComments(source)
  const offenders: Offender[] = []
  // Capture the chunk parameter name: `.on('data', (chunk: Buffer) => …)`,
  // `.on('data', chunk => …)`, `.on('data', function (chunk) { … })`.
  const listener =
    /\.on\(\s*['"]data['"]\s*,\s*(?:function\s*)?\(?\s*([A-Za-z_$][\w$]*)/g
  let m: RegExpExecArray | null
  while ((m = listener.exec(code)) !== null) {
    const param = m[1]
    const window = code.slice(m.index, m.index + 260)
    // `acc += chunk` or `acc += chunk.toString(...)`, but not `acc += chunk.length`.
    const concat = new RegExp(
      `\\+=\\s*${param}\\s*(?:\\.toString\\s*\\([^)]*\\))?\\s*(?![.\\w])`,
    )
    // A decode of the chunk anywhere in a `+=` accumulation also counts.
    const decodeConcat = new RegExp(`\\+=[^\\n;]*${param}\\.toString\\s*\\(`)
    if (concat.test(window) || decodeConcat.test(window)) {
      const line = code.slice(0, m.index).split('\n').length
      const rawLine = source.split('\n')[line - 1] ?? ''
      offenders.push({ file: relFile, line, snippet: rawLine.trim() })
    }
  }
  return offenders
}

describe('HTTP request bodies are decoded once, not per chunk', () => {
  const files = requestBodyFiles()

  it('finds the request-body assembler(s) (sanity)', () => {
    // If this drops to zero, the IncomingMessage marker moved and the guard has
    // stopped guarding anything — fail loudly rather than pass vacuously.
    expect(files.length).toBeGreaterThan(0)
  })

  it.each(files.map((f) => path.relative(repoRoot, f)))(
    '%s assembles the body from Buffers, never per-chunk string concat',
    (relFile) => {
      const offenders = findPerChunkDecode(
        relFile,
        fs.readFileSync(path.join(repoRoot, relFile), 'utf-8'),
      )
      expect(
        offenders,
        `Request body must be assembled from Buffer chunks and decoded once ` +
          `with Buffer.concat(chunks).toString('utf8'); a per-chunk ` +
          `\`body += chunk\` corrupts multi-byte characters that straddle a ` +
          `chunk boundary and undercounts a byte-length size cap. Offending ` +
          `site(s):\n` +
          offenders.map((o) => `  ${o.file}:${o.line}  ${o.snippet}`).join('\n') +
          `\nFix: collect chunks into a Buffer[] and use the shared ` +
          `readRequestBody() in src/main/mcp/server.ts (or its Buffer.concat ` +
          `pattern).`,
      ).toEqual([])
    },
  )

  it('the canonical reader still buffers-and-concats (exemplar lock)', () => {
    const server = fs.readFileSync(
      path.join(MAIN_DIR, 'mcp', 'server.ts'),
      'utf-8',
    )
    const code = stripComments(server)
    expect(
      /Buffer\.concat\(\s*chunks\s*\)\.toString\(/.test(code),
      `readRequestBody in src/main/mcp/server.ts must keep decoding the body ` +
        `once via Buffer.concat(chunks).toString(...). If this exemplar ` +
        `regresses to per-chunk decoding, the whole invariant is unenforced.`,
    ).toBe(true)
  })
})
