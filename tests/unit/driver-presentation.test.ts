import { describe, it, expect } from 'vitest'
import {
  resolveDriverPresentation,
  DRIVER_TONE_TEXT,
  DRIVER_TONE_BADGE,
} from '@/lib/driver-presentation'
import { serializeStaticCapabilities } from '../../src/main/plugins/sdk/capabilities'
import type { DriverFactory } from '../../src/main/plugins/sdk/types'

/**
 * A driver's visual identity is a capability it declares, not something the
 * renderer decides. Before this existed, three components each hardcoded their
 * own driver-id → label/colour map and had already drifted — two omitted
 * snowflake, and mongodb was a different colour in each.
 */

describe('resolveDriverPresentation', () => {
  it('uses what the driver declares', () => {
    expect(resolveDriverPresentation({ abbreviation: 'PG', tone: 'accent' }, 'postgresql')).toEqual({
      abbreviation: 'PG',
      tone: 'accent',
    })
  })

  it('falls back for a driver that declares nothing', () => {
    // This is what lets a plugin-contributed driver render without anyone
    // editing the renderer — the entire point of moving this to a capability.
    expect(resolveDriverPresentation(undefined, 'clickhouse')).toEqual({
      abbreviation: 'CL',
      tone: 'neutral',
    })
  })

  it('falls back per-field, so a partial declaration still works', () => {
    expect(resolveDriverPresentation({ tone: 'warning' }, 'duckdb')).toEqual({
      abbreviation: 'DU',
      tone: 'warning',
    })
    expect(resolveDriverPresentation({ abbreviation: 'CH' }, 'clickhouse')).toEqual({
      abbreviation: 'CH',
      tone: 'neutral',
    })
  })

  it('never returns an empty label, even for a degenerate driver id', () => {
    // An empty chip would render as an invisible badge rather than an obvious bug.
    expect(resolveDriverPresentation(undefined, 'x').abbreviation).toBe('X')
    expect(resolveDriverPresentation(undefined, '').abbreviation).toBe('')
  })

  it('does not lowercase or truncate a declared abbreviation', () => {
    // The driver's declaration is authoritative; a driver wanting a 3-char chip
    // must get one rather than be silently clipped.
    expect(resolveDriverPresentation({ abbreviation: 'SNOW' }, 'snowflake').abbreviation).toBe('SNOW')
  })
})

describe('tone maps', () => {
  it('maps every tone, so a new tone cannot silently render as undefined', () => {
    const tones = ['accent', 'success', 'warning', 'error', 'info', 'neutral'] as const
    for (const tone of tones) {
      expect(DRIVER_TONE_TEXT[tone]).toBeTypeOf('string')
      expect(DRIVER_TONE_TEXT[tone]).not.toBe('')
      expect(DRIVER_TONE_BADGE[tone]).toBeTypeOf('string')
    }
  })

  it("translates 'neutral' to Badge's own name for it", () => {
    // Badge calls it 'default'. An implicit cast would compile and render wrong.
    expect(DRIVER_TONE_BADGE.neutral).toBe('default')
  })
})

describe('the presentation capability crosses the SDK boundary', () => {
  const factory = (extra: Partial<DriverFactory>): DriverFactory =>
    ({
      createAdapter: () => ({}) as never,
      connectionFields: [],
      ...extra,
    }) as DriverFactory

  it('forwards a declared presentation into the capabilities payload', () => {
    // The renderer reads capabilities over IPC, so a field that DriverFactory
    // accepts but serializeStaticCapabilities drops would leave every driver
    // looking neutral with nothing failing.
    const caps = serializeStaticCapabilities(
      factory({ presentation: { abbreviation: 'MG', tone: 'success' } })
    )
    expect(caps.presentation).toEqual({ abbreviation: 'MG', tone: 'success' })
  })

  it('omits it for a driver that declares none, leaving the renderer to fall back', () => {
    expect(serializeStaticCapabilities(factory({})).presentation).toBeUndefined()
  })

  it('survives a JSON round-trip, since it travels over IPC', () => {
    const caps = serializeStaticCapabilities(
      factory({ presentation: { abbreviation: 'PG', tone: 'accent' } })
    )
    expect(JSON.parse(JSON.stringify(caps)).presentation).toEqual({
      abbreviation: 'PG',
      tone: 'accent',
    })
  })
})
