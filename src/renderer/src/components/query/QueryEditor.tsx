import { useCallback, useEffect, useState } from 'react'
import { useAIInlineSuggest } from '@/hooks/useAIInlineSuggest'
import Editor, { type Monaco, type OnMount } from '@monaco-editor/react'
import type { editor } from 'monaco-editor'
import { registerCompletionProvider, registerQueryFormattingProvider } from '@/lib/monaco-sql'
import { registerAIInlineCompletionProvider } from '@/lib/monaco-ai-completion'
import { defineAppThemes, getMonacoThemeName } from '@/lib/monaco-themes'
import { StatementGutter } from './StatementGutter'
import { useEditorActions } from './hooks/useEditorActions'
import { useEditorOptions } from './hooks/useEditorOptions'
import { useSqlCompletions } from './hooks/useSqlCompletions'
import { editorRegistry } from '@/stores/editor'
import { useConnectionsStore } from '@/stores/connections'
import { useSettingsStore } from '@/stores/settings'
import { useDriverCapabilitiesStore } from '@/stores/driver-capabilities'
import { Flex, Text, useTheme } from '@/primitives'
import { useTranslation } from '@/i18n/I18nProvider'

interface Props {
  tabId: string
  value: string
  onChange: (value: string) => void
  onExecute: () => void
  onSave?: () => void
  connectionId: string | null
  schema: string | null
  databaseType?: string
}

const registeredLanguages = new Set<string>()

export function QueryEditor({ tabId, value, onChange, onExecute, onSave, connectionId, schema, databaseType }: Props) {
  const { t } = useTranslation()
  // Tracked in state (not refs) so the keybindings effect re-runs once Monaco
  // is ready, instead of silently missing the initial registration.
  const [editorInstance, setEditorInstance] = useState<editor.IStandaloneCodeEditor | null>(null)
  const [monacoInstance, setMonacoInstance] = useState<Monaco | null>(null)
  const connectedIds = useConnectionsStore(s => s.connectedIds)
  const { theme } = useTheme()
  const editorSettings = useSettingsStore((s) => s.settings.editor)
  const keybindings = useSettingsStore((s) => s.settings.keybindings)

  // The Monaco language is contributed by the driver plugin (`editorLanguage`
  // in its DriverFactory). The renderer doesn't branch on db type.
  const cachedCaps = useDriverCapabilitiesStore((s) => databaseType ? s.byType[databaseType] : undefined)
  const fetchCaps = useDriverCapabilitiesStore((s) => s.fetch)
  useEffect(() => {
    if (databaseType && cachedCaps === undefined) {
      fetchCaps(databaseType).catch(() => {})
    }
  }, [databaseType, cachedCaps, fetchCaps])
  const language = cachedCaps?.editorLanguage ?? 'sql'

  // Define themes BEFORE the editor mounts. Monaco's <Editor> applies its
  // `theme` prop synchronously during construction; if the named theme
  // ("verql-dark" etc.) hasn't been defined yet, Monaco silently falls back
  // to its built-in "vs" (light). Using `beforeMount` rather than `onMount`
  // means the first paint already shows the correct colours — no light flash.
  const handleBeforeMount = useCallback((monaco: Monaco) => {
    defineAppThemes(monaco)
  }, [])

  const handleMount: OnMount = useCallback((ed, monaco) => {
    setEditorInstance(ed)
    setMonacoInstance(monaco)

    // Idempotent — defineAppThemes guards itself. Belt and suspenders in case
    // a host wires this editor without going through beforeMount.
    defineAppThemes(monaco)

    if (!registeredLanguages.has(language)) {
      registerCompletionProvider(monaco, language)
      // Formatting is language-agnostic: the provider resolves a plugin-owned
      // formatter for the model's language + connection, and no-ops when none.
      registerQueryFormattingProvider(monaco, language)
      if (language === 'sql') {
        registerAIInlineCompletionProvider(monaco, language)
      }
      registeredLanguages.add(language)
    }

    // Publish ourselves to the editor registry so the command palette,
    // run-selection action, and any plugin can introspect or drive the editor.
    editorRegistry.register({ editor: ed, monaco, tabId })

    ed.focus()
  }, [language, tabId])

  // Keep the registry pointed at *this* editor while the tab is mounted, and
  // tear it down on unmount so the palette doesn't reference a dead instance.
  useEffect(() => {
    return () => editorRegistry.unregister(tabId)
  }, [tabId])

  // Live keybinding-driven editor actions (execute / save / AI trigger).
  useEditorActions({ editorInstance, monacoInstance, keybindings, language, onExecute, onSave })

  useAIInlineSuggest(language === 'sql' ? editorInstance : null)

  // Completion sources (AI inline context + plugin completion items).
  useSqlCompletions(connectionId, schema, connectedIds, databaseType)

  // Construction options, kept in sync with Settings → Editor.
  const options = useEditorOptions(editorSettings, editorInstance)

  // Theme — Monaco won't restyle existing tokens when the `theme` prop changes
  // mid-life unless we tell it to. `setTheme` is global (affects every editor
  // instance), which is what we want: flipping themes in Settings updates every
  // open query tab.
  useEffect(() => {
    if (!monacoInstance) return
    monacoInstance.editor.setTheme(getMonacoThemeName(theme))
  }, [monacoInstance, theme])

  return (
    <>
      <Editor
        language={language}
        value={value}
        onChange={(v) => onChange(v ?? '')}
        theme={getMonacoThemeName(theme)}
        options={options}
        beforeMount={handleBeforeMount}
        onMount={handleMount}
        loading={
          <Flex align="center" justify="center" className="h-full">
            <Text size="sm" color="muted">{t('query.editor.loading')}</Text>
          </Flex>
        }
      />
      {editorInstance ? (
        <StatementGutter
          editor={editorInstance}
          tabId={tabId}
          connectionId={connectionId}
          dbType={databaseType}
          statementSyntax={cachedCaps?.statementSyntax}
          supportsDollarQuoting={cachedCaps?.supportsDollarQuoting}
        />
      ) : null}
    </>
  )
}
