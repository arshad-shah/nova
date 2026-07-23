import { useEffect, useState } from 'react'
import { parseAppError } from '@/lib/db-error'
import { Download, X } from 'lucide-react'
import { Modal, Button, Checkbox, Text, Flex, Spinner, Stack, Box, SegmentedControl } from '@/primitives'
import { IPC_CHANNELS } from '@shared/ipc'
import type { ExportFormatInfo } from '@shared/export-import'
import { useTranslation } from '@/i18n/I18nProvider'
import { ipc } from '@/platform/client'

interface Props {
  tableName?: string
  connectionId: string
  onClose: () => void
}

export function ExportModal({ tableName, connectionId, onClose }: Props) {
  const { t } = useTranslation()
  // Formats are driver-resolved (a Mongo connection won't offer SQL), fetched
  // from the exporter registry rather than hardcoded.
  const [formats, setFormats] = useState<ExportFormatInfo[]>([])
  const [format, setFormat] = useState<string | null>(null)
  const [includeSchema, setIncludeSchema] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [result, setResult] = useState<{ text: string; isError: boolean } | null>(null)

  useEffect(() => {
    let active = true
    ipc
      .invoke(IPC_CHANNELS.EXPORT_FORMATS_LIST, connectionId)
      .then((list) => {
        if (!active) return
        setFormats(list)
        setFormat((cur) => cur ?? list[0]?.format ?? null)
      })
      .catch(() => {})
    return () => { active = false }
  }, [connectionId])

  const selected = formats.find((f) => f.format === format)

  const handleExport = async () => {
    if (!tableName || !format) return
    setExporting(true)
    try {
      const res = await ipc.invoke(IPC_CHANNELS.EXPORT_TABLE, connectionId, tableName, format, { includeSchema })
      if ('filePath' in res) {
        setResult({ text: t('shell.exportModal.exportedTo', { filePath: res.filePath }), isError: false })
        setTimeout(onClose, 1500)
      }
    } catch (err) {
      setResult({ text: t('shell.exportModal.errorPrefix', { message: parseAppError(err).message }), isError: true })
    } finally {
      setExporting(false)
    }
  }

  return (
    <Modal open={true} onClose={onClose}>
      <Flex direction="row" align="center" justify="between" className="px-4 py-3 border-b border-border">
        <Text size="sm" weight="semibold">{t('shell.exportModal.title', { tableName: tableName ?? '' })}</Text>
        <Button variant="ghost" size="xs" onClick={onClose} aria-label={t('shell.exportModal.close')}><X size={14} /></Button>
      </Flex>

      <Stack gap="md" className="p-4">
        <Box>
          <Text size="xs" color="muted" as="p" className="mb-2">{t('shell.exportModal.format')}</Text>
          <SegmentedControl
            size="sm"
            stretch
            tone="accent"
            label={t('shell.exportModal.format')}
            // Null until the driver's formats arrive, and then no segment is
            // selected — which is correct, and the control stays keyboard
            // reachable because it falls back to focusing its first option.
            value={format ?? ''}
            onChange={setFormat}
            options={formats.map(f => ({ value: f.format, label: f.displayName }))}
          />
        </Box>

        {/* A real <label>, not a click-to-toggle row. The row version worked,
            but only by luck: its onClick and the box's own onChange both set the
            same state, and it survived solely because onChange fires last and
            sets an absolute value rather than toggling. A label lets the browser
            forward the click to the input exactly once. */}
        {selected?.supportsSchema && (
          <label className="flex cursor-pointer items-center gap-2 self-start">
            <Checkbox checked={includeSchema} onChange={e => setIncludeSchema(e.target.checked)} />
            <Text size="sm" color="secondary">{t('shell.exportModal.includeCreateTable')}</Text>
          </label>
        )}

        {result && (
          <Text size="xs" color={result.isError ? 'error' : 'success'} as="p">{result.text}</Text>
        )}
      </Stack>

      <Flex direction="row" justify="end" gap="sm" className="px-4 py-3 border-t border-border">
        <Button variant="outline" size="sm" onClick={onClose}>{t('shell.exportModal.cancel')}</Button>
        <Button
          variant="solid"
          size="sm"
          onClick={handleExport}
          disabled={exporting || !tableName || !format}
          className="flex items-center gap-1.5"
        >
          {exporting ? <Spinner size="xs" /> : <Download size={14} />}
          {t('shell.exportModal.export')}
        </Button>
      </Flex>
    </Modal>
  )
}
