import { describe, it, expect, vi } from 'vitest'
import fs from 'fs'
import path from 'path'

// server.ts imports electron at module load; describeToolCall itself needs none
// of it, so stub the surface to a bare BrowserWindow list (matching the mcp
// server tests) and keep this guard runnable headless.
vi.mock('electron', () => ({ BrowserWindow: { getAllWindows: () => [] } }))

import { describeToolCall } from '../../../src/main/mcp/server'

/**
 * Architectural guard for the MCP approval contract (#167).
 *
 * `MCPApprovalRequest` is the text a human reads before granting an external
 * MCP client permission to run a tool against their database. It used to carry
 * a field literally named `sql` that, for any non-SQL driver, was populated with
 * `JSON.stringify(params)` — so approving a Mongo or Redis tool call presented a
 * JSON blob under a field claiming to be SQL, and the renderer highlighted it as
 * SQL. The field name lied about what the user was approving.
 *
 * `CLAUDE.md` states the rule: the glue and renderer must describe the database
 * generically, because a driver may not be SQL. This guard keeps the approval
 * contract engine-neutral so the lie cannot be reintroduced.
 *
 * Scope note: this guard is deliberately narrow. It does **not** ban the word
 * `sql` everywhere in `shared/` — the persisted `saved_queries` / `query_history`
 * / `open_tabs` columns use `sql` as the app-wide, documented term for "query
 * text" (opaque, never parsed as SQL — see `PersistedTab.sql`), which is a
 * correct naming choice, not a violation. What must stay neutral is the
 * *approval* contract, where the field is shown to a user as the thing they are
 * granting.
 */

const repoRoot = process.cwd()

function read(rel: string): string {
  return fs.readFileSync(path.join(repoRoot, rel), 'utf-8')
}

/** Slice `{ … }` starting at the first brace after `header`, brace-matched. */
function braceBlock(src: string, header: string, file: string): string {
  const start = src.indexOf(header)
  if (start === -1) throw new Error(`could not find "${header}" in ${file}`)
  const open = src.indexOf('{', start)
  let depth = 0
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++
    else if (src[i] === '}') {
      depth--
      if (depth === 0) return src.slice(open, i + 1)
    }
  }
  throw new Error(`unbalanced braces after "${header}" in ${file}`)
}

/** Field names declared at the interface's top level (two-space indent). */
function topLevelFields(block: string): string[] {
  const names = new Set<string>()
  for (const m of block.matchAll(/^ {2}([a-zA-Z][a-zA-Z0-9]*)[?]?:/gm)) names.add(m[1])
  return [...names].sort()
}

describe('MCP approval contract stays engine-neutral (#167)', () => {
  const mcp = read('shared/mcp.ts')
  const fields = topLevelFields(braceBlock(mcp, 'export interface MCPApprovalRequest', 'shared/mcp.ts'))

  it('does not carry a SQL-specific `sql` field', () => {
    expect(
      fields.includes('sql'),
      `\nMCPApprovalRequest.sql reintroduced in shared/mcp.ts.\n` +
        `This field is shown to a user before they approve a tool call, and a driver\n` +
        `may not be SQL (Mongo, Redis, …). Use the engine-neutral \`statement\` field\n` +
        `(the opaque payload text) plus \`language\` (the syntax to highlight it in),\n` +
        `and populate them with describeToolCall() in src/main/mcp/server.ts.\n`,
    ).toBe(false)
  })

  it('exposes the neutral `statement` + `language` fields instead', () => {
    expect(fields, `MCPApprovalRequest is missing the neutral fields. Found: ${fields.join(', ')}`)
      .toEqual(expect.arrayContaining(['statement', 'language']))
  })

  it('describeToolCall presents a SQL query tool as SQL', () => {
    expect(describeToolCall({ sql: 'DELETE FROM sessions' })).toEqual({
      statement: 'DELETE FROM sessions',
      language: 'sql',
    })
  })

  it('describeToolCall presents a non-SQL tool call in its own terms, not as SQL', () => {
    const out = describeToolCall({ command: 'DEL', key: 'session:abc' })
    expect(out.language).toBe('json')
    // The payload is shown verbatim (the driver's own command), never relabelled
    // as SQL text.
    expect(out.statement).toContain('"command"')
    expect(out.statement).toContain('"DEL"')
    expect(JSON.parse(out.statement)).toEqual({ command: 'DEL', key: 'session:abc' })
  })

  // Guard the guard: the field parser must actually detect a reintroduced `sql`
  // field, or the guard above is vacuous.
  it('field parser detects a `sql:` member (parser sanity)', () => {
    const planted = `export interface MCPApprovalRequest {\n  requestId: string\n  sql: string\n}`
    const detected = topLevelFields(braceBlock(planted, 'export interface MCPApprovalRequest', 'planted'))
    expect(detected).toContain('sql')
  })
})
