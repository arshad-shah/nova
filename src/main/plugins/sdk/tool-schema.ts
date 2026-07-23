import { toJSONSchema, z } from 'zod'
import { TOOL_PERMISSION, type ToolPermission } from '@shared/mcp'

const WRITE_KEYWORDS_RE =
  /\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|REPLACE|MERGE|GRANT|REVOKE)\b/i

/**
 * If `sql` at index `i` begins a Postgres dollar-quote delimiter (`$$` or
 * `$tag$`), return the full delimiter (so the caller can find its twin);
 * otherwise `null`. A tag may not start with a digit, which is what
 * distinguishes a dollar-quote open from a parameter placeholder like `$1`.
 */
function readDollarTag(sql: string, i: number): string | null {
  if (sql[i] !== '$') return null
  let j = i + 1
  while (j < sql.length && /[A-Za-z0-9_]/.test(sql[j])) {
    if (j === i + 1 && /[0-9]/.test(sql[j])) return null // $1, $2 — placeholder
    j++
  }
  return sql[j] === '$' ? sql.slice(i, j + 1) : null
}

/**
 * Strip SQL comments in a way that respects string/identifier literals, so a
 * comment marker *inside* a quoted region is treated as data, not as an opening
 * comment. Returns the comment-stripped SQL, or `null` when the input cannot be
 * confidently tokenised (an unterminated quote or an unbalanced block comment).
 *
 * The previous implementation stripped comments with two regexes that had no
 * awareness of string literals, so a block- or line-comment marker inside a
 * string opened a phantom comment and everything up to the next close marker —
 * including a trailing write — was deleted before the keyword scan. That let
 * writes slip past the approval gate on both the MCP and AI surfaces.
 *
 * String/identifier contents are preserved verbatim; only comments are removed.
 * A keyword that merely appears inside a string therefore still trips the
 * conservative write check, which is the intended, safe direction: strings are
 * kept maximally (doubled-quote and backslash escapes extend them) so we never
 * exit a literal early and mistake its data for a comment.
 */
function stripSqlComments(sql: string): string | null {
  let out = ''
  let i = 0
  const n = sql.length
  while (i < n) {
    const c = sql[i]
    // Line comment: -- ... to end of line
    if (c === '-' && sql[i + 1] === '-') {
      out += ' '
      i += 2
      while (i < n && sql[i] !== '\n') i++
      continue
    }
    // Block comment: /* ... */ — unbalanced means fail closed
    if (c === '/' && sql[i + 1] === '*') {
      const end = sql.indexOf('*/', i + 2)
      if (end === -1) return null
      out += ' '
      i = end + 2
      continue
    }
    // Single/double/backtick quoted literal or identifier
    if (c === "'" || c === '"' || c === '`') {
      out += c
      i++
      let closed = false
      while (i < n) {
        const q = sql[i]
        // backslash escape (MySQL / non-standard-conforming strings) — skip next
        if (q === '\\' && (c === "'" || c === '"')) {
          out += q
          if (i + 1 < n) out += sql[i + 1]
          i += 2
          continue
        }
        if (q === c) {
          if (sql[i + 1] === c) {
            // doubled delimiter escapes it and stays inside the literal
            out += q + q
            i += 2
            continue
          }
          out += q
          i++
          closed = true
          break
        }
        out += q
        i++
      }
      if (!closed) return null
      continue
    }
    // Postgres dollar-quoted string: $tag$ ... $tag$
    if (c === '$') {
      const tag = readDollarTag(sql, i)
      if (tag !== null) {
        const close = sql.indexOf(tag, i + tag.length)
        if (close === -1) return null
        out += sql.slice(i, close + tag.length)
        i = close + tag.length
        continue
      }
    }
    out += c
    i++
  }
  return out
}

/**
 * True if the SQL contains a write/DDL statement anywhere. Comments are
 * stripped first (via a string-aware scan, so a `--` or `/*` inside a quoted
 * literal is data, not a comment) so writes can't hide behind `-- ...` or block
 * comments, and a leading `SELECT 1; DROP ...` is caught because we scan the
 * whole string, not just the first keyword. Intentionally conservative — a read
 * that *names* a table like `delete_log`, or calls the `REPLACE()` string
 * function, trips an approval prompt. That false-positive cost is acceptable:
 * the worst case is an extra confirmation, never a silently-executed write. Any
 * input the scan can't confidently tokenise (unterminated quote, unbalanced
 * block comment) is treated as a write for the same reason — fail closed. The
 * keyword set is kept identical to the original MCP guard on purpose; tightening
 * it (e.g. `REPLACE\s+INTO`) is a deliberate security change, not a refactor
 * side-effect.
 */
export function isWriteQuery(sql: string): boolean {
  const stripped = stripSqlComments(sql)
  if (stripped === null) return true // fail closed on ambiguous input
  return WRITE_KEYWORDS_RE.test(stripped)
}

/**
 * Single source of truth for "does this tool call perform a write?" — shared
 * by the AI permission manager and the MCP server so the two surfaces can't
 * drift (they previously each re-implemented this, which is how the MCP
 * explain-write guard ended up missing on the AI side). A call is a write when
 * its effective permission is `write`, OR when it's a read tool whose `sql`
 * argument is itself a write/DDL statement.
 *
 * `effectivePermission` is the caller's already-resolved permission (after any
 * per-tool override), so the shared rule stays agnostic to where overrides live.
 */
export function isWriteToolCall(
  effectivePermission: ToolPermission,
  params: Record<string, unknown> | undefined,
): boolean {
  if (effectivePermission === TOOL_PERMISSION.WRITE) return true
  const sql = params && typeof params.sql === 'string' ? params.sql : ''
  return sql ? isWriteQuery(sql) : false
}

export interface JsonSchemaObject {
  type?: string
  properties?: Record<string, unknown>
  required?: string[]
  [k: string]: unknown
}

/** Derive a JSON Schema (for LLM tool definitions) from a Zod object schema. */
export function toJsonSchema(schema: z.ZodTypeAny): JsonSchemaObject {
  return toJSONSchema(schema) as JsonSchemaObject
}

/**
 * Rebuild a Zod raw shape from a JSON Schema object. Tools now carry their
 * `inputSchema` as serializable JSON Schema (so it can cross the
 * process-isolation boundary), but the MCP SDK's high-level tool registration
 * still wants a `ZodRawShape`. This reconstructs an equivalent shape for that
 * boundary. It covers the JSON Schema subset tool inputs use (objects of
 * string/number/integer/boolean/array/enum, `required`, and `description`);
 * anything it doesn't recognise becomes `z.unknown()`, which keeps validation
 * permissive rather than rejecting valid input.
 */
export function jsonSchemaToZodShape(schema: JsonSchemaObject): z.ZodRawShape {
  const required = new Set(schema.required ?? [])
  const shape: Record<string, z.ZodTypeAny> = {}
  const props = (schema.properties ?? {}) as Record<string, Record<string, unknown>>
  for (const [key, prop] of Object.entries(props)) {
    let zod = jsonSchemaPropToZod(prop)
    if (typeof prop.description === 'string') zod = zod.describe(prop.description)
    if (!required.has(key)) zod = zod.optional()
    shape[key] = zod
  }
  return shape
}

function jsonSchemaPropToZod(prop: Record<string, unknown>): z.ZodTypeAny {
  if (Array.isArray(prop.enum) && prop.enum.every((v) => typeof v === 'string')) {
    return z.enum(prop.enum as [string, ...string[]])
  }
  switch (prop.type) {
    case 'string':
      return z.string()
    case 'number':
    case 'integer':
      return z.number()
    case 'boolean':
      return z.boolean()
    case 'array': {
      const items = prop.items as Record<string, unknown> | undefined
      return z.array(items ? jsonSchemaPropToZod(items) : z.unknown())
    }
    case 'object':
      return z.record(z.string(), z.unknown())
    default:
      return z.unknown()
  }
}
