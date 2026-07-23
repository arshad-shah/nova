import { describe, it, expect, vi } from 'vitest'
import { PluginSettingsImpl } from '../../src/main/plugins/sdk/settings'

function makeStore() {
  const data = new Map<string, unknown>()
  return {
    get: vi.fn((key: string) => data.get(key)),
    set: vi.fn((key: string, value: unknown) => {
      data.set(key, value)
    }),
    data,
  }
}

describe('PluginSettingsImpl', () => {
  it('set scopes the key under plugins.<name>.<key> in the backing store', () => {
    const store = makeStore()
    const settings = new PluginSettingsImpl('my-plugin', store)

    settings.set('theme', 'dark')

    expect(store.set).toHaveBeenCalledWith('plugins.my-plugin.theme', 'dark')
  })

  it('get reads back the value scoped the same way set wrote it', () => {
    const store = makeStore()
    const settings = new PluginSettingsImpl('my-plugin', store)

    settings.set('count', 3)

    expect(settings.get<number>('count')).toBe(3)
    expect(store.get).toHaveBeenCalledWith('plugins.my-plugin.count')
  })

  it('get returns undefined for a key that was never set', () => {
    const store = makeStore()
    const settings = new PluginSettingsImpl('my-plugin', store)
    expect(settings.get('missing')).toBeUndefined()
  })

  it('different plugin names are namespaced independently', () => {
    const store = makeStore()
    const a = new PluginSettingsImpl('plugin-a', store)
    const b = new PluginSettingsImpl('plugin-b', store)

    a.set('key', 'a-value')
    b.set('key', 'b-value')

    expect(a.get('key')).toBe('a-value')
    expect(b.get('key')).toBe('b-value')
  })

  it('onChanged fires the listener with the new value on set', () => {
    const store = makeStore()
    const settings = new PluginSettingsImpl('my-plugin', store)
    const listener = vi.fn()
    settings.onChanged('theme', listener)

    settings.set('theme', 'light')

    expect(listener).toHaveBeenCalledWith('light')
  })

  it('onChanged listener is not called for a different key', () => {
    const store = makeStore()
    const settings = new PluginSettingsImpl('my-plugin', store)
    const listener = vi.fn()
    settings.onChanged('theme', listener)

    settings.set('otherKey', 'value')

    expect(listener).not.toHaveBeenCalled()
  })

  it('dispose removes the listener so it no longer fires', () => {
    const store = makeStore()
    const settings = new PluginSettingsImpl('my-plugin', store)
    const listener = vi.fn()
    const handle = settings.onChanged('theme', listener)

    handle.dispose()
    settings.set('theme', 'dark')

    expect(listener).not.toHaveBeenCalled()
  })

  it('supports multiple listeners on the same key, all notified', () => {
    const store = makeStore()
    const settings = new PluginSettingsImpl('my-plugin', store)
    const listener1 = vi.fn()
    const listener2 = vi.fn()
    settings.onChanged('theme', listener1)
    settings.onChanged('theme', listener2)

    settings.set('theme', 'midnight')

    expect(listener1).toHaveBeenCalledWith('midnight')
    expect(listener2).toHaveBeenCalledWith('midnight')
  })
})
