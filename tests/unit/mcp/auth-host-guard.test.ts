// isValidBearer (constant-time compare) is already pinned by
// tests/unit/audit/mcp-auth-timing-safe.test.ts. This file covers the two
// things that suite doesn't: the DNS-rebinding Host-header guard
// (isAllowedMcpHost) and validateAuth's actual response-writing behaviour —
// both of which run on every request before a single tool call is allowed.
import { describe, it, expect, vi } from 'vitest'
import type { IncomingMessage, ServerResponse } from 'http'
import { isAllowedMcpHost, validateAuth } from '../../../src/main/mcp/auth'

function fakeRes() {
  const res = {
    statusCode: 0,
    headers: {} as Record<string, unknown>,
    body: '',
    writeHead(code: number, headers?: Record<string, unknown>) {
      res.statusCode = code
      if (headers) Object.assign(res.headers, headers)
    },
    end(body?: string) {
      res.body = body ?? ''
    },
  }
  return res as unknown as ServerResponse & { statusCode: number; body: string }
}

describe('isAllowedMcpHost (DNS-rebinding guard)', () => {
  it('allows bare loopback hostnames without a port', () => {
    expect(isAllowedMcpHost('127.0.0.1', 3100)).toBe(true)
    expect(isAllowedMcpHost('localhost', 3100)).toBe(true)
  })

  // BUG (documented, not fixed — out of scope per task instructions): an
  // unbracketed IPv6 literal Host header ("::1", no brackets) is rejected.
  // The port-stripping logic treats everything after the LAST colon as a
  // port, so "::1" is parsed as host "::" + port "1" and fails the port
  // check before the `host === '::1'` fallback is ever reached — that
  // fallback is effectively dead code for any unbracketed input. Real HTTP
  // clients always bracket IPv6 literals ("[::1]"), which does work (see
  // the bracketed-IPv6 test below), so this fails closed rather than being
  // exploitable — but a client relying on the unbracketed literal would be
  // wrongly locked out of its own local MCP server.
  it('BUG: rejects an unbracketed IPv6 loopback literal ("::1") even though it is loopback', () => {
    expect(isAllowedMcpHost('::1', 3100)).toBe(false)
  })

  it('allows loopback hosts with the matching bound port', () => {
    expect(isAllowedMcpHost('127.0.0.1:3100', 3100)).toBe(true)
    expect(isAllowedMcpHost('localhost:3100', 3100)).toBe(true)
  })

  it('allows bracketed IPv6 loopback with the matching port', () => {
    expect(isAllowedMcpHost('[::1]:3100', 3100)).toBe(true)
  })

  it('rejects a loopback host carrying the WRONG port', () => {
    // A request that names a different port than the one we actually bound
    // is not "this server" — reject it rather than trusting the label.
    expect(isAllowedMcpHost('127.0.0.1:9999', 3100)).toBe(false)
    expect(isAllowedMcpHost('[::1]:9999', 3100)).toBe(false)
  })

  it('rejects an attacker-controlled hostname that merely resolves to loopback', () => {
    // This is the actual rebinding attack: evil.example resolves to 127.0.0.1
    // in the victim's browser, but the Host header still says evil.example.
    expect(isAllowedMcpHost('evil.example.com', 3100)).toBe(false)
    expect(isAllowedMcpHost('evil.example.com:3100', 3100)).toBe(false)
  })

  it('rejects a missing Host header', () => {
    expect(isAllowedMcpHost(undefined, 3100)).toBe(false)
  })

  it('rejects a malformed bracketed IPv6 host with no closing bracket', () => {
    expect(isAllowedMcpHost('[::1:3100', 3100)).toBe(false)
  })

  it('is case-insensitive on the hostname', () => {
    expect(isAllowedMcpHost('LOCALHOST:3100', 3100)).toBe(true)
  })
})

describe('validateAuth', () => {
  it('writes 401 JSON and returns false for a missing token', () => {
    const req = { headers: {} } as unknown as IncomingMessage
    const res = fakeRes()
    expect(validateAuth(req, 'secret-token', res)).toBe(false)
    expect(res.statusCode).toBe(401)
    expect(JSON.parse(res.body)).toEqual({ error: 'Unauthorized' })
  })

  it('writes 401 for a well-formed but wrong bearer token', () => {
    const req = { headers: { authorization: 'Bearer wrong' } } as unknown as IncomingMessage
    const res = fakeRes()
    expect(validateAuth(req, 'secret-token', res)).toBe(false)
    expect(res.statusCode).toBe(401)
  })

  it('returns true and writes nothing for a matching bearer token', () => {
    const req = { headers: { authorization: 'Bearer secret-token' } } as unknown as IncomingMessage
    const res = fakeRes()
    expect(validateAuth(req, 'secret-token', res)).toBe(true)
    expect(res.statusCode).toBe(0)
  })

  it('never calls timingSafeEqual in a way that throws on a mismatched-length header', () => {
    // Regression guard for the length-mismatch crash `timingSafeEqual` would
    // otherwise raise — a malicious client can freely vary the header length.
    const req = { headers: { authorization: `Bearer ${'x'.repeat(5000)}` } } as unknown as IncomingMessage
    const res = fakeRes()
    expect(() => validateAuth(req, 'secret-token', res)).not.toThrow()
    expect(res.statusCode).toBe(401)
  })
})
