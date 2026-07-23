// Architecture guard — pins the invariant documented in CLAUDE.md and beside
// the enforcement point (`src/main/plugins/sdk/driver-validation.ts`):
//
//   A driver's feature availability is established by DECLARED, serializable
//   `DriverCapabilities` data (`session`, `explain`, …) — never by reflecting
//   over a `DbAdapter` to see which methods it happens to implement. The
//   renderer gates its UI on the declaration; the factory validates that the
//   declaration and the implementation agree at construction time
//   (driver-capability-agreement.test.ts, #168). Detecting a capability by
//   probing the adapter would route around both, so the two could silently
//   drift again — a capability inferred from a method, not from the contract.
//
// Why this matters (the reason, so it survives the rule): capabilities cross an
// IPC boundary as function-free data precisely so a capability is a *fact the
// driver states*, not a *shape the glue guesses*. Once one call site decides
// "this driver can explain" from `typeof adapter.parseQueryPlan === 'function'`,
// the declaration stops being load-bearing and the renderer/glue can disagree
// with what the driver actually advertised.
//
// The sanctioned patterns are unaffected:
//   • The renderer/glue reads `capabilities.session` / `capabilities.explain`.
//   • An optional adapter method is invoked behind an inline call-guard —
//     `if (adapter.commit) await adapter.commit(id)` — which is invocation
//     safety, not capability *detection*. This guard forbids only the
//     reflection idioms that compute an availability fact:
//       typeof adapter.<m> === 'function' | '<m>' in adapter
//       Object.getOwnPropertyNames(adapter) | Reflect.ownKeys(adapter)
//
// Deliberately-planted regressions that must turn this red:
//   const canExplain = typeof adapter.parseQueryPlan === 'function'
//   const canTxn = 'beginTransaction' in adapter
// Introduced against issue #171.
import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import {
  TRANSACTIONAL_METHODS,
  EXPLAIN_TREE_METHODS,
} from '../../../src/main/plugins/sdk/driver-validation'

const repoRoot = path.join(__dirname, '..', '..', '..')

// The capability-linked optional DbAdapter methods, sourced from the same
// authority the factory validates against — so this guard and the agreement
// check can never disagree about which methods a capability promises.
const CAPABILITY_METHODS: readonly string[] = [
  ...TRANSACTIONAL_METHODS,
  ...EXPLAIN_TREE_METHODS,
]

/** Recursively collect .ts/.tsx sources under a directory. */
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

/** Strip comments so the invariant's own documentation (which names the
 *  forbidden idioms) is never mistaken for a violation. Blank comment
 *  characters in place (keeping newlines) so line numbers stay aligned with
 *  the original source. */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/\/\/[^\n]*/g, '')
}

interface Offender {
  file: string
  line: number
  snippet: string
}

/** Find reflection-based capability *detection* over an adapter. */
function findProbes(relFile: string, source: string): Offender[] {
  const code = stripComments(source)
  const methodAlt = CAPABILITY_METHODS.join('|')
  // typeof <expr>.<capabilityMethod> === 'function'  (and !==)
  const typeofProbe = new RegExp(
    `typeof\\s+[\\w.]*\\.(?:${methodAlt})\\s*[!=]==\\s*['"]function['"]`,
  )
  // '<capabilityMethod>' in <expr>
  const inProbe = new RegExp(`['"](?:${methodAlt})['"]\\s+in\\s+\\w`)
  // Reflection over anything named like an adapter.
  const reflectProbe =
    /(?:Object\.getOwnPropertyNames|Reflect\.ownKeys)\s*\(\s*\w*[Aa]dapter\w*/
  const offenders: Offender[] = []
  source.split('\n').forEach((rawLine, idx) => {
    const line = stripComments(rawLine)
    if (typeofProbe.test(line) || inProbe.test(line) || reflectProbe.test(line)) {
      offenders.push({ file: relFile, line: idx + 1, snippet: rawLine.trim() })
    }
  })
  // Guard against a probe split across lines (comment-stripped, whole-file).
  if (
    offenders.length === 0 &&
    (typeofProbe.test(code) || inProbe.test(code) || reflectProbe.test(code))
  ) {
    offenders.push({ file: relFile, line: 0, snippet: '(multi-line probe)' })
  }
  return offenders
}

describe('capability availability comes from declared data, not adapter probing', () => {
  const roots = ['src/main', 'src/renderer/src'].map((r) => path.join(repoRoot, r))
  const files = roots.flatMap((root) =>
    fs.existsSync(root) ? collectSources(root) : [],
  )

  it('finds sources to scan (sanity)', () => {
    expect(files.length).toBeGreaterThan(0)
  })

  it('has capability methods to guard (sanity)', () => {
    expect(CAPABILITY_METHODS.length).toBeGreaterThan(0)
    expect(CAPABILITY_METHODS).toContain('parseQueryPlan')
    expect(CAPABILITY_METHODS).toContain('beginTransaction')
  })

  it('no reflection-based capability detection over a DbAdapter', () => {
    const offenders = files.flatMap((file) =>
      findProbes(path.relative(repoRoot, file), fs.readFileSync(file, 'utf-8')),
    )
    expect(
      offenders,
      `Capability availability must be read from declared DriverCapabilities ` +
        `(capabilities.session / capabilities.explain), never detected by ` +
        `reflecting over an adapter method. Offending site(s):\n` +
        offenders.map((o) => `  ${o.file}:${o.line}  ${o.snippet}`).join('\n') +
        `\nFix: gate on the declared capability instead of ` +
        `typeof adapter.<m> === 'function' / '<m>' in adapter. An optional ` +
        `method may still be invoked behind an inline guard ` +
        `(if (adapter.commit) await adapter.commit(id)); that is invocation ` +
        `safety, not capability detection.`,
    ).toEqual([])
  })
})
