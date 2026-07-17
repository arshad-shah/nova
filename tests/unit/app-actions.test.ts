import { describe, it, expect, vi, beforeEach } from 'vitest'
import { parseActionHref } from '../../src/renderer/src/lib/app-actions/parse'
import { AppActionRegistry } from '../../src/renderer/src/lib/app-actions/registry'
import { resolveConnection } from '../../src/renderer/src/lib/app-actions/resolve'
import { APP_ACTION } from '../../src/renderer/src/lib/app-actions/ids'
import type { AppAction } from '../../src/renderer/src/lib/app-actions/types'
import type { ConnectionProfile } from '../../shared/types'

describe('parseActionHref', () => {
  it('parses an action href with params', () => {
    expect(parseActionHref('verql://action/open-settings?category=ai')).toEqual({
      id: 'open-settings',
      params: { category: 'ai' }
    })
  })

  it('parses an action href with no params', () => {
    expect(parseActionHref('verql://action/open-connections-panel')).toEqual({
      id: 'open-connections-panel',
      params: {}
    })
  })

  it('decodes encoded param values', () => {
    const parsed = parseActionHref('verql://action/new-query-tab?sql=SELECT%20*%20FROM%20users')
    expect(parsed?.params.sql).toBe('SELECT * FROM users')
  })

  it('returns null for non-verql hrefs', () => {
    expect(parseActionHref('https://example.com')).toBeNull()
    expect(parseActionHref('verql://something-else/foo')).toBeNull()
    expect(parseActionHref('')).toBeNull()
  })

  it('returns null for a malformed URL instead of throwing', () => {
    expect(() => parseActionHref('not a valid url at all')).not.toThrow()
    expect(parseActionHref('not a valid url at all')).toBeNull()
  })

  it('returns null when the action path is empty', () => {
    expect(parseActionHref('verql://action/')).toBeNull()
    expect(parseActionHref('verql://action')).toBeNull()
  })
})

describe('AppActionRegistry', () => {
  let registry: AppActionRegistry

  const navAction: AppAction = {
    id: APP_ACTION.OPEN_SETTINGS, title: 'Open Settings', description: 'Open settings',
    kind: 'navigation', run: vi.fn()
  }

  beforeEach(() => {
    registry = new AppActionRegistry()
    vi.clearAllMocks()
  })

  it('registers and retrieves an action', () => {
    registry.register(navAction)
    expect(registry.get(APP_ACTION.OPEN_SETTINGS)).toBe(navAction)
    expect(registry.list()).toContain(navAction)
  })

  it('unregisters via the returned disposer', () => {
    const dispose = registry.register(navAction)
    dispose()
    expect(registry.get(APP_ACTION.OPEN_SETTINGS)).toBeUndefined()
  })

  it('runs an action with params', async () => {
    registry.register(navAction)
    await registry.run(APP_ACTION.OPEN_SETTINGS, { category: 'ai' })
    expect(navAction.run).toHaveBeenCalledWith({ category: 'ai' })
  })

  it('throws when running an unknown action', async () => {
    await expect(registry.run('nope')).rejects.toThrow(/unknown/i)
  })

  it('describes the catalog for the system prompt', () => {
    registry.register(navAction)
    const text = registry.describeForPrompt()
    // Compact format: `id "Title"` (description dropped to save tokens).
    expect(text).toContain('open-settings')
    expect(text).toContain('"Open Settings"')
  })

  it('describes an empty catalog as an empty string', () => {
    expect(registry.describeForPrompt()).toBe('')
  })

  it('onChange notifies subscribers when an action is registered or unregistered', () => {
    const cb = vi.fn()
    registry.onChange(cb)
    const dispose = registry.register(navAction)
    expect(cb).toHaveBeenCalledTimes(1)
    dispose()
    expect(cb).toHaveBeenCalledTimes(2)
  })

  it('onChange — the returned disposer stops further notifications', () => {
    const cb = vi.fn()
    const unsub = registry.onChange(cb)
    unsub()
    registry.register(navAction)
    expect(cb).not.toHaveBeenCalled()
  })
})

describe('resolveConnection', () => {
  const conns = [
    { id: 'c1', name: 'Prod', type: 'postgres', database: 'app' },
    { id: 'c2', name: 'Local Dev', type: 'sqlite', database: 'dev.db' }
  ] as unknown as ConnectionProfile[]

  it('matches by id', () => {
    expect(resolveConnection(conns, 'c2')).toBe(conns[1])
  })

  it('matches by name, case-insensitively', () => {
    expect(resolveConnection(conns, 'local dev')).toBe(conns[1])
  })

  it('prefers an id match over a name match', () => {
    const collide = [
      { id: 'Prod', name: 'Other', type: 'mysql', database: 'x' },
      { id: 'c9', name: 'Prod', type: 'postgres', database: 'y' }
    ] as unknown as ConnectionProfile[]
    expect(resolveConnection(collide, 'Prod')).toBe(collide[0])
  })

  it('returns undefined for no match or empty input', () => {
    expect(resolveConnection(conns, 'nope')).toBeUndefined()
    expect(resolveConnection(conns, undefined)).toBeUndefined()
    expect(resolveConnection(conns, '   ')).toBeUndefined()
  })
})
