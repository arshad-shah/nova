import { Flex, Button, Badge, Select, Box, Label } from '@/primitives'
import { Switch } from '@/primitives/forms/Switch'
import type { DriverCapabilities } from '@/stores/driver-capabilities'
import type { QueryTabTxnState } from '@shared/types'
import { useTranslation } from '@/i18n/I18nProvider'

export interface TransactionToolbarProps {
  caps: DriverCapabilities['session'] | undefined
  txn: QueryTabTxnState
  onToggleAutoCommit: (enabled: boolean) => void
  onCommit: () => void
  onRollback: () => void
  onIsolationChange?: (level: string) => void
  onReadOnlyChange?: (readOnly: boolean) => void
}

export function TransactionToolbar({
  caps,
  txn,
  onToggleAutoCommit,
  onCommit,
  onRollback,
  onIsolationChange,
  onReadOnlyChange,
}: TransactionToolbarProps) {
  const { t } = useTranslation()
  // No transaction UX to show
  if (!caps?.autoCommit && !caps?.manualTransactions) return null

  const txnLabel = caps.transactionLabel ?? t('query.txn.transaction')
  const rollbackLabel = caps.rollbackKind === 'discard' ? t('query.txn.discard') : t('query.txn.rollback')
  const isActive = txn.status === 'active'

  const statusBadgeVariant = isActive ? 'warning' : 'default'
  const statusText = isActive
    ? t('query.txn.statusActive', { label: txnLabel })
    : txn.autoCommit
      ? t('query.txn.statusAutoCommit')
      : t('query.txn.statusIdle')

  const isolationOptions = (caps.isolationLevels ?? []).map((level) => ({
    value: level,
    label: level,
  }))

  return (
    <Flex direction="row" align="center" gap="sm" className="flex-wrap">
      {/* Status badge */}
      <Badge variant={statusBadgeVariant} size="sm">
        {statusText}
      </Badge>

      {/* Auto-commit toggle */}
      {caps.autoCommit && (
        <Label className="flex items-center gap-1.5 cursor-pointer select-none">
          <Switch
            label={t('query.txn.autoCommit')}
            checked={txn.autoCommit}
            onChange={(e) => onToggleAutoCommit(e.target.checked)}
          />
          <Box as="span" className="text-xs text-text-secondary">{t('query.txn.autoCommit')}</Box>
        </Label>
      )}

      {/* Isolation level select — disabled while a transaction is active because
          the setting only takes effect at the next BEGIN; changing it mid-txn
          would silently no-op and mislead the user. */}
      {isolationOptions.length > 0 && (
        <Select
          aria-label={t('query.txn.isolationLevel')}
          value={txn.isolationLevel ?? ''}
          onChange={(value) => onIsolationChange?.(value)}
          options={isolationOptions}
          size="xs"
          className="w-44"
          disabled={isActive}
        />
      )}

      {/* Read-only toggle — disabled while a transaction is active for the same
          reason: it only applies at the next BEGIN. */}
      {caps.readOnly && (
        <Label className="flex items-center gap-1.5 cursor-pointer select-none">
          <Switch
            label={t('query.txn.readOnly')}
            checked={txn.readOnly}
            onChange={(e) => onReadOnlyChange?.(e.target.checked)}
            disabled={isActive}
          />
          <Box as="span" className="text-xs text-text-secondary">{t('query.txn.readOnly')}</Box>
        </Label>
      )}

      {/* Commit / Rollback */}
      {caps.manualTransactions && (
        <Flex direction="row" align="center" gap="xs">
          <Button
            variant="outline"
            size="xs"
            disabled={!isActive}
            onClick={onCommit}
            className="bg-success/10 text-success hover:bg-success/20 border-0 disabled:opacity-40"
          >
            {t('query.txn.commit')}
          </Button>
          <Button
            variant="outline"
            size="xs"
            disabled={!isActive}
            onClick={onRollback}
            className="bg-error/10 text-error hover:bg-error/20 border-0 disabled:opacity-40"
          >
            {rollbackLabel}
          </Button>
        </Flex>
      )}
    </Flex>
  )
}
