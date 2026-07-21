import { create } from 'zustand'
import { IPC_CHANNELS, IPC_EVENTS } from '@shared/ipc'
import { DEFAULT_THEME_ID } from '@shared/settings'

/** Baseline theme that ships with the app shell. Ion is the brand identity
 *  for Verql *and* the default theme, so it's not a plugin contribution — a
 *  default that only paints when a plugin activates isn't a default. It lives
 *  here (CSS vars in `primitives/theme/baseline.css`, Monaco def below) and is
 *  always present in the picker. Nightshift, the previous brand theme, is now
 *  an ordinary selectable theme contributed by core-themes. */
const BASELINE_ION: RegisteredThemeView = {
  id: DEFAULT_THEME_ID.DARK,
  name: 'Ion',
  type: 'dark',
  preview: { bg: '#0B0F16', sidebar: '#111827', text: '#F2F4F7', accent: '#7A5CFF' },
  source: '<baseline>',
  monaco: {
    base: 'vs-dark',
    colors: {
      'editor.background': '#0B0F16',
      'editor.foreground': '#F2F4F7',
      'editor.lineHighlightBackground': '#7A5CFF0F',
      'editor.selectionBackground': '#00D4FF2E',
      'editorLineNumber.foreground': '#66738A',
      'editorCursor.foreground': '#00D4FF',
      'editor.selectionHighlightBackground': '#00D4FF1C',
      'editorBracketMatch.background': '#7A5CFF33',
      'editorBracketMatch.border': '#7A5CFF55'
    },
    // Syntax comes from the functional set (--fn-syntax-*), which is identical
    // on every theme: a keyword shouldn't change meaning with the paint.
    rules: [
      { token: 'keyword', foreground: '#5EA8FF' },
      { token: 'string', foreground: '#FF8B73' },
      { token: 'number', foreground: '#7DD3FC' },
      { token: 'comment', foreground: '#66738A', fontStyle: 'italic' },
      { token: 'type', foreground: '#A78BFA' },
      { token: 'identifier', foreground: '#F2F4F7' },
      { token: 'operator', foreground: '#A7B2C5' },
      { token: 'delimiter', foreground: '#A7B2C5' }
    ]
  }
}

export interface ThemeMonacoDef {
  base: 'vs' | 'vs-dark'
  colors: Record<string, string>
  rules: { token: string; foreground: string; background?: string; fontStyle?: string }[]
}

export interface ThemeValidationView {
  ok: boolean
  missingRequired: string[]
  missingRecommended: string[]
}

export interface RegisteredThemeView {
  id: string
  name: string
  type: 'dark' | 'light'
  tokens?: Record<string, string>
  css?: string
  monaco?: ThemeMonacoDef
  preview?: { bg: string; sidebar: string; text: string; accent: string }
  source?: string
  validation?: ThemeValidationView
}

interface ThemesState {
  themes: RegisteredThemeView[]
  loaded: boolean
  fetch: () => Promise<void>
}

const STYLE_ELEMENT_ID = 'plugin-themes-injected'

function injectThemes(themes: RegisteredThemeView[]): void {
  const head = document.head
  let style = document.getElementById(STYLE_ELEMENT_ID) as HTMLStyleElement | null
  if (!style) {
    style = document.createElement('style')
    style.id = STYLE_ELEMENT_ID
    head.appendChild(style)
  }
  const blocks: string[] = []
  for (const t of themes) {
    const parts: string[] = []
    if (t.tokens) {
      const vars = Object.entries(t.tokens)
        .map(([k, v]) => `  ${k.startsWith('--') ? k : `--${k}`}: ${v};`)
        .join('\n')
      parts.push(`[data-theme="${t.id}"] {\n${vars}\n}`)
    }
    if (t.css) {
      parts.push(t.css)
    }
    if (parts.length) blocks.push(parts.join('\n\n'))
  }
  style.textContent = blocks.join('\n\n')
}

export const useThemesStore = create<ThemesState>((set) => ({
  themes: [],
  loaded: false,
  fetch: async () => {
    if (typeof window === 'undefined' || !window.electronAPI) {
      set({ themes: [BASELINE_ION], loaded: true })
      return
    }
    let list: RegisteredThemeView[] = []
    try {
      list = await window.electronAPI.invoke(IPC_CHANNELS.THEMES_LIST)
    } catch {
      list = []
    }
    injectThemes(list)
    // Ion is the app's brand theme — always present, sourced from the
    // baseline rather than any plugin. Ignore any plugin trying to register
    // a theme with the same id to keep the brand surface authoritative.
    const filtered = list.filter((t) => t.id !== DEFAULT_THEME_ID.DARK)
    set({ themes: [BASELINE_ION, ...filtered], loaded: true })
  }
}))

if (typeof window !== 'undefined' && window.electronAPI) {
  // Subscribe to mutations: refetch + reinject on every theme change.
  window.electronAPI.on(IPC_EVENTS.THEMES_CHANGED, () => {
    useThemesStore.getState().fetch()
  })
}
