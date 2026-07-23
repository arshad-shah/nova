import type { Disposable, DriverFactory, DriverRegistry, ConnectionMiddleware } from './types'

export interface MiddlewareEntry {
  id: string
  pluginName: string
  middleware: ConnectionMiddleware
}

export class DriverRegistryImpl implements DriverRegistry {
  private drivers = new Map<string, DriverFactory>()
  private middlewares = new Map<string, MiddlewareEntry>()

  register(id: string, factory: DriverFactory): Disposable {
    if (this.drivers.has(id)) {
      throw new Error(`Driver '${id}' is already registered`)
    }
    // Registration is deliberately pure — it stores the factory and constructs
    // nothing. A driver's capability declaration↔implementation agreement is
    // validated at the single adapter-construction chokepoint instead
    // (src/main/db/factory.ts, via driver-validation.ts), so this stays free of
    // the side effect of building a probe adapter. See issue #168.
    this.drivers.set(id, factory)
    return { dispose: () => { this.drivers.delete(id) } }
  }

  get(id: string): DriverFactory | undefined {
    return this.drivers.get(id)
  }

  has(id: string): boolean {
    return this.drivers.has(id)
  }

  getDriverIds(): string[] {
    return [...this.drivers.keys()]
  }

  registerConnectionMiddleware(id: string, middleware: ConnectionMiddleware, pluginName: string = 'unknown'): Disposable {
    if (this.middlewares.has(id)) {
      throw new Error(`Connection middleware '${id}' is already registered`)
    }
    const entry: MiddlewareEntry = { id, pluginName, middleware }
    this.middlewares.set(id, entry)
    return { dispose: () => { this.middlewares.delete(id) } }
  }

  getMiddlewares(): MiddlewareEntry[] {
    return [...this.middlewares.values()]
  }

  hasMiddleware(id: string): boolean {
    return this.middlewares.has(id)
  }

  clear(): void {
    this.drivers.clear()
    this.middlewares.clear()
  }
}
