import { useState, useMemo, useEffect } from 'react'
import { Pencil, RotateCcw } from 'lucide-react'
import { Stack, Text, Divider, Flex, Box } from '@/primitives'
import { SearchInput, Table, KbdGroup, Button, IconButton, Tooltip } from '@/primitives'
import { useSettingsStore } from '@/stores/settings'
import { usePluginCommands } from '@/stores/plugin-commands'
import { defaultSettings, type KeyBinding } from '@shared/settings'
import { chordFromEvent } from '@/lib/capture-keybinding'
import { useTranslation } from '@/i18n/I18nProvider'

export function KeybindingsSettings() {
  const { t } = useTranslation()
  const builtinKeybindings = useSettingsStore((s) => s.settings.keybindings)
  const setSetting = useSettingsStore((s) => s.set)
  const pluginCommands = usePluginCommands((s) => s.commands)
  const fetchPluginCommands = usePluginCommands((s) => s.fetch)
  const [search, setSearch] = useState('')
  const [recordingId, setRecordingId] = useState<string | null>(null)

  useEffect(() => {
    fetchPluginCommands()
  }, [fetchPluginCommands])

  const isMac = navigator.platform.includes('Mac')

  // While recording, capture the next chord in the capture phase so it doesn't
  // also fire the app's global shortcut handler. Esc cancels; invalid chords
  // (e.g. a bare letter) are ignored until a valid one is pressed.
  useEffect(() => {
    if (!recordingId) return
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault()
      e.stopPropagation()
      if (e.key === 'Escape') {
        setRecordingId(null)
        return
      }
      const keys = chordFromEvent(e)
      if (!keys) return
      const next = builtinKeybindings.map((kb) =>
        kb.id === recordingId ? { ...kb, keys } : kb,
      )
      void setSetting('keybindings', next)
      setRecordingId(null)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [recordingId, builtinKeybindings, setSetting])

  const resetBinding = (id: string) => {
    const def = defaultSettings.keybindings.find((k) => k.id === id)
    if (!def) return
    const next = builtinKeybindings.map((kb) => (kb.id === id ? { ...kb, keys: def.keys } : kb))
    void setSetting('keybindings', next)
  }

  const isCustom = (kb: KeyBinding): boolean => {
    const def = defaultSettings.keybindings.find((k) => k.id === kb.id)
    return !!def && def.keys.join('|') !== kb.keys.join('|')
  }

  const builtinFiltered = useMemo(() => {
    if (!search) return builtinKeybindings
    const q = search.toLowerCase()
    return builtinKeybindings.filter(
      (kb) => kb.label.toLowerCase().includes(q) || kb.category.toLowerCase().includes(q),
    )
  }, [builtinKeybindings, search])

  const builtinGrouped = useMemo(() => {
    const groups: Record<string, KeyBinding[]> = {}
    for (const kb of builtinFiltered) {
      ;(groups[kb.category] ??= []).push(kb)
    }
    return groups
  }, [builtinFiltered])

  // Plugin commands keep their manifest-defined binding and stay read-only here.
  const pluginBindings = useMemo(() => {
    const all: { id: string; label: string; keys: string[]; category: string }[] = []
    for (const pc of pluginCommands) {
      if (!pc.keybinding) continue
      all.push({
        id: `${pc.pluginId}:${pc.commandId}`,
        label: pc.title,
        keys: [pc.keybinding],
        category: pc.pluginDisplayName,
      })
    }
    if (!search) return all
    const q = search.toLowerCase()
    return all.filter((b) => b.label.toLowerCase().includes(q) || b.category.toLowerCase().includes(q))
  }, [pluginCommands, search])

  const pluginGrouped = useMemo(() => {
    const groups: Record<string, typeof pluginBindings> = {}
    for (const b of pluginBindings) {
      ;(groups[b.category] ??= []).push(b)
    }
    return groups
  }, [pluginBindings])

  const renderKeys = (keys: string[]) =>
    keys
      .filter((k) => (isMac ? k.startsWith('Cmd') : k.startsWith('Ctrl')))
      .map((k, i) => <KbdGroup key={i} accelerator={k} size="sm" />)

  return (
    <Stack gap="md">
      <Text size="xs" color="muted">
        {t('settings.keybindings.blurb')}
      </Text>

      <SearchInput
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        onClear={() => setSearch('')}
        placeholder={t('settings.keybindings.searchPlaceholder')}
        size="sm"
      />

      {Object.entries(builtinGrouped).map(([category, bindings]) => (
        <Box key={category}>
          <Text size="xs" color="muted" className="uppercase tracking-wider font-semibold mb-2">
            {category}
          </Text>
          <Table>
            <Table.Header>
              <Table.Row>
                <Table.Head>{t('settings.keybindings.columnAction')}</Table.Head>
                <Table.Head>{t('settings.keybindings.columnShortcut')}</Table.Head>
                <Table.Head className="w-20 text-right">{t('settings.keybindings.columnEdit')}</Table.Head>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {bindings.map((kb) => (
                <Table.Row key={kb.id}>
                  <Table.Cell>
                    <Text size="sm">{kb.label}</Text>
                  </Table.Cell>
                  <Table.Cell>
                    {recordingId === kb.id ? (
                      <Text size="sm" color="accent" className="italic">
                        {t('settings.keybindings.pressShortcut')}
                      </Text>
                    ) : (
                      renderKeys(kb.keys)
                    )}
                  </Table.Cell>
                  <Table.Cell>
                    <Flex gap="xs" justify="end">
                      <Tooltip content={t('settings.keybindings.rebind')} side="left">
                        <IconButton
                          label={t('settings.keybindings.rebindAria', { label: kb.label })}
                          size="xs"
                          variant="ghost"
                          onClick={() => setRecordingId(recordingId === kb.id ? null : kb.id)}
                        >
                          <Pencil size={12} />
                        </IconButton>
                      </Tooltip>
                      {isCustom(kb) && (
                        <Tooltip content={t('settings.keybindings.resetToDefault')} side="left">
                          <IconButton
                            label={t('settings.keybindings.resetAria', { label: kb.label })}
                            size="xs"
                            variant="ghost"
                            onClick={() => resetBinding(kb.id)}
                          >
                            <RotateCcw size={12} />
                          </IconButton>
                        </Tooltip>
                      )}
                    </Flex>
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
          <Divider className="my-2" />
        </Box>
      ))}

      {Object.entries(pluginGrouped).map(([category, bindings]) => (
        <Box key={category}>
          <Text size="xs" color="muted" className="uppercase tracking-wider font-semibold mb-2">
            {category}
          </Text>
          <Table>
            <Table.Header>
              <Table.Row>
                <Table.Head>{t('settings.keybindings.columnAction')}</Table.Head>
                <Table.Head>{t('settings.keybindings.columnShortcut')}</Table.Head>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {bindings.map((b) => (
                <Table.Row key={b.id}>
                  <Table.Cell>
                    <Text size="sm">{b.label}</Text>
                  </Table.Cell>
                  <Table.Cell>{renderKeys(b.keys)}</Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
          <Divider className="my-2" />
        </Box>
      ))}

      <Flex justify="end">
        <Button
          variant="outline"
          size="sm"
          onClick={() => void setSetting('keybindings', defaultSettings.keybindings)}
        >
          {t('settings.keybindings.resetAll')}
        </Button>
      </Flex>
    </Stack>
  )
}
