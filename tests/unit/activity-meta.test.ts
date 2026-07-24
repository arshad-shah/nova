import { describe, it, expect } from 'vitest'
import { ACTIVITY_KIND, type ActivityKind, type ActivityLevel } from '../../shared/activity'
import { KIND_META, KIND_TONE_CLASS, LEVEL_RAIL_CLASS, hasRail } from '../../src/renderer/src/lib/activity/meta'

const ALL_KINDS = Object.values(ACTIVITY_KIND) as ActivityKind[]
const ALL_LEVELS: ActivityLevel[] = ['debug', 'info', 'success', 'warn', 'error']

describe('KIND_META', () => {
  it('covers every activity kind with an icon, label and tone', () => {
    for (const kind of ALL_KINDS) {
      const meta = KIND_META[kind]
      expect(meta, kind).toBeDefined()
      expect(meta.icon).toBeTruthy()
      expect(meta.label).toMatch(/^shell\.activity\./)
      expect(['data', 'agent', 'muted']).toContain(meta.tone)
    }
  })

  it('maps kinds to the intended accent tone', () => {
    // data = touched a data source
    for (const kind of ['query', 'connection', 'network', 'ipc', 'store'] as ActivityKind[]) {
      expect(KIND_META[kind].tone).toBe('data')
    }
    // agent = an agent did this
    for (const kind of ['tool-call', 'plugin'] as ActivityKind[]) {
      expect(KIND_META[kind].tone).toBe('agent')
    }
    // muted = ambient/diagnostic
    for (const kind of ['notification', 'perf', 'log'] as ActivityKind[]) {
      expect(KIND_META[kind].tone).toBe('muted')
    }
  })

  it('maps each tone to its theme-token utility (never interface purple)', () => {
    expect(KIND_TONE_CLASS.data).toBe('text-data-accent')
    expect(KIND_TONE_CLASS.agent).toBe('text-agent-accent')
    expect(KIND_TONE_CLASS.muted).toBe('text-text-muted')
    for (const cls of Object.values(KIND_TONE_CLASS)) {
      expect(cls).not.toContain('accent-primary')
    }
  })
})

describe('severity rail', () => {
  it('colours error/warn/success and leaves info/debug transparent', () => {
    expect(LEVEL_RAIL_CLASS.error).toBe('bg-error')
    expect(LEVEL_RAIL_CLASS.warn).toBe('bg-warning')
    expect(LEVEL_RAIL_CLASS.success).toBe('bg-success')
    expect(LEVEL_RAIL_CLASS.info).toBe('bg-transparent')
    expect(LEVEL_RAIL_CLASS.debug).toBe('bg-transparent')
  })

  it('has a rail class for every level', () => {
    for (const level of ALL_LEVELS) expect(LEVEL_RAIL_CLASS[level]).toBeTruthy()
  })

  it('hasRail only for the coloured levels', () => {
    expect(hasRail('error')).toBe(true)
    expect(hasRail('warn')).toBe(true)
    expect(hasRail('success')).toBe(true)
    expect(hasRail('info')).toBe(false)
    expect(hasRail('debug')).toBe(false)
  })
})
