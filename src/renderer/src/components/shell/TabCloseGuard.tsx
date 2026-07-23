import { Modal, Button, Text, Stack, Flex } from '@/primitives'
import { ConfirmDialog } from './ConfirmDialog'
import { tabActions } from '@/stores/tab-actions'
import { notifyError } from '@/lib/notify-error'
import { useTranslation } from '@/i18n/I18nProvider'

interface Props {
  txnQueue: string[]
  dirtyBatch: string[]
  resolveHead: () => void
  clearBatch: () => void
  closeTab: (id: string) => void
}

/** Guards tab closing. Transactions come first and resolve one at a time —
 *  each needs its own Commit or Rollback against its own session, so there's
 *  no bulk answer (a failed op keeps the dialog open to avoid an orphaned
 *  server transaction). Dirty tabs then share a single discard confirm. */
export function TabCloseGuard({ txnQueue, dirtyBatch, resolveHead, clearBatch, closeTab }: Props) {
  const { t } = useTranslation()
  const txnId = txnQueue[0] ?? null

  if (txnId !== null) {
    return (
      <Modal open onClose={resolveHead} width="prompt">
        <Stack gap="md" className="p-4">
          <Text size="sm" weight="semibold">{t('shell.confirmTransaction.title')}</Text>
          <Text size="sm" color="secondary">
            {t('shell.confirmTransaction.message', {
              label: tabActions.get(txnId)?.label ?? t('shell.confirmTransaction.thisTab'),
            })}
          </Text>
        </Stack>
        <Flex direction="row" justify="end" gap="sm" className="px-4 py-3 border-t border-border">
          {/* Cancel pops the head too: this tab stays open, the queue advances
              to the next transactional tab. */}
          <Button variant="outline" size="sm" onClick={resolveHead}>{t('common.cancel')}</Button>
          <Button
            variant="error"
            size="sm"
            onClick={async () => {
              try {
                await tabActions.rollbackTransaction(txnId)
                resolveHead()
                closeTab(txnId)
              } catch (err) {
                notifyError(err, {
                  source: { type: 'tab', id: txnId, label: tabActions.get(txnId)?.label ?? txnId },
                })
                // leave dialog open so the user can retry or cancel
              }
            }}
          >
            {t('shell.confirmTransaction.rollbackAndClose')}
          </Button>
          <Button
            variant="solid"
            size="sm"
            onClick={async () => {
              try {
                await tabActions.commitTransaction(txnId)
                resolveHead()
                closeTab(txnId)
              } catch (err) {
                notifyError(err, {
                  source: { type: 'tab', id: txnId, label: tabActions.get(txnId)?.label ?? txnId },
                })
                // leave dialog open so the user can retry or cancel
              }
            }}
          >
            {t('shell.confirmTransaction.commitAndClose')}
          </Button>
        </Flex>
      </Modal>
    )
  }

  if (dirtyBatch.length === 0) return null

  // With one dirty tab this is today's exact singular copy, so the common
  // path is visually unchanged by the batching.
  const many = dirtyBatch.length > 1
  const labels = dirtyBatch.map(id => tabActions.get(id)?.label ?? id).join(', ')

  return (
    <ConfirmDialog
      open
      title={many
        ? t('shell.confirmClose.unsavedTitleMany', { count: dirtyBatch.length })
        : t('shell.confirmClose.unsavedTitle')}
      message={many
        ? t('shell.confirmClose.unsavedMessageMany', { labels })
        : t('shell.confirmClose.unsavedMessage', {
            label: tabActions.get(dirtyBatch[0])?.label ?? t('shell.confirmClose.thisTab'),
          })}
      confirmLabel={many
        ? t('shell.confirmClose.discardChangesMany')
        : t('shell.confirmClose.discardChanges')}
      cancelLabel={t('shell.confirmClose.keepEditing')}
      variant="danger"
      onCancel={clearBatch}
      onConfirm={() => {
        const ids = dirtyBatch
        clearBatch()
        ids.forEach(closeTab)
      }}
    />
  )
}
