import { toJSONSchema, z } from 'zod'
import { TOOL_PERMISSION, type ToolPermission } from '@shared/mcp'

const WRITE_KEYWORDS_RE =
  /\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|REPLACE|MERGE|GRANT|REVOKE)\b/i

/**
 * True if the SQL contains a write/DDL statement anywhere. Comments are
 * stripped first so writes can't hide behind `-- ...` or block comments, and a
 * leading `SELECT 1; DROP ...` is caught because we scan the whole string,
 * not just the first keyword. Intentionally conservative — a read that *names*
 * a table like `delete_log`, or calls the `REPLACE()` string function, trips an
 * approval prompt. That false-positive cost is acceptable: the worst case is an
 * extra confirmation, never a silently-executed write. The keyword set is kept
 * identical to the original MCP guard on purpose; tightening it (e.g.
 * `REPLACE\s+INTO`) is a deliberate security change, not a refactor side-effect.
 */
export function isWriteQuery(sql: string): boolean {
  const stripped = sql
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--[^\n]*/g, ' ')
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
