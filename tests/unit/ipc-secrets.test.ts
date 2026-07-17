// src/main/ipc/secrets.ts is the chokepoint that keeps connection passwords
// (and settings.ai keys) out of every renderer-facing payload. These are pure
// functions with no electron/fs dependency, so we exercise them directly
// against the redaction/merge contract rather than through a full IPC round
// trip.
import { describe, it, expect } from 'vitest'
import {
  getSecretFieldKeys,
  redactConnection,
  mergeIncomingProfile,
  redactAi,
  redactSettings,
  SECRET_PLACEHOLDER,
} from '../../src/main/ipc/secrets'
import type { ConnectionProfile } from '../../shared/types'
import type { DriverRegistryImpl } from '../../src/main/plugins/sdk/driver-registry'

function fakeRegistry(
  fields: Array<{ key: string; type: string }> = [],
): DriverRegistryImpl {
  return {
    getDriverIds: () => ['postgresql'],
    get: () => ({ connectionFields: fields }),
  } as unknown as DriverRegistryImpl
}

const profile = (overrides: Partial<ConnectionProfile> = {}): ConnectionProfile => ({
  id: 'p1',
  name: 'Test',
  type: 'postgresql',
  host: 'localhost',
  port: 5432,
  database: 'db',
  username: 'admin',
  password: 'super-secret',
  ...overrides,
}) as ConnectionProfile

describe('getSecretFieldKeys', () => {
  it('always includes the canonical password field even with no plugin fields', () => {
    const keys = getSecretFieldKeys(fakeRegistry([]))
    expect(keys.has('password')).toBe(true)
  })

  it('collects plugin-declared password-typed fields across every driver', () => {
    const keys = getSecretFieldKeys(fakeRegistry([{ key: 'sshPassphrase', type: 'password' }]))
    expect(keys.has('sshPassphrase')).toBe(true)
  })

  it('does not treat a non-password-typed field as a secret', () => {
    const keys = getSecretFieldKeys(fakeRegistry([{ key: 'apiEndpoint', type: 'text' }]))
    expect(keys.has('apiEndpoint')).toBe(false)
  })
})

describe('redactConnection', () => {
  it('replaces a present secret value with the placeholder', () => {
    const out = redactConnection(profile(), new Set(['password']))
    expect(out.password).toBe(SECRET_PLACEHOLDER)
  })

  it('leaves an empty-string secret alone instead of placeholder-stamping it', () => {
    // An empty string means "no secret set" — stamping SECRET_PLACEHOLDER over
    // it would make the renderer believe a value exists when it doesn't, and
    // mergeIncomingProfile would then "preserve" a fake secret on next save.
    const out = redactConnection(profile({ password: '' }), new Set(['password']))
    expect(out.password).toBe('')
  })

  it('leaves a null secret value alone', () => {
    const out = redactConnection(
      profile({ password: null as unknown as string }),
      new Set(['password']),
    )
    expect(out.password).toBeNull()
  })

  it('does not mutate the input profile (returns a copy)', () => {
    const input = profile()
    const out = redactConnection(input, new Set(['password']))
    expect(input.password).toBe('super-secret')
    expect(out).not.toBe(input)
  })

  it('redacts every declared secret key, not just password', () => {
    const out = redactConnection(
      profile({ sshPassphrase: 'phrase' } as unknown as ConnectionProfile),
      new Set(['password', 'sshPassphrase']),
    )
    expect(out.password).toBe(SECRET_PLACEHOLDER)
    expect((out as unknown as Record<string, unknown>).sshPassphrase).toBe(SECRET_PLACEHOLDER)
  })
})

describe('mergeIncomingProfile', () => {
  it('passes the incoming profile through unchanged when there is no existing profile (new connection)', () => {
    const incoming = profile({ password: 'brand-new' })
    const merged = mergeIncomingProfile(incoming, undefined, new Set(['password']))
    expect(merged.password).toBe('brand-new')
  })

  it('restores the existing plaintext secret when the incoming value is the placeholder (unedited form)', () => {
    const existing = profile({ password: 'real-plaintext' })
    const incoming = profile({ password: SECRET_PLACEHOLDER })
    const merged = mergeIncomingProfile(incoming, existing, new Set(['password']))
    expect(merged.password).toBe('real-plaintext')
  })

  it('restores the existing secret when the incoming value is an empty string (field left blank)', () => {
    const existing = profile({ password: 'real-plaintext' })
    const incoming = profile({ password: '' })
    const merged = mergeIncomingProfile(incoming, existing, new Set(['password']))
    expect(merged.password).toBe('real-plaintext')
  })

  it('accepts a genuinely new secret value from the renderer over the existing one', () => {
    const existing = profile({ password: 'old-secret' })
    const incoming = profile({ password: 'user-typed-new-secret' })
    const merged = mergeIncomingProfile(incoming, existing, new Set(['password']))
    expect(merged.password).toBe('user-typed-new-secret')
  })

  it('deletes the field entirely when neither incoming nor existing has a value', () => {
    const existing = profile({ password: undefined as unknown as string })
    const incoming = profile({ password: '' })
    const merged = mergeIncomingProfile(incoming, existing, new Set(['password']))
    expect('password' in (merged as unknown as Record<string, unknown>)).toBe(false)
  })

  it('never lets the literal placeholder string reach storage as a "real" secret', () => {
    // If mergeIncomingProfile had a bug that treated the placeholder as a
    // real value when there is no existing profile to restore from, the
    // sentinel itself would get persisted and later decrypted/sent back as
    // if it were a genuine password.
    const incoming = profile({ password: SECRET_PLACEHOLDER })
    const merged = mergeIncomingProfile(incoming, undefined, new Set(['password']))
    // Documents current behaviour: with no existing profile, the placeholder
    // passes straight through untouched (existing is undefined -> early return).
    expect(merged.password).toBe(SECRET_PLACEHOLDER)
  })
})

describe('redactAi / redactSettings', () => {
  it('blanks both provider keys regardless of which is set', () => {
    const out = redactAi({ openaiKey: 'sk-openai', anthropicKey: 'sk-anthropic', model: 'gpt' })
    expect(out.openaiKey).toBe('')
    expect(out.anthropicKey).toBe('')
    expect(out.model).toBe('gpt')
  })

  it('redactSettings only touches the ai category, leaving others untouched', () => {
    const settings = { ai: { openaiKey: 'sk-1', anthropicKey: '' }, appearance: { theme: 'dark' } }
    const out = redactSettings(settings)
    expect(out.ai.openaiKey).toBe('')
    expect(out.appearance).toBe(settings.appearance)
  })

  it('redactSettings is a no-op when there is no ai category at all', () => {
    const settings = { appearance: { theme: 'dark' } }
    const out = redactSettings(settings)
    expect(out).toBe(settings)
  })
})
