import { Modal, Button, Text, Flex, Stack } from '@/primitives'
import { useTranslation } from '@/i18n/I18nProvider'

interface ConfirmDialogProps {
  open: boolean
  title: string
  message?: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: 'danger' | 'default'
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel,
  variant = 'default',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const { t } = useTranslation()
  const confirmText = confirmLabel ?? t('common.confirm')
  const cancelText = cancelLabel ?? t('common.cancel')
  return (
    <Modal open={open} onClose={onCancel} width="prompt">
      <Stack gap="md" className="p-4">
        <Text size="sm" weight="semibold">{title}</Text>
        {message && <Text size="sm" color="secondary">{message}</Text>}
      </Stack>
      <Flex direction="row" justify="end" gap="sm" className="px-4 py-3 border-t border-border">
        <Button variant="outline" size="sm" onClick={onCancel}>{cancelText}</Button>
        <Button
          variant={variant === 'danger' ? 'error' : 'solid'}
          size="sm"
          onClick={onConfirm}
        >
          {confirmText}
        </Button>
      </Flex>
    </Modal>
  )
}
