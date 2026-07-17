// extractSnowflakeName centralizes a quirk: Snowflake's `SHOW …` commands
// return column names as quoted-lowercase keys (e.g. the literal key
// '"name"'), but not every driver code path is consistent about that. Every
// caller (getConnectionOptions, getDatabases, the plugin's toolbar
// resolvers) depends on this picking the right key.
import { describe, it, expect } from 'vitest'
import { extractSnowflakeName } from '../../src/main/plugins/bundled/snowflake/naming'

describe('extractSnowflakeName', () => {
  it('prefers the quoted `"name"` key when present', () => {
    expect(extractSnowflakeName({ '"name"': 'MY_WH', name: 'ignored' })).toBe('MY_WH')
  })

  it('falls back to a plain `name` key when the quoted key is absent', () => {
    expect(extractSnowflakeName({ name: 'MY_DB' })).toBe('MY_DB')
  })

  it('returns an empty string when neither key is present', () => {
    expect(extractSnowflakeName({ other: 'x' })).toBe('')
  })

  it('returns an empty string for an empty row', () => {
    expect(extractSnowflakeName({})).toBe('')
  })

  it('treats an explicit null/undefined value as absent, not as a valid name', () => {
    expect(extractSnowflakeName({ '"name"': null, name: 'FALLBACK' })).toBe('FALLBACK')
    expect(extractSnowflakeName({ '"name"': undefined, name: 'FALLBACK' })).toBe('FALLBACK')
  })

  it('stringifies a non-string value rather than throwing', () => {
    expect(extractSnowflakeName({ '"name"': 42 })).toBe('42')
  })
})
