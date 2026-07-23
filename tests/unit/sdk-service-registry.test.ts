import { describe, it, expect, vi } from 'vitest'
import { ServiceRegistryImpl } from '../../src/main/plugins/sdk/service-registry'

describe('ServiceRegistryImpl', () => {
  it('consume returns null when the service has not been provided', () => {
    const registry = new ServiceRegistryImpl()
    expect(registry.consume('nope')).toBeNull()
  })

  it('provide then consume returns the same implementation', () => {
    const registry = new ServiceRegistryImpl()
    const impl = { hello: () => 'world' }
    registry.provide('greeter', impl)
    expect(registry.consume('greeter')).toBe(impl)
  })

  it('a later provide call overrides the previous implementation for the same id', () => {
    const registry = new ServiceRegistryImpl()
    const a = { v: 1 }
    const b = { v: 2 }
    registry.provide('svc', a)
    registry.provide('svc', b)
    expect(registry.consume('svc')).toBe(b)
  })

  it('dispose removes the implementation so consume returns null again', () => {
    const registry = new ServiceRegistryImpl()
    const impl = { v: 1 }
    const handle = registry.provide('svc', impl)
    handle.dispose()
    expect(registry.consume('svc')).toBeNull()
  })

  it('dispose is a no-op when a newer registration has since replaced it', () => {
    const registry = new ServiceRegistryImpl()
    const a = { v: 1 }
    const b = { v: 2 }
    const handleA = registry.provide('svc', a)
    registry.provide('svc', b)
    handleA.dispose()
    expect(registry.consume('svc')).toBe(b)
  })

  it('onAvailable invokes the callback immediately when the service already exists', () => {
    const registry = new ServiceRegistryImpl()
    const impl = { v: 1 }
    registry.provide('svc', impl)
    const cb = vi.fn()
    registry.onAvailable('svc', cb)
    expect(cb).toHaveBeenCalledWith(impl)
    expect(cb).toHaveBeenCalledTimes(1)
  })

  it('onAvailable defers the callback until the service is later provided', () => {
    const registry = new ServiceRegistryImpl()
    const cb = vi.fn()
    registry.onAvailable('svc', cb)
    expect(cb).not.toHaveBeenCalled()

    const impl = { v: 1 }
    registry.provide('svc', impl)

    expect(cb).toHaveBeenCalledWith(impl)
    expect(cb).toHaveBeenCalledTimes(1)
  })

  it('multiple pending onAvailable listeners are all notified once on provide', () => {
    const registry = new ServiceRegistryImpl()
    const cb1 = vi.fn()
    const cb2 = vi.fn()
    registry.onAvailable('svc', cb1)
    registry.onAvailable('svc', cb2)
    const impl = { v: 1 }
    registry.provide('svc', impl)

    expect(cb1).toHaveBeenCalledWith(impl)
    expect(cb2).toHaveBeenCalledWith(impl)

    // A second provide should not re-notify the already-fired listeners
    registry.provide('svc', { v: 2 })
    expect(cb1).toHaveBeenCalledTimes(1)
    expect(cb2).toHaveBeenCalledTimes(1)
  })

  it('disposing a pending onAvailable listener before provide prevents it firing', () => {
    const registry = new ServiceRegistryImpl()
    const cb = vi.fn()
    const handle = registry.onAvailable('svc', cb)
    handle.dispose()
    registry.provide('svc', { v: 1 })
    expect(cb).not.toHaveBeenCalled()
  })

  it('a listener throwing does not prevent provide from completing or other listeners from running', () => {
    const registry = new ServiceRegistryImpl()
    const throwing = vi.fn(() => {
      throw new Error('boom')
    })
    const fine = vi.fn()
    registry.onAvailable('svc', throwing)
    registry.onAvailable('svc', fine)

    expect(() => registry.provide('svc', { v: 1 })).not.toThrow()
    expect(fine).toHaveBeenCalled()
  })

  it('services and listeners are isolated per serviceId', () => {
    const registry = new ServiceRegistryImpl()
    registry.provide('a', { name: 'a' })
    expect(registry.consume('b')).toBeNull()
    expect(registry.consume('a')).toEqual({ name: 'a' })
  })
})
