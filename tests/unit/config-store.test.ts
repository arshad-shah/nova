import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { ConfigStore } from '../../src/main/config/store'
import { defaultSettings } from '../../shared/settings'
import type { ConnectionProfile } from '../../shared/types'
import fs from 'fs'
import path from 'path'

const TEST_CONFIG = path.join(__dirname, 'test-config.json')

/** Minimal in-memory KeyringLike used to exercise the secretKeys path. */
function makeFakeKeyring() {
  const store: Record<string, string> = {}
  return {
    listKeys: (profileId: string) =>
      Object.keys(store)
        .filter(k => k.startsWith(`${profileId}:`))
        .map(k => k.slice(profileId.length + 1)),
    storeSync: (profileId: string, key: string, value: string) => {
      store[`${profileId}:${key}`] = value
    },
    retrieveSync: (profileId: string, key: string) => store[`${profileId}:${key}`] ?? null,
    delete: async (profileId: string, key: string) => {
      delete store[`${profileId}:${key}`]
    },
    _raw: store,
  }
}

describe('ConfigStore', () => {
  let store: ConfigStore

  beforeEach(() => {
    if (fs.existsSync(TEST_CONFIG)) fs.unlinkSync(TEST_CONFIG)
    store = new ConfigStore(TEST_CONFIG)
  })

  afterAll(() => {
    if (fs.existsSync(TEST_CONFIG)) fs.unlinkSync(TEST_CONFIG)
  })

  it('starts with empty connections', () => {
    expect(store.listConnections()).toEqual([])
  })

  it('saves and retrieves a connection', () => {
    const profile: ConnectionProfile = { id: 'test-1', name: 'Local Dev', type: 'postgresql', host: 'localhost', port: 5432, database: 'mydb', username: 'user', password: 'pass' }
    store.saveConnection(profile)
    const list = store.listConnections()
    expect(list).toHaveLength(1)
    expect(list[0].name).toBe('Local Dev')
  })

  it('updates an existing connection', () => {
    const profile: ConnectionProfile = { id: 'test-1', name: 'Original', type: 'sqlite', database: '/tmp/a.db' }
    store.saveConnection(profile)
    store.saveConnection({ ...profile, name: 'Updated' })
    const list = store.listConnections()
    expect(list).toHaveLength(1)
    expect(list[0].name).toBe('Updated')
  })

  it('deletes a connection', async () => {
    store.saveConnection({ id: 'a', name: 'A', type: 'sqlite', database: '/a.db' })
    store.saveConnection({ id: 'b', name: 'B', type: 'sqlite', database: '/b.db' })
    await store.deleteConnection('a')
    const list = store.listConnections()
    expect(list).toHaveLength(1)
    expect(list[0].id).toBe('b')
  })

  it('gets a connection by id', () => {
    store.saveConnection({ id: 'x', name: 'X', type: 'sqlite', database: '/x.db' })
    expect(store.getConnection('x')!.name).toBe('X')
  })

  it('returns undefined for non-existent connection', () => {
    expect(store.getConnection('nonexistent')).toBeUndefined()
  })

  it('persists across instances', () => {
    store.saveConnection({ id: 'p', name: 'Persistent', type: 'sqlite', database: '/p.db' })
    const store2 = new ConfigStore(TEST_CONFIG)
    expect(store2.listConnections()).toHaveLength(1)
    expect(store2.listConnections()[0].name).toBe('Persistent')
  })

  // ─── Settings ─────────────────────────────────────────────────

  it('getAllSettings returns the merged defaults when no config file exists', () => {
    expect(store.getAllSettings()).toEqual(defaultSettings)
  })

  it('getSettingsCategory returns just the requested category', () => {
    expect(store.getSettingsCategory('general')).toEqual(defaultSettings.general)
  })

  it('getSetting reads a nested value by dotted key path', () => {
    expect(store.getSetting('general.queryTimeout')).toBe(defaultSettings.general.queryTimeout)
  })

  it('getSetting returns undefined for a path that does not exist', () => {
    expect(store.getSetting('general.notARealKey')).toBeUndefined()
    expect(store.getSetting('notARealCategory.foo')).toBeUndefined()
  })

  it('setSetting writes a nested value and getSetting reflects it', () => {
    store.setSetting('general.queryTimeout', 99)
    expect(store.getSetting('general.queryTimeout')).toBe(99)
  })

  it('setSetting persists the new value across instances', () => {
    store.setSetting('editor.fontSize', 20)
    const store2 = new ConfigStore(TEST_CONFIG)
    expect(store2.getSetting('editor.fontSize')).toBe(20)
  })

  it('setSetting rejects a key path containing __proto__', () => {
    expect(() => store.setSetting('__proto__.polluted', true)).toThrow(/forbidden segment/)
    expect(() => store.setSetting('general.__proto__', true)).toThrow(/forbidden segment/)
  })

  it('setSetting rejects a key path containing constructor or prototype', () => {
    expect(() => store.setSetting('constructor.foo', true)).toThrow(/forbidden segment/)
    expect(() => store.setSetting('general.prototype', true)).toThrow(/forbidden segment/)
  })

  it('setSetting rejects a key path with an empty segment', () => {
    expect(() => store.setSetting('general..queryTimeout', 1)).toThrow(/empty segment/)
  })

  it('setSetting throws when an intermediate path segment is not an object', () => {
    // general.language is a string, not an object — cannot descend into it.
    expect(() => store.setSetting('general.language.nested', 'x')).toThrow(/is not an object/)
  })

  it('setSetting is a no-op (no listener notification, no write) when the value is unchanged', () => {
    const seen: Array<[string, unknown]> = []
    store.onSettingsChanged((key, value) => seen.push([key, value]))
    store.setSetting('general.queryTimeout', defaultSettings.general.queryTimeout)
    expect(seen).toEqual([])
  })

  it('setSetting notifies registered listeners with the key path and new value', () => {
    const seen: Array<[string, unknown]> = []
    store.onSettingsChanged((key, value) => seen.push([key, value]))
    store.setSetting('general.queryTimeout', 42)
    expect(seen).toEqual([['general.queryTimeout', 42]])
  })

  it('onSettingsChanged unsubscribe stops further notifications', () => {
    const seen: unknown[] = []
    const unsubscribe = store.onSettingsChanged((key) => seen.push(key))
    unsubscribe()
    store.setSetting('general.queryTimeout', 55)
    expect(seen).toEqual([])
  })

  it('resetCategory restores a category to its default values and notifies listeners', () => {
    store.setSetting('general.queryTimeout', 999)
    const seen: unknown[] = []
    store.onSettingsChanged((key) => seen.push(key))
    store.resetCategory('general')
    expect(store.getSettingsCategory('general')).toEqual(defaultSettings.general)
    expect(seen).toEqual(['general'])
  })

  it('load() falls back to defaults when the config file contains invalid JSON', () => {
    fs.writeFileSync(TEST_CONFIG, '{ not valid json')
    const corrupted = new ConfigStore(TEST_CONFIG)
    expect(corrupted.listConnections()).toEqual([])
    expect(corrupted.getAllSettings()).toEqual(defaultSettings)
  })

  it('load() merges a partial settings object on disk with defaults', () => {
    fs.writeFileSync(
      TEST_CONFIG,
      JSON.stringify({ connections: [], settings: { general: { queryTimeout: 5 } } }),
    )
    const partial = new ConfigStore(TEST_CONFIG)
    expect(partial.getSetting('general.queryTimeout')).toBe(5)
    // Untouched keys in the same category still come from defaults.
    expect(partial.getSetting('general.language')).toBe(defaultSettings.general.language)
    // Other categories are also filled in from defaults.
    expect(partial.getSettingsCategory('editor')).toEqual(defaultSettings.editor)
  })

  // ─── Secrets (keyring integration) ─────────────────────────────

  it('saveConnection with secretKeys extracts secrets into the keyring and blanks them on disk, while keeping them plaintext in memory', () => {
    const keyring = makeFakeKeyring()
    const secretStore = new ConfigStore(TEST_CONFIG, keyring)
    const profile: ConnectionProfile = {
      id: 'sec-1', name: 'Secret DB', type: 'postgresql', host: 'h', port: 5432,
      database: 'd', username: 'u', password: 'topsecret',
    }
    const saved = secretStore.saveConnection(profile, ['password'])
    // In-memory / returned copy still has the plaintext password.
    expect(saved.password).toBe('topsecret')
    expect(secretStore.getConnection('sec-1')!.password).toBe('topsecret')
    // The keyring received it.
    expect(keyring._raw['sec-1:password']).toBe('topsecret')
    // What actually landed on disk has the field blanked.
    const onDisk = JSON.parse(fs.readFileSync(TEST_CONFIG, 'utf-8'))
    expect(onDisk.connections[0].password).toBe('')
  })

  it('deleteConnection removes the profile\'s secrets from the keyring', async () => {
    const keyring = makeFakeKeyring()
    const secretStore = new ConfigStore(TEST_CONFIG, keyring)
    secretStore.saveConnection(
      { id: 'sec-2', name: 'X', type: 'postgresql', host: 'h', port: 5432, database: 'd', username: 'u', password: 'pw' },
      ['password'],
    )
    expect(keyring._raw['sec-2:password']).toBe('pw')
    await secretStore.deleteConnection('sec-2')
    expect(keyring._raw['sec-2:password']).toBeUndefined()
    expect(secretStore.getConnection('sec-2')).toBeUndefined()
  })

  it('loading an existing config re-injects keyring secrets into in-memory profiles', () => {
    const keyring = makeFakeKeyring()
    const secretStore = new ConfigStore(TEST_CONFIG, keyring)
    secretStore.saveConnection(
      { id: 'sec-3', name: 'Y', type: 'postgresql', host: 'h', port: 5432, database: 'd', username: 'u', password: 'reinjected' },
      ['password'],
    )
    // A fresh ConfigStore instance backed by the same keyring should see the
    // plaintext password again even though disk only has a blank string.
    const reopened = new ConfigStore(TEST_CONFIG, keyring)
    expect(reopened.getConnection('sec-3')!.password).toBe('reinjected')
  })
})
