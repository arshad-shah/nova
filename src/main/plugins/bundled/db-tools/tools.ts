import { z } from 'zod'
import type { Tool, ToolContext, ToolResult } from '../../sdk/types'
import type { SchemaAccess, ConnectionAccess } from '../../sdk/types'
import { TOOL_PERMISSION } from '../../sdk/types'
import { toJsonSchema } from '../../sdk/tool-schema'
import { ACTIVITY_KIND, type ActivityEntry, type ActivityKind, type ActivityQuery } from '@shared/activity'

/** Minimal read view of the app activity log (provided by the host as the
 *  `activity-log` service). */
export interface ActivityReaderLike {
  list(query?: ActivityQuery): ActivityEntry[]
}

const ACTIVITY_KINDS = [
  ACTIVITY_KIND.QUERY,
  ACTIVITY_KIND.TOOL_CALL,
  ACTIVITY_KIND.CONNECTION,
  ACTIVITY_KIND.NOTIFICATION,
  ACTIVITY_KIND.NETWORK,
] as const

/**
 * A read-only tool that lets an agent (AI chat or MCP client) observe what's
 * happening in the app: queries the app ran, agent tool calls, connection
 * events and notifications. Shared across both surfaces (`surfaces` unset).
 */
export function createActivityTool(reader: ActivityReaderLike): Tool {
  return {
    id: 'get_app_activity',
    name: 'Get App Activity',
    description:
      'Read the recent Verql activity log to see what has been happening in the app: SQL queries it ran (with durations, row counts and errors), agent tool calls, connection events, and user notifications. Read-only.',
    inputSchema: toJsonSchema(
      z.object({
        kinds: z.array(z.enum(ACTIVITY_KINDS)).optional().describe('Restrict to these activity kinds'),
        limit: z.number().optional().describe('Max entries, most recent first (default 50, max 500)'),
      }),
    ),
    permission: TOOL_PERMISSION.READ,
    async execute(params: Record<string, unknown>): Promise<ToolResult> {
      const limit = typeof params.limit === 'number' && params.limit > 0 ? Math.min(params.limit, 500) : 50
      const kinds = Array.isArray(params.kinds) ? (params.kinds as ActivityKind[]) : undefined
      const entries = reader.list({ kinds, limit })
      return {
        success: true,
        data: entries,
        display: `${entries.length} activity ${entries.length === 1 ? 'entry' : 'entries'}`,
      }
    },
  }
}

function noConn(): ToolResult {
  return { success: false, data: null, display: 'No active database connection in Verql' }
}

/**
 * Wraps a query in race against the tool's abort signal. If the signal aborts
 * mid-query we ask the connection's adapter to cancel; the promise still
 * settles with a rejected sentinel that callers turn into a tool-result.
 */
async function withCancellation<T>(
  connections: ConnectionAccess,
  ctx: ToolContext,
  run: () => Promise<T>,
): Promise<T> {
  if (ctx.abortSignal.aborted) throw new Error('Cancelled')
  let onAbort: (() => void) | undefined
  try {
    return await new Promise<T>((resolve, reject) => {
      onAbort = () => {
        if (ctx.connectionId) connections.cancelQuery(ctx.connectionId)
        reject(new Error('Cancelled'))
      }
      ctx.abortSignal.addEventListener('abort', onAbort)
      run().then(resolve, reject)
    })
  } finally {
    if (onAbort) ctx.abortSignal.removeEventListener('abort', onAbort)
  }
}

/**
 * The canonical database tools. `getMaxRows` is read per-call so the row cap
 * tracks the live MCP setting without re-creating the tools.
 */
export function createDbTools(
  schema: SchemaAccess,
  connections: ConnectionAccess,
  getMaxRows: () => number
): Tool[] {
  return [
    {
      id: 'query',
      name: 'Run Query',
      description: 'Execute a SQL query against the active database connection. Use this to read data, insert, update, or delete records.',
      inputSchema: toJsonSchema(z.object({ sql: z.string().describe('The SQL query to execute') })),
      permission: TOOL_PERMISSION.WRITE,
      async execute(params: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
        if (!ctx.connectionId) return noConn()
        const result = await withCancellation(connections, ctx, () =>
          connections.query(ctx.connectionId!, params.sql as string),
        )
        const max = getMaxRows()
        return {
          success: true,
          data: {
            rows: result.rows.slice(0, max),
            rowCount: result.rowCount,
            fields: result.fields.map(f => ({ name: f.name, dataType: f.dataType })),
            duration: result.duration,
            affectedRows: result.affectedRows,
          },
          display: `Query returned ${result.rowCount} row(s)`
        }
      }
    },
    {
      id: 'explain_query',
      name: 'Explain Query',
      description: 'Run EXPLAIN on a SQL query to show its execution plan. Read-only.',
      inputSchema: toJsonSchema(z.object({ sql: z.string().describe('The SQL query to explain') })),
      permission: TOOL_PERMISSION.READ,
      async execute(params: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
        if (!ctx.connectionId) return noConn()
        const result = await withCancellation(connections, ctx, () =>
          connections.query(ctx.connectionId!, `EXPLAIN ${params.sql as string}`),
        )
        return { success: true, data: result.rows, display: `Execution plan (${result.rows.length} step(s))` }
      }
    },
    {
      id: 'list_tables',
      name: 'List Tables',
      description: 'List all tables in the current database schema.',
      inputSchema: toJsonSchema(z.object({ schema: z.string().optional().describe('Schema name (optional)') })),
      permission: TOOL_PERMISSION.READ,
      async execute(params: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
        if (!ctx.connectionId) return noConn()
        const tables = await schema.getTables(ctx.connectionId, params.schema as string | undefined)
        return {
          success: true,
          data: tables.map(t => ({ name: t.name, type: t.type, rowCount: t.rowCount })),
          display: `Found ${tables.length} table(s)`
        }
      }
    },
    {
      id: 'describe_table',
      name: 'Describe Table',
      description: 'Get detailed information about a table including columns, types, indexes, and foreign key relationships.',
      inputSchema: toJsonSchema(z.object({
        table: z.string().describe('Table name to describe'),
        schema: z.string().optional().describe('Schema name (optional)')
      })),
      permission: TOOL_PERMISSION.READ,
      async execute(params: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
        if (!ctx.connectionId) return noConn()
        const table = params.table as string
        const schemaName = params.schema as string | undefined
        const [columns, indexes] = await Promise.all([
          schema.getColumns(ctx.connectionId, table, schemaName),
          schema.getIndexes(ctx.connectionId, table, schemaName)
        ])
        return { success: true, data: { columns, indexes }, display: `${table}: ${columns.length} column(s), ${indexes.length} index(es)` }
      }
    },
    {
      id: 'get_schemas',
      name: 'Get Schemas',
      description: 'List all available schemas or databases on the current connection.',
      inputSchema: toJsonSchema(z.object({})),
      permission: TOOL_PERMISSION.READ,
      async execute(_params: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
        if (!ctx.connectionId) return noConn()
        const [schemas, databases] = await Promise.all([
          schema.getSchemas(ctx.connectionId).catch(() => [] as string[]),
          schema.getDatabases(ctx.connectionId).catch(() => [] as string[])
        ])
        return { success: true, data: { schemas, databases }, display: `${schemas.length} schema(s), ${databases.length} database(s)` }
      }
    },
    {
      id: 'connection_info',
      name: 'Connection Info',
      description: 'Get information about the currently active database connection including type, host, and database name.',
      inputSchema: toJsonSchema(z.object({})),
      permission: TOOL_PERMISSION.READ,
      async execute(_params: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
        if (!ctx.connectionId) return noConn()
        const profile = connections.getProfile(ctx.connectionId)
        if (!profile) return noConn()
        return {
          success: true,
          data: { type: profile.type, host: profile.host, port: profile.port, database: profile.database, name: profile.name },
          display: profile.name
        }
      }
    }
  ]
}
