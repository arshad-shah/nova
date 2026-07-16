import { Modal, Input, Button, Box } from '@/primitives'
import { useTranslation } from '@/i18n/I18nProvider'

interface Props {
  open: boolean
  name: string
  onNameChange: (name: string) => void
  onClose: () => void
  onConfirm: () => void
}

/** First-time "save query" prompt — an in-app modal (Electron's renderer has
 *  no usable `window.prompt`). */
export function SaveQueryDialog({ open, name, onNameChange, onClose, onConfirm }: Props) {
  const { t } = useTranslation()
  return (
    <Modal open={open} onClose={onClose}>
      <Box as="form"
        onSubmit={(e) => { e.preventDefault(); onConfirm() }}
        className="p-4 flex flex-col gap-3"
      >
        <Box className="flex flex-col gap-1">
          <Box className="text-sm font-medium">{t('query.save.title')}</Box>
          <Box className="text-xs text-text-tertiary">
            {t('query.save.description')}
          </Box>
        </Box>
        <Input
          autoFocus
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder={t('query.save.namePlaceholder')}
          onKeyDown={(e) => {
            if (e.key === 'Escape') onClose()
          }}
        />
        <Box className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            {t('query.save.cancel')}
          </Button>
          <Button type="submit" variant="solid" size="sm" disabled={!name.trim()}>
            {t('query.save.save')}
          </Button>
        </Box>
      </Box>
    </Modal>
  )
}
