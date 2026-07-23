// src/main/plugins/sdk/index.ts is mostly a re-export barrel, but
// createPluginContext()/disposePluginContext() contain real behavioural logic
// worth locking down: permission gating on the guarded surfaces (keyring,
// connections, ipc), command/exporter/importer/formatter id namespacing by
// plugin name, the trusted-vs-untrusted rootSettings split, and LIFO
// disposal of a plugin's tracked subscriptions. We fake every registry
// collaborator and assert on the *behavior* of the context it builds.
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn(), removeHandler: vi.fn() },
}))

const { broadcastEventMock } = vi.hoisted(() => ({ broadcastEventMock: vi.fn() }))
vi.mock('../../src/main/ipc/broadcast', () => ({ broadcast: broadcastEventMock }))

import { ipcMain } from 'electron'
import { createPluginContext, disposePluginContext } from '../../src/main/plugins/sdk/index'
import { PermissionDeniedError } from '../../src/main/plugins/sdk/permissions'

function disposable() {
  return { dispose: vi.fn() }
}

function makeDeps(overrides: Partial<Parameters<typeof createPluginContext>[0]> = {}) {
  const driverRegistry = {
    register: vi.fn(() => disposable()),
    registerConnectionMiddleware: vi.fn(() => disposable()),
  }
  const commandRegistry = { register: vi.fn(() => disposable()) }
  const panelRegistry = { register: vi.fn(() => disposable()) }
  const uiRegistry = {
    registerPanel: vi.fn(() => disposable()),
    registerStatusBar: vi.fn(() => disposable()),
    registerToolbar: vi.fn(() => disposable()),
    registerTab: vi.fn(() => disposable()),
    registerSlot: vi.fn(() => disposable()),
    registerResolver: vi.fn(() => disposable()),
    invalidate: vi.fn(),
  }
  const completionRegistry = { register: vi.fn(() => disposable()) }
  const schemaAccess = { getTables: vi.fn() }
  const connectionAccess = {
    getActiveConnectionId: vi.fn(() => 'conn-1'),
    getProfile: vi.fn(() => null),
  }
  const settingsStore = { get: vi.fn(() => 'stored-value'), set: vi.fn() }
  const keyring = {
    store: vi.fn(async () => {}),
    retrieve: vi.fn(async () => null),
    delete: vi.fn(async () => {}),
    retrieveSync: vi.fn(() => null),
    storeSync: vi.fn(),
    has: vi.fn(() => false),
    listKeys: vi.fn(() => []),
  }
  const services = {
    provide: vi.fn(() => disposable()),
    consume: vi.fn(() => undefined),
    onAvailable: vi.fn(() => disposable()),
  }
  const exporterRegistry = { register: vi.fn(() => disposable()) }
  const importerRegistry = { register: vi.fn(() => disposable()) }
  const formatterRegistry = { register: vi.fn(() => disposable()) }
  const typeMapperRegistry = { register: vi.fn(() => disposable()) }
  const themeRegistry = { register: vi.fn(() => disposable()) }
  const notificationBus = { show: vi.fn() }
  const dragDropRegistry = { register: vi.fn(() => disposable()) }
  const toolRegistry = {
    register: vi.fn(() => disposable()),
    unregister: vi.fn(),
    get: vi.fn(),
    list: vi.fn(() => []),
    getToolDefinitions: vi.fn(() => []),
    execute: vi.fn(async () => ({})),
    onChange: vi.fn(() => disposable()),
  }

  return {
    pluginName: 'my-plugin',
    trusted: false,
    grantedPermissions: [],
    driverRegistry,
    commandRegistry,
    panelRegistry,
    uiRegistry,
    completionRegistry,
    schemaAccess,
    connectionAccess,
    settingsStore,
    keyring,
    services,
    exporterRegistry,
    importerRegistry,
    formatterRegistry,
    typeMapperRegistry,
    themeRegistry,
    notificationBus,
    dragDropRegistry,
    toolRegistry,
    ...overrides,
  } as unknown as Parameters<typeof createPluginContext>[0]
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('createPluginContext — command namespacing', () => {
  it('namespaces a registered command id with the plugin name', () => {
    const deps = makeDeps()
    const ctx = createPluginContext(deps)
    const handler = () => {}
    ctx.commands.register('do-thing', handler)
    expect((deps as unknown as { commandRegistry: { register: ReturnType<typeof vi.fn> } }).commandRegistry.register)
      .toHaveBeenCalledWith('my-plugin:do-thing', handler)
  })
})

describe('createPluginContext — exporter/importer/formatter id namespacing', () => {
  it('prefixes exporter, importer, and formatter ids with the plugin name', () => {
    const deps = makeDeps()
    const ctx = createPluginContext(deps)
    const exporterFn = vi.fn()
    const importerFn = vi.fn()
    const formatterFn = vi.fn()
    ctx.exporters.register('csv', exporterFn)
    ctx.importers.register('csv', importerFn)
    ctx.formatters.register('sql', formatterFn)
    expect(deps.exporterRegistry.register).toHaveBeenCalledWith('my-plugin:csv', exporterFn)
    expect(deps.importerRegistry.register).toHaveBeenCalledWith('my-plugin:csv', importerFn)
    expect(deps.formatterRegistry.register).toHaveBeenCalledWith('my-plugin:sql', formatterFn)
  })
})

describe('createPluginContext — theme and drag-drop source stamping', () => {
  it('stamps the plugin name as `source` on a registered theme', () => {
    const deps = makeDeps()
    const ctx = createPluginContext(deps)
    ctx.themes.register({ id: 'dark-plus', name: 'Dark Plus' } as never)
    expect(deps.themeRegistry.register).toHaveBeenCalledWith({ id: 'dark-plus', name: 'Dark Plus', source: 'my-plugin' })
  })

  it('stamps the plugin name as `source` on a registered drag-drop provider', () => {
    const deps = makeDeps()
    const ctx = createPluginContext(deps)
    ctx.dragDrop.register({ id: 'importer' } as never)
    expect(deps.dragDropRegistry.register).toHaveBeenCalledWith({ id: 'importer', source: 'my-plugin' })
  })
})

describe('createPluginContext — keyring permission gating', () => {
  it('an untrusted plugin without the keyring grant has its keyring calls rejected/thrown', async () => {
    const deps = makeDeps({ trusted: false, grantedPermissions: [] })
    const ctx = createPluginContext(deps)
    await expect(ctx.keyring.retrieve('ns', 'k')).rejects.toThrow(PermissionDeniedError)
    expect(() => ctx.keyring.retrieveSync('ns', 'k')).toThrow(PermissionDeniedError)
    expect(deps.keyring.retrieve).not.toHaveBeenCalled()
  })

  it('an untrusted plugin WITH the keyring grant can use it, delegating to the real keyring', async () => {
    const deps = makeDeps({ trusted: false, grantedPermissions: ['keyring'] })
    const ctx = createPluginContext(deps)
    await ctx.keyring.store('ns', 'k', 'v')
    expect(deps.keyring.store).toHaveBeenCalledWith('ns', 'k', 'v')
  })

  it('a trusted plugin bypasses gating entirely — the raw keyring object is handed back', () => {
    const deps = makeDeps({ trusted: true, grantedPermissions: [] })
    const ctx = createPluginContext(deps)
    expect(ctx.keyring).toBe(deps.keyring)
  })
})

describe('createPluginContext — connections permission gating', () => {
  it('an untrusted plugin without the connections grant throws synchronously', () => {
    const deps = makeDeps({ trusted: false, grantedPermissions: [] })
    const ctx = createPluginContext(deps)
    expect(() => ctx.connections.getActiveConnectionId()).toThrow(PermissionDeniedError)
  })

  it('an untrusted plugin with the connections grant delegates through', () => {
    const deps = makeDeps({ trusted: false, grantedPermissions: ['connections'] })
    const ctx = createPluginContext(deps)
    expect(ctx.connections.getActiveConnectionId()).toBe('conn-1')
  })
})

describe('createPluginContext — ipc permission gating', () => {
  it('throws when an untrusted plugin without the ipc grant calls ipc.handle', () => {
    const deps = makeDeps({ trusted: false, grantedPermissions: [] })
    const ctx = createPluginContext(deps)
    expect(() => ctx.ipc.handle('some:channel' as never, () => {})).toThrow(PermissionDeniedError)
    expect(ipcMain.handle).not.toHaveBeenCalled()
  })

  it('registers the channel with ipcMain.handle when the ipc grant is present, unwrapping the event arg', () => {
    const deps = makeDeps({ trusted: false, grantedPermissions: ['ipc'] })
    const ctx = createPluginContext(deps)
    const handler = vi.fn((a: number, b: number) => a + b)
    ctx.ipc.handle('some:channel' as never, handler as never)
    expect(ipcMain.handle).toHaveBeenCalledWith('some:channel', expect.any(Function))
    const registered = (ipcMain.handle as ReturnType<typeof vi.fn>).mock.calls[0][1]
    const result = registered({ senderFrame: {} }, 2, 3)
    expect(handler).toHaveBeenCalledWith(2, 3)
    expect(result).toBe(5)
  })

  it('disposing the returned disposable removes the ipc handler', () => {
    const deps = makeDeps({ trusted: false, grantedPermissions: ['ipc'] })
    const ctx = createPluginContext(deps)
    const d = ctx.ipc.handle('some:channel' as never, () => {})
    d.dispose()
    expect(ipcMain.removeHandler).toHaveBeenCalledWith('some:channel')
  })
})

describe('createPluginContext — broadcast delegates to the shared IPC event sender', () => {
  it('forwards channel and args verbatim', () => {
    const deps = makeDeps()
    const ctx = createPluginContext(deps)
    ctx.broadcast('plugins:ui-contributions-changed' as never, 'payload-a', 'payload-b')
    expect(broadcastEventMock).toHaveBeenCalledWith('plugins:ui-contributions-changed', 'payload-a', 'payload-b')
  })
})

describe('createPluginContext — rootSettings trust boundary', () => {
  it('a trusted plugin gets the real settings store', () => {
    const deps = makeDeps({ trusted: true })
    const ctx = createPluginContext(deps)
    expect(ctx.rootSettings.get('any.key')).toBe('stored-value')
  })

  it('an untrusted plugin gets a throwing shim instead of silent access', () => {
    const deps = makeDeps({ trusted: false })
    const ctx = createPluginContext(deps)
    expect(() => ctx.rootSettings.get('any.key')).toThrow(/restricted to trusted/)
    expect(() => ctx.rootSettings.set('any.key', 1)).toThrow(/restricted to trusted/)
  })
})

describe('createPluginContext — tools registry scoping', () => {
  it('register() tracks a disposable as a plugin subscription (cleaned up on dispose)', () => {
    const deps = makeDeps()
    const ctx = createPluginContext(deps)
    const toolDisposable = ctx.tools.register({ id: 'my-tool' } as never)
    expect(ctx.subscriptions).toContain(toolDisposable)
  })

  it('list()/get()/execute() read straight through to the shared registry', async () => {
    const deps = makeDeps()
    const ctx = createPluginContext(deps)
    ctx.tools.list()
    ctx.tools.get('x')
    await ctx.tools.execute('x', {}, {} as never)
    expect(deps.toolRegistry.list).toHaveBeenCalled()
    expect(deps.toolRegistry.get).toHaveBeenCalledWith('x')
    expect(deps.toolRegistry.execute).toHaveBeenCalledWith('x', {}, {})
  })
})

describe('disposePluginContext', () => {
  it('disposes every tracked subscription in reverse (LIFO) order', () => {
    const deps = makeDeps({ trusted: true, grantedPermissions: [] })
    const ctx = createPluginContext(deps)
    const order: string[] = []
    const first = { dispose: () => order.push('first') }
    const second = { dispose: () => order.push('second') }
    ctx.subscriptions.push(first, second)

    disposePluginContext(ctx)

    expect(order).toEqual(['second', 'first'])
  })

  it('clears the subscriptions array after disposal', () => {
    const deps = makeDeps()
    const ctx = createPluginContext(deps)
    ctx.subscriptions.push({ dispose: () => {} })
    disposePluginContext(ctx)
    expect(ctx.subscriptions.length).toBe(0)
  })

  it('continues disposing remaining subscriptions even if one throws', () => {
    const deps = makeDeps()
    const ctx = createPluginContext(deps)
    const cleanDispose = vi.fn()
    ctx.subscriptions.push(
      { dispose: cleanDispose },
      { dispose: () => { throw new Error('boom') } },
    )
    expect(() => disposePluginContext(ctx)).not.toThrow()
    expect(cleanDispose).toHaveBeenCalled()
  })
})
