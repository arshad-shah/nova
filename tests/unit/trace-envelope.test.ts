import { describe, it, expect } from 'vitest'
import {
  TRACE_ENVELOPE_KEY,
  makeTraceEnvelope,
  isTraceEnvelope,
  extractTraceEnvelope,
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
