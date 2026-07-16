import { useRef } from 'react'
import type { AIProviderInfo, AIModelInfo } from '@shared/ai-types'
import { Text, Box, Button } from '@/primitives'
import { Card } from '@/primitives/surfaces/Card'
import { ScrollArea } from '@/primitives/layout/ScrollArea'
import { useClickOutside } from '@/hooks/useClickOutside'
import { useTranslation } from '@/i18n/I18nProvider'

interface ModelPickerProps {
  providers: AIProviderInfo[]
  models: AIModelInfo[]
  activeModel: string | null
  onSelect: (modelId: string) => void
  onSelectProvider: (provider: AIProviderInfo) => void
  onDismiss: () => void
}

export function ModelPicker({ providers, models, activeModel, onSelect, onSelectProvider, onDismiss }: ModelPickerProps) {
  const { t } = useTranslation()
  const ref = useRef<HTMLDivElement>(null)

  useClickOutside(ref, onDismiss)

  return (
    <Box ref={ref} className="absolute bottom-full left-3 right-3 mb-1 z-50">
      <Card padding="sm" className="shadow-[var(--shadow-dropdown)]">
        <ScrollArea direction="vertical" className="max-h-64">
          {providers.map(provider => (
            <Box key={provider.id}>
              <Button
                variant="bare"
                size="none"
                onClick={() => onSelectProvider(provider)}
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
                  onClick={() => onSelect(model.id)}
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
      </Card>
    </Box>
  )
}
