import { ExternalLink, type LucideIcon } from 'lucide-react'
import { Flex, Box, Card, Stack, Text, Heading, Badge, GradientSurface, Button, FOCUS_GLOW } from '@/primitives'
import { VerqlHero } from '@/components/brand/VerqlHero'
import { useTranslation } from '@/i18n/I18nProvider'
import { IPC_CHANNELS } from '@shared/ipc'
import type { ReleaseNote, HighlightTone } from '@/lib/release-notes'
import { ipc } from '@/platform/client'

const openExternal = (url: string) =>
  void ipc.optional(IPC_CHANNELS.WINDOW_OPEN_EXTERNAL, url)

/** Map a highlight tone to its Badge variant. `info` reads as "improved". */
const TONE_VARIANT: Record<HighlightTone, 'accent' | 'info' | 'success'> = {
  feature: 'accent',
  improvement: 'info',
  fix: 'success',
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
}

function HighlightCard({ icon: Icon, title, description }: {
  icon: LucideIcon; title: string; description: string
}) {
  // title/description are already resolved to display strings by the caller.
  return (
    <Card padding="lg" className="flex gap-3">
      <Box className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-accent/10 text-accent">
        <Icon size={18} />
      </Box>
      <Flex direction="column" className="min-w-0 flex-1">
        <Text size="sm" weight="semibold" color="primary">{title}</Text>
        <Text size="xs" color="muted" className="mt-0.5 leading-relaxed">{description}</Text>
      </Flex>
    </Card>
  )
}

/**
 * Presentational "What's New" page for a single curated release. Takes the
 * resolved {@link ReleaseNote} so it stays storyable; the container resolves the
 * version → note (or an empty state). A brand hero, then tone-grouped highlight
 * cards, then resource links.
 */
export function ReleaseNotesContent({ note }: { note: ReleaseNote }) {
  const { t } = useTranslation()

  const toneLabel = (tone: HighlightTone): string =>
    tone === 'feature'
      ? t('shell.releaseNotes.toneFeature')
      : tone === 'improvement'
        ? t('shell.releaseNotes.toneImprovement')
        : t('shell.releaseNotes.toneFix')

  return (
    <Box className="mx-auto w-full max-w-3xl px-8 py-10">
      {/* Hero */}
      <GradientSurface tone="accent" intensity="bold" className="rounded-2xl border border-border-default">
        <Stack gap="md" className="p-8">
          <Flex align="center" gap="sm">
            <VerqlHero size={40} />
            <Text size="xs" weight="semibold" color="accent" className="uppercase tracking-wider">
              {t('shell.releaseNotes.eyebrow')}
            </Text>
          </Flex>
          <Stack gap="xs">
            <Heading level={1}>{t('shell.releaseNotes.title', { version: note.version })}</Heading>
            <Text size="xs" color="muted">{t('shell.releaseNotes.released', { date: formatDate(note.date) })}</Text>
          </Stack>
          <Text size="lg" weight="medium" color="primary" className="leading-snug">{t(note.headline)}</Text>
          <Text size="sm" color="secondary" className="leading-relaxed">{t(note.summary)}</Text>
        </Stack>
      </GradientSurface>

      {/* Grouped highlights */}
      <Stack gap="xl" className="mt-10">
        {note.groups.map((group) => (
          <Box key={group.title}>
            <Flex align="center" gap="sm">
              <Heading level={4}>{t(group.title)}</Heading>
              <Badge tone={TONE_VARIANT[group.tone]} size="sm">{toneLabel(group.tone)}</Badge>
            </Flex>
            <Stack gap="sm" className="mt-4">
              {group.highlights.map((h) => (
                <HighlightCard key={h.id} icon={h.icon} title={t(h.title)} description={t(h.description)} />
              ))}
            </Stack>
          </Box>
        ))}
      </Stack>

      {/* Footer links */}
      {note.links && note.links.length > 0 && (
        <Box className="mt-12 border-t border-border-subtle pt-5">
          <Text size="xs" weight="semibold" color="muted" className="uppercase tracking-wider">
            {t('shell.releaseNotes.footerHeading')}
          </Text>
          <Flex gap="sm" wrap className="mt-3">
            {note.links.map((link) => (
              <Button
                variant="bare"
                size="none"
                key={link.url}
                onClick={() => openExternal(link.url)}
                className={`inline-flex items-center gap-2 rounded-md border border-border-default bg-bg-secondary px-3 py-1.5 text-sm text-text-secondary transition-colors hover:border-border-strong hover:bg-hover ${FOCUS_GLOW}`}
              >
                <Box as="span">{t(link.label)}</Box>
                <ExternalLink size={13} className="text-text-tertiary" />
              </Button>
            ))}
          </Flex>
        </Box>
      )}
    </Box>
  )
}
