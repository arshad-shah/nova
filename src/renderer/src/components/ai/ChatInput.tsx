import { useState, useCallback, useEffect, useRef, type KeyboardEvent } from 'react'
import { ArrowUp, Square, ChevronDown } from 'lucide-react'
import { useAIStore } from '@/stores/ai'
import { useConnectionsStore, useActiveProfile } from '@/stores/connections'
import { IconButton, Button } from '@/primitives/forms/Button'
import { Card } from '@/primitives/surfaces/Card'
import { Textarea } from '@/primitives/forms/Textarea'
import { Text, Box } from '@/primitives'
import { SchemaAutocomplete } from './SchemaAutocomplete'
import { ModelPicker } from './ModelPicker'
import { useTranslation } from '@/i18n/I18nProvider'

export function ChatInput() {
  const { t } = useTranslation()
  const [input, setInput] = useState('')
  const sendMessage = useAIStore(s => s.sendMessage)
  const isStreaming = useAIStore(s => s.isStreaming)
  const abort = useAIStore(s => s.abort)
  const activeModel = useAIStore(s => s.activeModel)
  const models = useAIStore(s => s.models)
  const providers = useAIStore(s => s.providers)
  const activeConnectionId = useConnectionsStore(s => s.activeConnectionId)
  const connection = useActiveProfile()
  const composerSeed = useAIStore(s => s.composerSeed)
  const clearComposerSeed = useAIStore(s => s.clearComposerSeed)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (composerSeed != null) {
      setInput(composerSeed)
      clearComposerSeed()
    }
  }, [composerSeed, clearComposerSeed])

  const [showAutocomplete, setShowAutocomplete] = useState(false)
  const [autocompleteFilter, setAutocompleteFilter] = useState('')
  const [showModelPicker, setShowModelPicker] = useState(false)

  const activeModelName = models.find(m => m.id === activeModel)?.name ?? activeModel ?? t('aiui.input.selectModel')

  const handleSend = useCallback(() => {
    const trimmed = input.trim()
    if (!trimmed || isStreaming) return

    const connectionMeta = connection
      ? { type: connection.type, driverName: connection.type }
      : undefined

    sendMessage(trimmed, activeConnectionId ?? undefined, connectionMeta)
    setInput('')
    setShowAutocomplete(false)
  }, [input, isStreaming, sendMessage, activeConnectionId, connection])

  const handleChange = useCallback((value: string) => {
    setInput(value)

    const textarea = textareaRef.current
    if (!textarea) return

    const cursorPos = textarea.selectionStart
    const textBeforeCursor = value.slice(0, cursorPos)
    const atIndex = textBeforeCursor.lastIndexOf('@')

    if (atIndex >= 0) {
      const textAfterAt = textBeforeCursor.slice(atIndex + 1)
      const charBefore = atIndex > 0 ? value[atIndex - 1] : ' '
      if ((charBefore === ' ' || charBefore === '\n' || atIndex === 0) && !textAfterAt.includes(' ')) {
        setShowAutocomplete(true)
        setAutocompleteFilter(textAfterAt)
        return
      }
    }
    setShowAutocomplete(false)
  }, [])

  const handleAutocompleteSelect = useCallback((item: string) => {
    const textarea = textareaRef.current
    if (!textarea) return

    const cursorPos = textarea.selectionStart
    const textBeforeCursor = input.slice(0, cursorPos)
    const atIndex = textBeforeCursor.lastIndexOf('@')

    if (atIndex >= 0) {
      const newInput = input.slice(0, atIndex) + '@' + item + ' ' + input.slice(cursorPos)
      setInput(newInput)
    }

    setShowAutocomplete(false)
    textarea.focus()
  }, [input])

  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (showAutocomplete) {
      if (['ArrowDown', 'ArrowUp', 'Tab', 'Escape'].includes(e.key)) {
        return
      }
      if (e.key === 'Enter' && !e.shiftKey) {
        return
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }, [handleSend, showAutocomplete])

  const hasInput = input.trim().length > 0

  return (
    <Box className="relative p-3 border-t border-border-default">
      {showAutocomplete && (
        <SchemaAutocomplete
          triggerText={autocompleteFilter}
          onSelect={handleAutocompleteSelect}
          onDismiss={() => setShowAutocomplete(false)}
          anchorRef={textareaRef}
        />
      )}
      {showModelPicker && (
        <ModelPicker
          providers={providers}
          models={models}
          activeModel={activeModel}
          onSelect={(modelId) => {
            useAIStore.getState().setActiveModel(modelId)
            setShowModelPicker(false)
          }}
          onSelectProvider={(provider) => {
            useAIStore.getState().setActiveProvider(provider)
            setShowModelPicker(false)
          }}
          onDismiss={() => setShowModelPicker(false)}
        />
      )}
      <Card padding="none" className="overflow-hidden">
        {/* The Card owns the frame and focus affordance here, so the field
            itself is chrome-less. */}
        <Textarea
          ref={textareaRef}
          surface="bare"
          resize="none"
          className="text-sm"
          placeholder={t('aiui.input.placeholder')}
          value={input}
          onChange={e => handleChange(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={2}
          disabled={isStreaming}
        />
        <Box className="flex items-center justify-between px-2 pb-2">
          <Button
            variant="bare"
            size="none"
            onClick={() => setShowModelPicker(!showModelPicker)}
            className="flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-hover transition-colors"
          >
            <Text size="xs" color="accent">{activeModelName}</Text>
            <ChevronDown className="h-3 w-3 text-text-muted" />
          </Button>
          {isStreaming ? (
            <IconButton
              label={t('aiui.input.stop')}
              variant="solid"
              size="xs"
              onClick={abort}
              className="bg-error-emphasis hover:bg-error"
            >
              <Square className="h-3.5 w-3.5" />
            </IconButton>
          ) : (
            <IconButton
              label={t('aiui.input.send')}
              variant={hasInput ? 'solid' : 'ghost'}
              size="xs"
              onClick={handleSend}
              disabled={!hasInput}
            >
              <ArrowUp className="h-3.5 w-3.5" />
            </IconButton>
          )}
        </Box>
      </Card>
    </Box>
  )
}
