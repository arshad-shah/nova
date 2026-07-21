// lib/monaco-themes.ts syncs the theme registry onto a Monaco instance and
// resolves the active theme id. It subscribes to useThemesStore at module
// load time, so each test needs a FRESH INSTANCE of both modules together —
// resetting modules and then setting state on the *old*, statically-imported
// store would silently write to a store instance monaco-themes.ts never sees.
import { describe, it, expect, vi } from 'vitest'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function freshModule(themes: any[]) {
  vi.resetModules()
  const { useThemesStore } = await import('../../src/renderer/src/stores/themes')
  useThemesStore.setState({ themes, loaded: true })
  const mod = await import('../../src/renderer/src/lib/monaco-themes')
  return { mod, useThemesStore }
}

function fakeMonaco() {
  return {
    editor: { defineTheme: vi.fn() },
  } as unknown as { editor: { defineTheme: ReturnType<typeof vi.fn> } }
}

const ION_WITH_MONACO = {
  id: 'ion', name: 'Ion', type: 'dark' as const,
  preview: { bg: '', sidebar: '', text: '', accent: '' }, source: '<baseline>',
  monaco: { base: 'vs-dark' as const, colors: { 'editor.background': '#0B0F16' }, rules: [{ token: 'keyword', foreground: '#5EA8FF' }] },
}
const MIDNIGHT_WITH_MONACO = {
  id: 'midnight', name: 'Midnight', type: 'dark' as const,
  preview: { bg: '', sidebar: '', text: '', accent: '' }, source: 'core-themes',
  monaco: { base: 'vs-dark' as const, colors: { 'editor.background': '#000' }, rules: [{ token: 'keyword', foreground: '#fff' }] },
}
const NO_MONACO_THEME = { id: 'sparse', name: 'Sparse', type: 'light' as const, preview: { bg: '', sidebar: '', text: '', accent: '' }, source: 'p' }

describe('defineAppThemes', () => {
  it('registers only themes that ship a monaco definition', async () => {
    const { mod } = await freshModule([ION_WITH_MONACO, MIDNIGHT_WITH_MONACO, NO_MONACO_THEME])
    const monaco = fakeMonaco()
    mod.defineAppThemes(monaco as never)
    expect(monaco.editor.defineTheme).toHaveBeenCalledTimes(2)
    expect(monaco.editor.defineTheme).toHaveBeenCalledWith('midnight', expect.objectContaining({ base: 'vs-dark', inherit: true }))
  })

  it('is idempotent — a second call does not re-define an already-defined theme', async () => {
    const { mod } = await freshModule([MIDNIGHT_WITH_MONACO])
    const monaco = fakeMonaco()
    mod.defineAppThemes(monaco as never)
    mod.defineAppThemes(monaco as never)
    expect(monaco.editor.defineTheme).toHaveBeenCalledTimes(1)
  })

  it('picks up a newly-added theme when the store updates after the initial sync', async () => {
    const { mod, useThemesStore } = await freshModule([NO_MONACO_THEME])
    const monaco = fakeMonaco()
    mod.defineAppThemes(monaco as never)
    expect(monaco.editor.defineTheme).not.toHaveBeenCalled()

    useThemesStore.setState({ themes: [NO_MONACO_THEME, MIDNIGHT_WITH_MONACO] })
    expect(monaco.editor.defineTheme).toHaveBeenCalledTimes(1)
    expect(monaco.editor.defineTheme).toHaveBeenCalledWith('midnight', expect.anything())
  })

  it('does not resync when the themes array reference is unchanged', async () => {
    const { mod, useThemesStore } = await freshModule([MIDNIGHT_WITH_MONACO])
    const monaco = fakeMonaco()
    mod.defineAppThemes(monaco as never)
    expect(monaco.editor.defineTheme).toHaveBeenCalledTimes(1)
    // Re-set state with the exact same themes array reference (e.g. an
    // unrelated field changing) — the subscriber's `state.themes ===
    // prev.themes` guard should skip re-sync entirely.
    const { themes } = useThemesStore.getState()
    useThemesStore.setState({ loaded: true, themes })
    expect(monaco.editor.defineTheme).toHaveBeenCalledTimes(1)
  })

  it('does nothing when no Monaco instance has ever synced (subscriber guard)', async () => {
    // Update the store BEFORE any defineAppThemes call — monacoRef is still
    // null, so the subscriber callback must no-op rather than throw.
    const { useThemesStore } = await freshModule([NO_MONACO_THEME])
    expect(() => useThemesStore.setState({ themes: [MIDNIGHT_WITH_MONACO] })).not.toThrow()
  })
})

describe('getMonacoThemeName', () => {
  it('resolves a theme that declares a monaco definition by its own id', async () => {
    const { mod } = await freshModule([ION_WITH_MONACO, MIDNIGHT_WITH_MONACO])
    expect(mod.getMonacoThemeName('midnight')).toBe('midnight')
  })

  it('falls back to the ion baseline when the requested theme has no monaco definition', async () => {
    const { mod } = await freshModule([ION_WITH_MONACO, NO_MONACO_THEME])
    expect(mod.getMonacoThemeName('sparse')).toBe('ion')
  })

  it('falls back to "vs-dark" when even the ion baseline is unavailable', async () => {
    const { mod } = await freshModule([NO_MONACO_THEME])
    expect(mod.getMonacoThemeName('sparse')).toBe('vs-dark')
  })

  it('falls back to ion for a theme id that does not exist at all', async () => {
    const { mod } = await freshModule([ION_WITH_MONACO])
    expect(mod.getMonacoThemeName('does-not-exist')).toBe('ion')
  })
})
