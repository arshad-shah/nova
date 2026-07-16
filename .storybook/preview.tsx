import React from 'react'
import type { Preview } from '@storybook/react'
import { withThemeByDataAttribute } from '@storybook/addon-themes'
import '../src/renderer/src/styles/globals.css'
// In the running app, theme CSS is injected by the core-themes plugin via
// the theme registry. Storybook has no IPC bridge — inject the same CSS
// strings directly so the theme toolbar still works.
import { CORE_THEMES } from '../src/main/plugins/bundled/core-themes/themes-data'

if (typeof document !== 'undefined') {
  const STYLE_ID = 'storybook-core-themes'
  if (!document.getElementById(STYLE_ID)) {
    const style = document.createElement('style')
    style.id = STYLE_ID
    style.textContent = CORE_THEMES.map((t) => t.css ?? '').join('\n')
    document.head.appendChild(style)
  }
}

// Stub the preload bridge so renderer components that call window.electronAPI.invoke
// during mount (plugin contribution fetches, connection field fetches, etc.) don't
// crash in the browser-based Storybook environment.
if (typeof window !== 'undefined' && !(window as unknown as { electronAPI?: unknown }).electronAPI) {
  // Stub themes so the theme picker has entries when a story renders it.
  // The CSS imports above already attach the variables to [data-theme="…"].
  const STUB_THEMES = [
    // Ion ships with the shell (baseline.css), not the core-themes plugin, so
    // it isn't in CORE_THEMES — list it here to match the real picker order.
    { id: 'ion', name: 'Ion', type: 'dark', preview: { bg: '#0B0F16', sidebar: '#111827', text: '#F2F4F7', accent: '#7A5CFF' } },
    { id: 'nightshift', name: 'Nightshift', type: 'dark', preview: { bg: '#0B0F16', sidebar: '#131825', text: '#E8ECF3', accent: '#2bd9a3' } },
    { id: 'lab', name: 'Lab', type: 'light', preview: { bg: '#FAFAF6', sidebar: '#F1F0EA', text: '#1A1A1C', accent: '#115E59' } },
    { id: 'inkpaper', name: 'Ink & Paper', type: 'light', preview: { bg: '#F2EBDE', sidebar: '#ECE3D2', text: '#14110F', accent: '#9E3022' } },
    { id: 'dark', name: 'Dark', type: 'dark', preview: { bg: '#1e1e2e', sidebar: '#313244', text: '#cdd6f4', accent: '#b4befe' } },
    { id: 'light', name: 'Light', type: 'light', preview: { bg: '#eff1f5', sidebar: '#ccd0da', text: '#4c4f69', accent: '#7287fd' } },
    { id: 'midnight', name: 'Midnight', type: 'dark', preview: { bg: '#0d1117', sidebar: '#161b22', text: '#c9d1d9', accent: '#a78bfa' } },
    { id: 'dracula', name: 'Dracula', type: 'dark', preview: { bg: '#282a36', sidebar: '#44475a', text: '#f8f8f2', accent: '#bd93f9' } },
    { id: 'nord', name: 'Nord', type: 'dark', preview: { bg: '#2e3440', sidebar: '#3b4252', text: '#eceff4', accent: '#88c0d0' } },
    { id: 'solarized', name: 'Solarized', type: 'dark', preview: { bg: '#002b36', sidebar: '#073642', text: '#839496', accent: '#268bd2' } },
    { id: 'catppuccin', name: 'Catppuccin', type: 'dark', preview: { bg: '#1e1e2e', sidebar: '#313244', text: '#cdd6f4', accent: '#f5c2e7' } },
  ]
  ;(window as unknown as { electronAPI: { invoke: (...a: unknown[]) => Promise<unknown>; on: () => () => void } }).electronAPI = {
    invoke: async (channel: string) => (channel === 'themes:list' ? STUB_THEMES : []),
    on: () => () => {},
  }
}

const preview: Preview = {
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },

    backgrounds: { disable: true },
    layout: 'fullscreen',

    a11y: {
      // 'todo' - show a11y violations in the test UI only
      // 'error' - fail CI on a11y violations
      // 'off' - skip a11y checks entirely
      test: 'todo'
    }
  },
  decorators: [
    withThemeByDataAttribute({
      themes: {
        Ion: 'ion',
        Nightshift: 'nightshift',
        Lab: 'lab',
        'Ink & Paper': 'inkpaper',
        Dark: 'dark',
        Light: 'light',
        Midnight: 'midnight',
        Dracula: 'dracula',
        Nord: 'nord',
        Solarized: 'solarized',
        Catppuccin: 'catppuccin',
      },
      defaultTheme: 'Ion',
      attributeName: 'data-theme',
    }),
    (Story) => (
      <div
        style={{
          backgroundColor: 'var(--color-bg-primary)',
          color: 'var(--color-text-primary)',
          minHeight: '100vh',
          padding: '2rem',
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'center',
        }}
      >
        <Story />
      </div>
    ),
  ],
}

export default preview
