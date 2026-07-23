import { describe, it, expect, beforeEach, vi } from 'vitest'

const { encryptionAvailable, decryptStringMock } = vi.hoisted(() => ({
  encryptionAvailable: { value: true },
  decryptStringMock: vi.fn((buffer: Buffer) => buffer.toString().replace('encrypted:', '')),
}))

// Mock Electron's safeStorage — tests run in Node, not Electron
vi.mock('electron', () => ({
  safeStorage: {
    isEncryptionAvailable: () => encryptionAvailable.value,
    encryptString: (text: string) => Buffer.from(`encrypted:${text}`),
    decryptString: (buffer: Buffer) => decryptStringMock(buffer),
  },
  app: {
    getPath: () => '/tmp/verql-test'
  }
}))

// Mock fs to avoid real file I/O. The keyring writes atomically (write
// to a sibling temp file, then rename onto the final path), so the
// mock simulates a tiny in-memory filesystem keyed by absolute path.
const mockFs: Record<string, string> = {}
const mockStore: Record<string, string> = {}
vi.mock('fs', () => ({
  default: {
    existsSync: (p: string) => p in mockFs || Object.keys(mockStore).length > 0,
    readFileSync: (p: string) => mockFs[p] ?? JSON.stringify(mockStore),
    writeFileSync: (p: string, data: string) => {
      mockFs[p] = data
      // Mirror writes onto the in-memory keyring snapshot so reads after
      // a "rename" still observe the same data shape the real keyring
      // would see on next boot.
      try {
        const parsed = JSON.parse(data)
        for (const key of Object.keys(mockStore)) delete mockStore[key]
        Object.assign(mockStore, parsed)
      } catch { /* not a credentials JSON write */ }
    },
    renameSync: (from: string, to: string) => {
      mockFs[to] = mockFs[from]
      delete mockFs[from]
    },
    unlinkSync: (p: string) => { delete mockFs[p] },
    mkdirSync: () => {}
  }
}))

import { KeyringService } from '../../src/main/keyring'

describe('KeyringService', () => {
  let keyring: KeyringService

  beforeEach(() => {
    for (const key of Object.keys(mockStore)) delete mockStore[key]
    for (const key of Object.keys(mockFs)) delete mockFs[key]
    encryptionAvailable.value = true
    decryptStringMock.mockImplementation((buffer: Buffer) => buffer.toString().replace('encrypted:', ''))
    keyring = new KeyringService()
  })

  it('stores and retrieves a credential', async () => {
    await keyring.store('conn1', 'password', 'secret123')
    const result = await keyring.retrieve('conn1', 'password')
    expect(result).toBe('secret123')
  })

  it('returns null for missing credential', async () => {
    const result = await keyring.retrieve('conn1', 'password')
    expect(result).toBeNull()
  })

  it('deletes a credential', async () => {
    await keyring.store('conn1', 'password', 'secret123')
    await keyring.delete('conn1', 'password')
    const result = await keyring.retrieve('conn1', 'password')
    expect(result).toBeNull()
  })

  it('deleteAll removes all credentials for a profile', async () => {
    await keyring.store('conn1', 'password', 'secret')
    await keyring.store('conn1', 'ssoToken', 'token')
    await keyring.store('conn2', 'password', 'other')
    await keyring.deleteAll('conn1')
    expect(await keyring.retrieve('conn1', 'password')).toBeNull()
    expect(await keyring.retrieve('conn1', 'ssoToken')).toBeNull()
    expect(await keyring.retrieve('conn2', 'password')).toBe('other')
  })

  it('overwrites existing credential', async () => {
    await keyring.store('conn1', 'password', 'old')
    await keyring.store('conn1', 'password', 'new')
    expect(await keyring.retrieve('conn1', 'password')).toBe('new')
  })

  it('has() returns true only for a credential that was actually stored', async () => {
    await keyring.store('conn1', 'password', 'secret')
    expect(keyring.has('conn1', 'password')).toBe(true)
    expect(keyring.has('conn1', 'ssoToken')).toBe(false)
    expect(keyring.has('conn2', 'password')).toBe(false)
  })

  it('listKeys() returns only the key names belonging to the given profile', async () => {
    await keyring.store('conn1', 'password', 'a')
    await keyring.store('conn1', 'ssoToken', 'b')
    await keyring.store('conn2', 'password', 'c')
    expect(keyring.listKeys('conn1').sort()).toEqual(['password', 'ssoToken'])
    expect(keyring.listKeys('conn2')).toEqual(['password'])
    expect(keyring.listKeys('nonexistent')).toEqual([])
  })

  it('storeSync + retrieveSync round-trip synchronously', () => {
    keyring.storeSync('conn1', 'password', 'sync-secret')
    expect(keyring.retrieveSync('conn1', 'password')).toBe('sync-secret')
  })

  it('storeSync with a falsy value deletes any existing entry instead of storing it', () => {
    keyring.storeSync('conn1', 'password', 'sync-secret')
    keyring.storeSync('conn1', 'password', '')
    expect(keyring.retrieveSync('conn1', 'password')).toBeNull()
    expect(keyring.has('conn1', 'password')).toBe(false)
  })

  it('falls back to an obfuscated plaintext encoding when OS encryption is unavailable, and still round-trips', async () => {
    encryptionAvailable.value = false
    keyring = new KeyringService()
    await keyring.store('conn1', 'password', 'no-encryption-secret')
    expect(await keyring.retrieve('conn1', 'password')).toBe('no-encryption-secret')
    // The encoded value on disk must be tagged plaintext, not run through encryptString.
    const saved = JSON.parse(mockFs[Object.keys(mockFs)[0]])
    expect(saved['conn1:password']).toMatch(/^plain:/)
  })

  it('drops and returns null for a credential whose ciphertext can no longer be decrypted (e.g. OS keychain reset)', async () => {
    await keyring.store('conn1', 'password', 'secret123')
    decryptStringMock.mockImplementation(() => { throw new Error('decryption failed') })
    const result = await keyring.retrieve('conn1', 'password')
    expect(result).toBeNull()
    // The unrecoverable entry is dropped so it doesn't keep throwing.
    expect(keyring.has('conn1', 'password')).toBe(false)
  })

  it('starts with an empty cache when the credentials file on disk is corrupted JSON', () => {
    mockFs['/tmp/verql-test/credentials.enc'] = 'not valid json {{{'
    const corrupted = new KeyringService()
    expect(corrupted.listKeys('conn1')).toEqual([])
  })
})
