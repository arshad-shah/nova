// Architecture test — pins the rule "the preload bundle stays sandbox-safe".
//
// The renderer is created with `sandbox: true` (src/main/index.ts), so the
// preload runs inside Chromium's sandbox with a *polyfilled* `require` that
// resolves only a handful of modules — `electron` plus a few shims. Ask it for
// a Node builtin and it throws `module not found: node:crypto` while loading,
// which aborts the script BEFORE `contextBridge.exposeInMainWorld` runs. The
// renderer then comes up with no `window.electronAPI` at all: every IPC call
// fails at the bridge, the settings hydrate that dismisses the splash never
// resolves, and the app hangs on the splash screen with nothing anywhere
// saying why.
//
// That is not hypothetical — it shipped. #226 added `import { randomUUID }
// from 'node:crypto'` to mint trace ids in the preload, and nothing caught it:
// TypeScript resolves node builtins fine under the node tsconfig, the bundler
// happily externalises them, and the unit suite runs on Node where
// `node:crypto` imports without complaint. The break only exists at runtime,
// inside the sandbox. So the guard has to be static, and it has to follow the
// import graph — a Node builtin pulled in *transitively* through `@shared/`
// lands in the same bundle and breaks the bridge exactly the same way.
import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const REPO_ROOT = path.resolve(__dirname, '../../..')
const PRELOAD_ENTRY = path.join(REPO_ROOT, 'src/preload/index.ts')

/**
 * What a sandboxed preload may import.
 *
 * `electron` is the point of the file. The rest are the modules Electron's
 * sandboxed `require` shim actually provides — see
 * https://www.electronjs.org/docs/latest/tutorial/sandbox#preload-scripts.
 * Everything else has to be pure TypeScript compiled into the bundle.
 */
const SANDBOX_SAFE_MODULES = new Set(['electron', 'events', 'timers', 'url'])

/** Node builtins, with and without the `node:` prefix. The `node:` form is
 *  matched by prefix so this doesn't need to enumerate the whole stdlib. */
const NODE_BUILTINS = new Set([
  'assert', 'async_hooks', 'buffer', 'child_process', 'cluster', 'console',
  'constants', 'crypto', 'dgram', 'diagnostics_channel', 'dns', 'domain',
  'fs', 'http', 'http2', 'https', 'inspector', 'module', 'net', 'os', 'path',
  'perf_hooks', 'process', 'punycode', 'querystring', 'readline', 'repl',
  'stream', 'string_decoder', 'tls', 'trace_events', 'tty', 'util', 'v8',
  'vm', 'wasi', 'worker_threads', 'zlib',
])

function isNodeBuiltin(specifier: string): boolean {
  if (specifier.startsWith('node:')) return true
  return NODE_BUILTINS.has(specifier)
}

/** Strip comments and string literals so a specifier mentioned in prose (this
 *  rule is documented in the preload's own header) is never read as an import. */
function stripNonCode(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '')
}

interface Import {
  specifier: string
  /** `import type` / `export type` — erased at compile time, so it can name
   *  anything without a single byte reaching the bundle. */
  typeOnly: boolean
  line: number
}

/** Every static import/export-from in a module, with its source line. */
function readImports(file: string): Import[] {
  const code = stripNonCode(fs.readFileSync(file, 'utf8'))
  const lines = code.split('\n')
  const out: Import[] = []
  // `import ... from 'x'`, `import 'x'`, `export ... from 'x'`.
  const re = /(?:^|\s)(import|export)\s+(type\s+)?(?:[\s\S]*?\sfrom\s+)?['"]([^'"]+)['"]/g
  let m: RegExpExecArray | null
  while ((m = re.exec(code)) !== null) {
    const head = code.slice(m.index, m.index + m[0].length)
    out.push({
      specifier: m[3],
      // Either `import type { X }` or an all-inline-type clause `{ type A }`.
      typeOnly: Boolean(m[2]) || /\{\s*type\s/.test(head),
      line: lines.findIndex((_, i) =>
        code.split('\n').slice(0, i + 1).join('\n').length >= m!.index) + 1,
    })
  }
  return out
}

/** Resolve a relative or `@shared/*` specifier to a file on disk. */
function resolveLocal(specifier: string, fromFile: string): string | null {
  let base: string
  if (specifier.startsWith('@shared/')) {
    base = path.join(REPO_ROOT, 'shared', specifier.slice('@shared/'.length))
  } else if (specifier.startsWith('.')) {
    base = path.resolve(path.dirname(fromFile), specifier)
  } else {
    return null
  }
  for (const candidate of [`${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts')]) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate
  }
  return null
}

interface Violation {
  file: string
  line: number
  specifier: string
  /** How the entry reaches this module — the whole point when the offender is
   *  a shared module three hops away rather than the preload itself. */
  chain: string[]
}

/** Walk everything that ends up in the preload bundle, entry first. */
function collectViolations(entry: string): { violations: Violation[]; visited: string[] } {
  const violations: Violation[] = []
  const visited = new Set<string>()
  const walk = (file: string, chain: string[]): void => {
    if (visited.has(file)) return
    visited.add(file)
    for (const imp of readImports(file)) {
      // Type-only imports are erased before the bundle exists.
      if (imp.typeOnly) continue
      if (isNodeBuiltin(imp.specifier)) {
        const bare = imp.specifier.replace(/^node:/, '')
        if (!SANDBOX_SAFE_MODULES.has(bare)) {
          violations.push({
            file: path.relative(REPO_ROOT, file),
            line: imp.line,
            specifier: imp.specifier,
            chain: chain.map(c => path.relative(REPO_ROOT, c)),
          })
        }
        continue
      }
      const resolved = resolveLocal(imp.specifier, file)
      if (resolved) walk(resolved, [...chain, file])
    }
  }
  walk(entry, [])
  return { violations, visited: [...visited] }
}

describe('architecture — the preload bundle stays sandbox-safe', () => {
  const { violations, visited } = collectViolations(PRELOAD_ENTRY)

  it('imports no Node builtin the sandboxed require cannot resolve', () => {
    const report = violations
      .map(v => {
        const via = v.chain.length > 0
          ? `\n      pulled into the bundle by ${v.chain.join(' → ')}`
          : ''
        return `  ${v.file}:${v.line} imports "${v.specifier}"${via}`
      })
      .join('\n')

    expect(
      violations,
      violations.length === 0 ? '' :
      `The preload bundle imports a Node builtin. It runs with sandbox: true, ` +
      `so that throws "module not found" at load, contextBridge.exposeInMainWorld ` +
      `never runs, and the app boots with no window.electronAPI — it hangs on ` +
      `the splash screen.\n\n${report}\n\n` +
      `Fix: use the web-platform equivalent (globalThis.crypto for randomness, ` +
      `TextEncoder/TextDecoder for encoding), or move the work to the main ` +
      `process behind an IPC channel. If it is genuinely types-only, make it an ` +
      `\`import type\`. See shared/trace.ts#newTraceId for the pattern.`,
    ).toEqual([])
  })

  it('actually walked past the entry file into shared/ (the guard is not a no-op)', () => {
    // If resolution silently broke, `visited` would be just the entry and the
    // transitive half of this rule would pass vacuously.
    expect(visited.length).toBeGreaterThan(1)
    expect(visited.some(f => f.includes(`${path.sep}shared${path.sep}`))).toBe(true)
  })
})
