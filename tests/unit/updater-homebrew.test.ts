// src/main/updater/homebrew.ts shells out to `brew` to detect/check/apply
// Homebrew-cask updates. We mock child_process.spawn so tests exercise the
// real parsing/decision logic (isAvailable gating, version-compare in
// checkForUpdate, progress reporting in update) without touching a real brew.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { EventEmitter } from 'events'

const spawnMock = vi.fn()

vi.mock('child_process', () => ({
  spawn: (...args: unknown[]) => spawnMock(...args),
  default: { spawn: (...args: unknown[]) => spawnMock(...args) },
}))

import { HomebrewUpdater } from '../../src/main/updater/homebrew'

/** Builds a fake ChildProcess that emits the given stdout/stderr then closes. */
function mockChild(opts: { stdout?: string; stderr?: string; code?: number; errorInsteadOfClose?: boolean }) {
  const child: any = new EventEmitter()
  child.stdout = new EventEmitter()
  child.stderr = new EventEmitter()
  // Emit asynchronously so `.on` listeners are attached first.
  process.nextTick(() => {
    if (opts.stdout) child.stdout.emit('data', Buffer.from(opts.stdout))
    if (opts.stderr) child.stderr.emit('data', Buffer.from(opts.stderr))
    if (opts.errorInsteadOfClose) {
      child.emit('error', new Error('spawn failed'))
    } else {
      child.emit('close', opts.code ?? 0)
    }
  })
  return child
}

let originalPlatform: PropertyDescriptor | undefined

beforeEach(() => {
  spawnMock.mockReset()
  originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform')
})

afterEach(() => {
  if (originalPlatform) Object.defineProperty(process, 'platform', originalPlatform)
})

function setPlatform(p: string) {
  Object.defineProperty(process, 'platform', { value: p, configurable: true })
}

describe('HomebrewUpdater.isAvailable', () => {
  it('returns false on win32 without ever invoking brew', async () => {
    setPlatform('win32')
    const updater = new HomebrewUpdater('verql', '1.0.0')
    const result = await updater.isAvailable()
    expect(result).toBe(false)
    expect(spawnMock).not.toHaveBeenCalled()
  })

  it('returns false when the brew binary is not present (spawn error)', async () => {
    setPlatform('darwin')
    spawnMock.mockImplementation(() => mockChild({ errorInsteadOfClose: true }))
    const updater = new HomebrewUpdater('verql', '1.0.0')
    expect(await updater.isAvailable()).toBe(false)
  })

  it('returns false when brew exists but the cask is not installed via brew', async () => {
    setPlatform('darwin')
    spawnMock.mockImplementation((cmd: string, args: string[]) => {
      if (args[0] === '--version') return mockChild({ code: 0 })
      return mockChild({ code: 1 }) // brew list --cask fails
    })
    const updater = new HomebrewUpdater('verql', '1.0.0')
    expect(await updater.isAvailable()).toBe(false)
  })

  it('returns true on linux when brew exists and the cask is listed', async () => {
    setPlatform('linux')
    spawnMock.mockImplementation(() => mockChild({ code: 0 }))
    const updater = new HomebrewUpdater('verql', '1.0.0')
    expect(await updater.isAvailable()).toBe(true)
  })
})

describe('HomebrewUpdater.getCurrentVersion', () => {
  it('returns the version passed to the constructor', () => {
    const updater = new HomebrewUpdater('verql', '2.3.4')
    expect(updater.getCurrentVersion()).toBe('2.3.4')
  })
})

describe('HomebrewUpdater.checkForUpdate', () => {
  it('reports available:true when the cask entry has a newer current_version', async () => {
    setPlatform('darwin')
    const json = JSON.stringify({
      casks: [{ name: 'verql', installed_versions: ['1.0.0'], current_version: '1.1.0' }],
    })
    spawnMock.mockImplementation(() => mockChild({ stdout: json, code: 0 }))
    const updater = new HomebrewUpdater('verql', '1.0.0')
    const info = await updater.checkForUpdate()
    expect(info).toEqual({ currentVersion: '1.0.0', latestVersion: '1.1.0', available: true })
  })

  it('reports available:false when the latest version equals the current version', async () => {
    setPlatform('darwin')
    const json = JSON.stringify({
      casks: [{ name: 'verql', current_version: '1.0.0' }],
    })
    spawnMock.mockImplementation(() => mockChild({ stdout: json, code: 0 }))
    const updater = new HomebrewUpdater('verql', '1.0.0')
    const info = await updater.checkForUpdate()
    expect(info).toEqual({ currentVersion: '1.0.0', latestVersion: '1.0.0', available: false })
  })

  it('reports no update when the cask array is empty (up to date)', async () => {
    setPlatform('darwin')
    const json = JSON.stringify({ casks: [] })
    spawnMock.mockImplementation(() => mockChild({ stdout: json, code: 0 }))
    const updater = new HomebrewUpdater('verql', '1.0.0')
    const info = await updater.checkForUpdate()
    expect(info).toEqual({ currentVersion: '1.0.0', latestVersion: null, available: false })
  })

  it('reports no update when the cask array does not contain this cask by name', async () => {
    setPlatform('darwin')
    const json = JSON.stringify({ casks: [{ name: 'other-cask', current_version: '9.9.9' }] })
    spawnMock.mockImplementation(() => mockChild({ stdout: json, code: 0 }))
    const updater = new HomebrewUpdater('verql', '1.0.0')
    const info = await updater.checkForUpdate()
    expect(info).toEqual({ currentVersion: '1.0.0', latestVersion: null, available: false })
  })

  it('treats a non-zero brew exit code as no-update rather than throwing', async () => {
    setPlatform('darwin')
    spawnMock.mockImplementation(() => mockChild({ code: 1, stderr: 'not installed' }))
    const updater = new HomebrewUpdater('verql', '1.0.0')
    const info = await updater.checkForUpdate()
    expect(info).toEqual({ currentVersion: '1.0.0', latestVersion: null, available: false })
  })

  it('treats malformed JSON stdout as no-update rather than throwing', async () => {
    setPlatform('darwin')
    spawnMock.mockImplementation(() => mockChild({ stdout: 'not json{{{', code: 0 }))
    const updater = new HomebrewUpdater('verql', '1.0.0')
    const info = await updater.checkForUpdate()
    expect(info).toEqual({ currentVersion: '1.0.0', latestVersion: null, available: false })
  })

  it('treats a missing current_version field as latestVersion null', async () => {
    setPlatform('darwin')
    const json = JSON.stringify({ casks: [{ name: 'verql' }] })
    spawnMock.mockImplementation(() => mockChild({ stdout: json, code: 0 }))
    const updater = new HomebrewUpdater('verql', '1.0.0')
    const info = await updater.checkForUpdate()
    expect(info).toEqual({ currentVersion: '1.0.0', latestVersion: null, available: false })
  })
})

describe('HomebrewUpdater.update', () => {
  it('reports downloading then done with restartRequired on success', async () => {
    setPlatform('darwin')
    spawnMock.mockImplementation(() => mockChild({ code: 0 }))
    const updater = new HomebrewUpdater('verql', '1.0.0')
    const progressEvents: unknown[] = []
    await updater.update((p) => progressEvents.push(p))
    expect(progressEvents).toEqual([
      { phase: 'downloading' },
      { phase: 'done', restartRequired: true },
    ])
  })

  it('reports an error phase with trimmed stderr when brew upgrade fails', async () => {
    setPlatform('darwin')
    spawnMock.mockImplementation(() => mockChild({ code: 1, stderr: '  upgrade failed: locked  \n' }))
    const updater = new HomebrewUpdater('verql', '1.0.0')
    const progressEvents: unknown[] = []
    await updater.update((p) => progressEvents.push(p))
    expect(progressEvents).toEqual([
      { phase: 'downloading' },
      { phase: 'error', message: 'upgrade failed: locked' },
    ])
  })

  it('falls back to a code-based error message when stderr is empty', async () => {
    setPlatform('darwin')
    spawnMock.mockImplementation(() => mockChild({ code: 7 }))
    const updater = new HomebrewUpdater('verql', '1.0.0')
    const progressEvents: unknown[] = []
    await updater.update((p) => progressEvents.push(p))
    expect(progressEvents).toEqual([
      { phase: 'downloading' },
      { phase: 'error', message: 'brew exited with code 7' },
    ])
  })
})
