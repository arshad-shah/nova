import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import type { AIProviderInfo, AIModelInfo } from '@shared/ai-types'
import { Text, Box, Button } from '@/primitives'
import { Popover } from '@/primitives/surfaces/Popover'
import { ScrollArea } from '@/primitives/layout/ScrollArea'
import { useTranslation } from '@/i18n/I18nProvider'

interface ModelPickerProps {
  providers: AIProviderInfo[]
  models: AIModelInfo[]
  activeModel: string | null
  /** Pre-resolved label for the trigger button (falls back to the raw id upstream). */
  activeModelName: string
  onSelect: (modelId: string) => void
  onSelectProvider: (provider: AIProviderInfo) => void
}

/**
 * The model/provider switcher, anchored above the chat input. Owns its own
 * trigger via `Popover` (it opens upward, and its rows aren't a plain action
 * list — a provider heading plus per-model rows — so it isn't a
 * `DropdownMenu` case). Drives Popover's controlled `open`/`onOpenChange` so
 * selecting a row can close it directly, matching the old close-on-select
 * behaviour.
 */
export function ModelPicker({ providers, models, activeModel, activeModelName, onSelect, onSelectProvider }: ModelPickerProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const closeAfter = (run: () => void) => { run(); setOpen(false) }

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      placement="top"
      className="w-56 p-1"
      trigger={
        <Button
          variant="bare"
          size="none"
          className="flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-hover transition-colors"
        >
          <Text size="xs" color="accent">{activeModelName}</Text>
          <ChevronDown className="h-3 w-3 text-text-muted" />
        </Button>
      }
      content={
        <ScrollArea direction="vertical" className="max-h-64">
          {providers.map(provider => (
            <Box key={provider.id}>
              <Button
                variant="bare"
                size="none"
                onClick={() => closeAfter(() => onSelectProvider(provider))}
                className="w-full text-left px-2 py-1 hover:bg-hover rounded transition-colors"
              >
                <Text size="xs" color="muted" weight="medium" className="uppercase tracking-wider">
                  {provider.name}
                </Text>
              </Button>
              {models.map(model => (
                <Button
                  key={model.id}
                  variant="bare"
                  size="none"
                  onClick={() => closeAfter(() => onSelect(model.id))}
                  className={`w-full text-left px-2 py-1.5 rounded transition-colors ${
                    model.id === activeModel
                      ? 'bg-accent/10 text-accent'
                      : 'hover:bg-hover'
                  }`}
                >
                  <Text size="xs" color={model.id === activeModel ? 'accent' : 'primary'}>
                    {model.name}
                  </Text>
                </Button>
              ))}
            </Box>
          ))}
          {providers.length === 0 && (
            <Box className="px-2 py-3">
              <Text size="xs" color="muted">{t('aiui.chat.providersEmpty')}</Text>
            </Box>
          )}
        </ScrollArea>
      }
    />
  )
}
