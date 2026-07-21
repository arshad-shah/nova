// tests/unit/ai-permission-manager-edge-cases.test.ts
//
// Companion to ai-permission-manager.test.ts: covers isWriteBlocked, the
// profile interactions that test file doesn't reach (read-only + auto with
// needsApproval), the SQL-content smuggling check for read tools, and the
// waitForApproval/resolveApproval edge cases around unknown request ids.
import { describe, it, expect, vi } from 'vitest'
import { z } from 'zod'
import { toJsonSchema } from '../../src/main/plugins/sdk/tool-schema'
import { PermissionManager } from '../../src/main/plugins/bundled/ai/internal/permission-manager'
import type { Tool } from '../../src/main/plugins/sdk/types'

function makeTool(id: string, permission: 'read' | 'write'): Tool {
  return {
    id, name: id, description: '', inputSchema: toJsonSchema(z.object({})),
    permission,
    execute: vi.fn(async () => ({ success: true, data: null }))
  }
}

describe('PermissionManager — edge cases', () => {
  describe('isWriteBlocked', () => {
    it('blocks a write tool only under the read-only profile', () => {
      const pm = new PermissionManager()
      const tool = makeTool('query.execute', 'write')
      pm.setProfile('read-only')
      expect(pm.isWriteBlocked(tool)).toBe(true)
      pm.setProfile('ask-write')
      expect(pm.isWriteBlocked(tool)).toBe(false)
      pm.setProfile('auto')
      expect(pm.isWriteBlocked(tool)).toBe(false)
    })

    it('never blocks a read tool, even under read-only', () => {
      const pm = new PermissionManager()
      pm.setProfile('read-only')
      expect(pm.isWriteBlocked(makeTool('schema.list', 'read'))).toBe(false)
    })
  })

  describe('needsApproval profile interactions', () => {
    it('never asks for approval under the auto profile, even for a write tool', () => {
      const pm = new PermissionManager()
      pm.setProfile('auto')
      expect(pm.needsApproval(makeTool('query.execute', 'write'))).toBe(false)
    })

    it('never asks for approval under read-only — the tool is blocked before an approval prompt would matter', () => {
      const pm = new PermissionManager()
      pm.setProfile('read-only')
      expect(pm.needsApproval(makeTool('query.execute', 'write'))).toBe(false)
    })

    it('defaults to the ask-write profile', () => {
      const pm = new PermissionManager()
      expect(pm.getProfile()).toBe('ask-write')
    })
  })

  describe('SQL-content smuggling check', () => {
    it('treats a "read" tool whose sql param is a write/DDL statement as an effective write', () => {
      const pm = new PermissionManager()
      const readTool = makeTool('explain_query', 'read')
      expect(pm.needsApproval(readTool, { sql: 'DROP TABLE users' })).toBe(true)
      expect(pm.isWriteBlocked(readTool)).toBe(false) // ask-write profile, not read-only
      pm.setProfile('read-only')
      expect(pm.isWriteBlocked(readTool, { sql: 'DROP TABLE users' })).toBe(true)
    })

    it('leaves a genuinely read-only sql param alone', () => {
      const pm = new PermissionManager()
      const readTool = makeTool('explain_query', 'read')
      expect(pm.needsApproval(readTool, { sql: 'SELECT * FROM users' })).toBe(false)
    })

    it('ignores a non-string sql param rather than throwing', () => {
      const pm = new PermissionManager()
      const readTool = makeTool('explain_query', 'read')
      expect(pm.needsApproval(readTool, { sql: 123 as unknown as string })).toBe(false)
    })

    it('handles a call with no params at all', () => {
      const pm = new PermissionManager()
      expect(pm.needsApproval(makeTool('query.execute', 'write'), undefined)).toBe(true)
      expect(pm.needsApproval(makeTool('schema.list', 'read'), undefined)).toBe(false)
    })
  })

  describe('approval bookkeeping edge cases', () => {
    it('waitForApproval resolves false immediately for an unknown request id', async () => {
      const pm = new PermissionManager()
      await expect(pm.waitForApproval('does-not-exist')).resolves.toBe(false)
    })

    it('resolveApproval on an unknown request id is a silent no-op', () => {
      const pm = new PermissionManager()
      expect(() => pm.resolveApproval('does-not-exist', true)).not.toThrow()
    })

    it('resolveApproval is idempotent — a second call for the same id is a no-op, not a second resolution', async () => {
      const pm = new PermissionManager()
      const requestId = pm.createApprovalRequest('query.execute', {}, '')
      const promise = pm.waitForApproval(requestId)
      pm.resolveApproval(requestId, true)
      // The entry is removed after the first resolution — a stray duplicate
      // IPC response can't flip the outcome.
      pm.resolveApproval(requestId, false)
      expect(await promise).toBe(true)
      expect(pm.hasPendingApproval(requestId)).toBe(false)
    })

    it('hasPendingApproval is false once resolved', async () => {
      const pm = new PermissionManager()
      const requestId = pm.createApprovalRequest('query.execute', {}, '')
      pm.resolveApproval(requestId, true)
      expect(pm.hasPendingApproval(requestId)).toBe(false)
    })
  })
})
