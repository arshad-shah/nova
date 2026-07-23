// Unit tests for readRequestBody — the POST /messages body assembler.
//
// Two defects motivated this helper (see issue #172):
//  1. Multi-byte UTF-8 corruption: the old code decoded every TCP chunk
//     independently with `chunk.toString()`, so a character straddling a chunk
//     boundary became replacement characters. These tests drive a fake request
//     that emits Buffers split *inside* a multi-byte sequence — the exact shape
//     a real socket produces once a payload is large enough to fragment.
//  2. Unbounded buffering in the main process: the old code had no size cap, so
//     a runaway client could exhaust main-process memory. The cap is enforced
//     on BYTE length as chunks arrive, never string length (which undercounts
//     multi-byte input).
import { EventEmitter } from 'events'
import type { IncomingMessage } from 'http'
import { describe, expect, it, vi } from 'vitest'

// server.ts imports electron's BrowserWindow for its broadcast/approval seam;
// readRequestBody touches none of it, but the import must still resolve.
vi.mock('electron', () => ({ BrowserWindow: { getAllWindows: () => [] } }))

import { readRequestBody, MAX_MCP_BODY_BYTES } from '../../../src/main/mcp/server'

/** A minimal IncomingMessage stand-in: an EventEmitter with the two methods
 *  readRequestBody may call when it aborts a read (pause/destroy). Tests emit
 *  'data'/'end'/'error' by hand so chunk boundaries are fully deterministic. */
function fakeReq(): IncomingMessage & { paused: boolean; destroyed: boolean } {
  const e = new EventEmitter() as unknown as IncomingMessage & { paused: boolean; destroyed: boolean }
  e.paused = false
  e.destroyed = false
  e.pause = (() => { e.paused = true; return e }) as IncomingMessage['pause']
  e.destroy = (() => { e.destroyed = true; return e }) as IncomingMessage['destroy']
  return e
}

describe('readRequestBody — multi-byte UTF-8 assembly', () => {
  it('reassembles a body whose multi-byte characters straddle chunk boundaries, byte-exact', async () => {
    const payload = JSON.stringify({ name: 'café_señor_日本語', emoji: '😀🎉', note: 'Ω≈ç√∫' })
    const full = Buffer.from(payload, 'utf8')

    // Split 1 byte into the 4-byte '😀' so the sequence is deliberately torn.
    const emojiStart = full.indexOf(Buffer.from('😀', 'utf8'))
    const splitAt = emojiStart + 1
    expect(splitAt).toBeGreaterThan(0)

    // Guard the test itself: the naive per-chunk decode the old code used would
    // corrupt this exact split. If it doesn't, the split isn't landing inside a
    // multi-byte sequence and the test proves nothing.
    const naive = full.subarray(0, splitAt).toString() + full.subarray(splitAt).toString()
    expect(naive).not.toBe(payload)
    expect(naive).toContain('�') // U+FFFD REPLACEMENT CHARACTER

    const req = fakeReq()
    const pending = readRequestBody(req)
    req.emit('data', full.subarray(0, splitAt))
    req.emit('data', full.subarray(splitAt))
    req.emit('end')

    const body = await pending
    expect(body).toBe(payload)
    expect(JSON.parse(body)).toEqual(JSON.parse(payload))
  })

  it('handles a body fragmented into many single-byte chunks', async () => {
    const payload = '☕日本語😀'
    const full = Buffer.from(payload, 'utf8')
    const req = fakeReq()
    const pending = readRequestBody(req)
    for (const byte of full) req.emit('data', Buffer.from([byte]))
    req.emit('end')
    expect(await pending).toBe(payload)
  })
})

describe('readRequestBody — size cap', () => {
  it('rejects an oversized body, pauses the stream, and stops accumulating', async () => {
    const req = fakeReq()
    const pending = readRequestBody(req, 10)
    req.emit('data', Buffer.alloc(6))
    req.emit('data', Buffer.alloc(6)) // 12 > 10
    await expect(pending).rejects.toMatchObject({ code: 'BODY_TOO_LARGE' })
    expect(req.paused).toBe(true)
  })

  it('counts bytes, not string length, when enforcing the cap', async () => {
    // Five emoji: 5 code points, JS string length 10 (surrogate pairs), 20 bytes.
    // A string-length cap of 15 would wrongly accept it; a byte cap rejects it.
    const buf = Buffer.from('😀😀😀😀😀', 'utf8')
    expect(buf.length).toBe(20)
    const req = fakeReq()
    const pending = readRequestBody(req, 15)
    req.emit('data', buf)
    await expect(pending).rejects.toMatchObject({ code: 'BODY_TOO_LARGE' })
  })

  it('accepts a body exactly at the limit', async () => {
    const req = fakeReq()
    const pending = readRequestBody(req, 4)
    req.emit('data', Buffer.from('ab'))
    req.emit('data', Buffer.from('cd'))
    req.emit('end')
    expect(await pending).toBe('abcd')
  })

  it('exposes a sane default limit that is generous for JSON-RPC yet bounded', () => {
    expect(MAX_MCP_BODY_BYTES).toBeGreaterThanOrEqual(64 * 1024)
    expect(MAX_MCP_BODY_BYTES).toBeLessThanOrEqual(16 * 1024 * 1024)
  })
})

describe('readRequestBody — errors', () => {
  it('rejects when the underlying request errors', async () => {
    const req = fakeReq()
    const pending = readRequestBody(req)
    const boom = new Error('socket exploded')
    req.emit('error', boom)
    await expect(pending).rejects.toBe(boom)
  })
})
