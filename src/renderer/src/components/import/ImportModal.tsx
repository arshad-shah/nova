import { useEffect, useState } from 'react'
import { Upload, X } from 'lucide-react'
import { Modal, Button, Input, Text, Flex, Spinner, Stack, Box, SegmentedControl } from '@/primitives'
import { IPC_CHANNELS } from '@shared/ipc'
import type { ImportFormatInfo } from '@shared/export-import'
import { useTranslation } from '@/i18n/I18nProvider'

interface Props {
  connectionId: string
  onClose: () => void
}

export function ImportModal({ connectionId, onClose }: Props) {
  const { t } = useTranslation()
  // Formats are driver-resolved (a Mongo connection won't offer SQL-script
  // import), fetched from the importer registry rather than hardcoded.
  const [formats, setFormats] = useState<ImportFormatInfo[]>([])
  const [format, setFormat] = useState<string | null>(null)
  const [tableName, setTableName] = useState('')
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<{ text: string; isError: boolean } | null>(null)

  useEffect(() => {
    let active = true
    window.electronAPI
      .invoke(IPC_CHANNELS.IMPORT_FORMATS_LIST, connectionId)
      .then((list) => {
        if (!active) return
        setFormats(list)
        setFormat((cur) => cur ?? list[0]?.format ?? null)
      })
      .catch(() => {})
    return () => { active = false }
  }, [connectionId])

  const selected = formats.find((f) => f.format === format)
  // Driver-executed importers (SQL scripts) run their own statements and need no
  // target object; data importers (CSV) parse a file into a named object.
  const isDriverExecuted = selected?.driverExecutes ?? false

  const handleImportSql = async () => {
    setImporting(true)
    try {
      const res = await window.electronAPI.invoke(IPC_CHANNELS.IMPORT_SQL, connectionId)
      if ('cancelled' in res) { setImporting(false); return }
      const msg = res.errors.length > 0
        ? t('shell.importModal.executedStatementsErrors', { count: res.executed, errors: res.errors.length })
        : t('shell.importModal.executedStatements', { count: res.executed })
      setResult({ text: msg, isError: false })
      if (res.errors.length === 0) setTimeout(onClose, 1500)
    } catch (err) {
      setResult({ text: t('shell.importModal.errorPrefix', { message: (err as Error).message }), isError: true })
    } finally {
      setImporting(false)
    }
  }

  const handleImportData = async () => {
    if (!tableName.trim()) return
    setImporting(true)
    try {
      // 1:1 column mapping — the backend matches file headers to columns.
      const mapping: Record<string, string> = {}
      const res = await window.electronAPI.invoke(IPC_CHANNELS.IMPORT_CSV, connectionId, tableName, mapping, 'skip')
      if ('cancelled' in res) { setImporting(false); return }
      const msg =
        t('shell.importModal.insertedRows', { count: res.inserted }) +
        (res.skipped > 0 ? t('shell.importModal.skippedSuffix', { count: res.skipped }) : '') +
        (res.errors.length > 0 ? t('shell.importModal.errorsSuffix', { count: res.errors.length }) : '')
      setResult({ text: msg, isError: false })
      if (res.errors.length === 0) setTimeout(onClose, 1500)
    } catch (err) {
      setResult({ text: t('shell.importModal.errorPrefix', { message: (err as Error).message }), isError: true })
    } finally {
      setImporting(false)
    }
  }

  return (
    <Modal open={true} onClose={onClose}>
      <Flex direction="row" align="center" justify="between" className="px-4 py-3 border-b border-border">
        <Text size="sm" weight="semibold">{t('shell.importModal.title')}</Text>
        <Button variant="ghost" size="xs" onClick={onClose} aria-label={t('shell.importModal.close')}><X size={14} /></Button>
      </Flex>

      <Stack gap="md" className="p-4">
        <Box>
          <Text size="xs" color="muted" as="p" className="mb-2">{t('shell.importModal.importType')}</Text>
          <SegmentedControl
            size="sm"
            stretch
            tone="accent"
            label={t('shell.importModal.importType')}
            // Null until the driver's formats arrive — see ExportModal.
            value={format ?? ''}
            onChange={setFormat}
            options={formats.map(f => ({ value: f.format, label: f.displayName }))}
          />
        </Box>

        {isDriverExecuted && (
          <Text size="xs" color="secondary" as="p">{t('shell.importModal.sqlHint')}</Text>
        )}

        {selected && !isDriverExecuted && (
          <Box>
            <Text size="xs" color="muted" as="p" className="mb-1">{t('shell.importModal.targetTable')}</Text>
            <Input
              value={tableName}
              onChange={e => setTableName(e.target.value)}
              placeholder={t('shell.importModal.targetTablePlaceholder')}
              size="sm"
            />
            <Text size="xs" color="muted" as="p" className="mt-1">{t('shell.importModal.csvHint')}</Text>
          </Box>
        )}

        {result && (
          <Text size="xs" color={result.isError ? 'error' : 'success'} as="p">{result.text}</Text>
        )}
      </Stack>

      <Flex direction="row" justify="end" gap="sm" className="px-4 py-3 border-t border-border">
        <Button variant="outline" size="sm" onClick={onClose}>{t('shell.importModal.cancel')}</Button>
        <Button
          variant="solid"
          size="sm"
          onClick={isDriverExecuted ? handleImportSql : handleImportData}
          disabled={importing || !selected || (!isDriverExecuted && !tableName.trim())}
          className="flex items-center gap-1.5"
        >
          {importing ? <Spinner size="xs" /> : <Upload size={14} />}
          {t('shell.importModal.import')}
        </Button>
      </Flex>
    </Modal>
  )
}
