import { describe, it, expect, afterEach, vi } from 'vitest'
import {
  TRACE_ENVELOPE_KEY,
  makeTraceEnvelope,
  isTraceEnvelope,
  extractTraceEnvelope,
  newTraceId,
} from '@shared/trace'

describe('trace envelope', () => {
  it('round-trips a minted id through make -> extract', () => {
    const env = makeTraceEnvelope('trace-1')
    const { args, traceId } = extractTraceEnvelope(['a', 'b', env])
    expect(args).toEqual(['a', 'b'])
    expect(traceId).toBe('trace-1')
  })

  it('returns args unchanged and no id when no envelope trails', () => {
    const { args, traceId } = extractTraceEnvelope(['a', 'b'])
    expect(args).toEqual(['a', 'b'])
    expect(traceId).toBeUndefined()
  })

  it('handles an empty argument list', () => {
    expect(extractTraceEnvelope([])).toEqual({ args: [] })
  })

  it('recognises only a lone-keyed string envelope', () => {
    expect(isTraceEnvelope({ [TRACE_ENVELOPE_KEY]: 'x' })).toBe(true)
    // A genuine arg that merely includes the key (plus others) is not an envelope.
    expect(isTraceEnvelope({ [TRACE_ENVELOPE_KEY]: 'x', other: 1 })).toBe(false)
    expect(isTraceEnvelope({ [TRACE_ENVELOPE_KEY]: 42 })).toBe(false)
    expect(isTraceEnvelope({})).toBe(false)
    expect(isTraceEnvelope(null)).toBe(false)
    expect(isTraceEnvelope('x')).toBe(false)
  })

  it('does not strip a trailing arg that only resembles the envelope', () => {
    const decoy = { [TRACE_ENVELOPE_KEY]: 'x', keepMe: true }
    const { args, traceId } = extractTraceEnvelope(['a', decoy])
    expect(args).toEqual(['a', decoy])
    expect(traceId).toBeUndefined()
  })
})

// `newTraceId` is deliberately built on the Web Crypto global rather than
// `node:crypto`, because the preload bridge that calls it runs sandboxed.
// (The static rule is pinned by tests/unit/audit/preload-sandbox-safe.test.ts;
// these cover the behaviour.)
describe('newTraceId', () => {
  const realCrypto = globalThis.crypto

  afterEach(() => {
    Object.defineProperty(globalThis, 'crypto', { value: realCrypto, configurable: true, writable: true })
  })

  it('mints a distinct id per call', () => {
    const ids = new Set(Array.from({ length: 200 }, () => newTraceId()))
    expect(ids.size).toBe(200)
  })

  it('uses the Web Crypto UUID when the platform offers one', () => {
    const randomUUID = vi.fn(() => 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee')
    Object.defineProperty(globalThis, 'crypto', { value: { randomUUID }, configurable: true, writable: true })
    expect(newTraceId()).toBe('aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee')
    expect(randomUUID).toHaveBeenCalledTimes(1)
  })

  it('still mints unique, non-empty ids when Web Crypto is absent', () => {
    // A sandboxed preload in a non-secure context has no crypto.randomUUID.
    // Losing the trace id would be worse than a non-cryptographic one, and it
    // must never throw — the bridge itself depends on this call.
    Object.defineProperty(globalThis, 'crypto', { value: undefined, configurable: true, writable: true })
    const ids = Array.from({ length: 200 }, () => newTraceId())
    for (const id of ids) expect(id).not.toBe('')
    expect(new Set(ids).size).toBe(200)
  })

  it('produces ids that survive a round trip through the envelope', () => {
    const id = newTraceId()
    expect(extractTraceEnvelope(['x', makeTraceEnvelope(id)]).traceId).toBe(id)
  })
})
