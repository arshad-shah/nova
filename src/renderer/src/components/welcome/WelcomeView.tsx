import { useEffect, useMemo, useState } from 'react'
import {
  Database, FilePlus, Puzzle, Compass, Sparkles, SlidersHorizontal,
  BookOpen, Bug, PartyPopper, ChevronRight, type LucideIcon,
} from 'lucide-react'
import { Flex, Box, Stack, Text, Heading, Badge, Switch, GradientSurface, ScrollArea, Button } from '@/primitives'
import { VerqlHero } from '@/components/brand/VerqlHero'
import { useTranslation } from '@/i18n/I18nProvider'
import { useConnectionsStore, getActiveProfile } from '@/stores/connections'
import { useQueryHistoryStore } from '@/stores/query-history'
import { useSettingsStore } from '@/stores/settings'
import { useTabsStore } from '@/stores/tabs'
import { useUiStore, ACTIVITY_PANEL } from '@/stores/ui'
import { initialAutoCommit } from '@/lib/initial-autocommit'
import { getLatestReleaseNote } from '@/lib/release-notes'
import { IPC_CHANNELS } from '@shared/ipc'
import { GetStartedStep } from './GetStartedStep'

const GUIDE_URL = 'https://verql.arshadshah.com/guide/'
const SDK_URL = 'https://verql.arshadshah.com/plugins/sdk/'
const ISSUES_URL = 'https://github.com/arshad-shah/verql/issues'

const openExternal = (url: string) =>
  void window.electronAPI?.invoke(IPC_CHANNELS.WINDOW_OPEN_EXTERNAL, url)

interface StepDef {
  id: string
  icon: LucideIcon
  title: string
  description: string
  actionLabel: string
  /** Detected complete from app state (independent of manual marking). */
  auto: boolean
  run: () => void
}

/** A quick-action tile in the "Start" row. */
function ActionTile({ icon: Icon, label, hint, onClick }: {
  icon: LucideIcon; label: string; hint: string; onClick: () => void
}) {
  return (
    <Button
      variant="bare"
      size="none"
      onClick={onClick}
      className="group flex items-center gap-3 rounded-lg border border-border-default bg-bg-secondary px-4 py-3 text-left transition-colors hover:border-border-strong hover:bg-hover focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-glow)]"
    >
      <Box className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-accent/10 text-accent">
        <Icon size={18} />
      </Box>
      <Flex direction="column" className="min-w-0 flex-1">
        <Text size="sm" weight="semibold" color="primary">{label}</Text>
        <Text size="xs" color="muted" truncate>{hint}</Text>
      </Flex>
      <ChevronRight size={16} className="shrink-0 text-text-muted transition-transform group-hover:translate-x-0.5" />
    </Button>
  )
}

/** A compact resource link row in the "Learn & resources" column. */
function ResourceLink({ icon: Icon, label, hint, onClick }: {
  icon: LucideIcon; label: string; hint: string; onClick: () => void
}) {
  return (
    <Button
      variant="bare"
      size="none"
      onClick={onClick}
      className="group flex w-full items-center gap-3 rounded-md px-2 py-2 text-left transition-colors hover:bg-hover focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-glow)]"
    >
      <Icon size={16} className="shrink-0 text-text-tertiary" />
      <Flex direction="column" className="min-w-0 flex-1">
        <Text size="sm" weight="medium" color="secondary">{label}</Text>
        <Text size="xs" color="muted" truncate>{hint}</Text>
      </Flex>
    </Button>
  )
}

/**
 * The first-run "Get Started" walkthrough (VS Code-style Welcome), rendered in
 * an editor tab. A brand hero, a row of quick actions, an interactive setup
 * checklist (steps auto-complete from app state and can be advanced by running
 * their action), and a learn/resources column. Re-openable from Help → Welcome.
 */
export function WelcomeView() {
  const { t } = useTranslation()
  const [version, setVersion] = useState<string>('')

  const connectionCount = useConnectionsStore((s) => s.connections.length)
  const historyCount = useQueryHistoryStore((s) => s.entries.length)
  const activeModel = useSettingsStore((s) => s.settings.ai.activeModel)
  const completedSteps = useSettingsStore((s) => s.settings.onboarding.completedSteps)
  const hideOnStartup = useSettingsStore((s) => s.settings.onboarding.hideOnStartup)
  const setSetting = useSettingsStore((s) => s.set)

  useEffect(() => {
    let active = true
    window.electronAPI?.invoke(IPC_CHANNELS.APP_ABOUT_INFO)
      .then((i) => { if (active) setVersion(i.version) })
      .catch(() => {})
    return () => { active = false }
  }, [])

  const markStepDone = (id: string) => {
    if (completedSteps.includes(id)) return
    void setSetting('onboarding.completedSteps', [...completedSteps, id])
  }

  // Run a step's action and record it as done so the checklist shows progress.
  const runStep = (id: string, fn: () => void) => { fn(); markStepDone(id) }

  const newQuery = () => {
    const { activeConnectionId } = useConnectionsStore.getState()
    const conn = getActiveProfile()
    useTabsStore.getState().addQueryTab(activeConnectionId, null, { autoCommit: initialAutoCommit(conn) })
  }

  const steps = useMemo<StepDef[]>(() => [
    {
      id: 'connect', icon: Database, auto: connectionCount > 0,
      title: t('shell.welcomeTab.stepConnectTitle'),
      description: t('shell.welcomeTab.stepConnectDesc'),
      actionLabel: t('shell.welcomeTab.stepConnectAction'),
      run: () => useTabsStore.getState().openConnectionForm(),
    },
    {
      id: 'query', icon: FilePlus, auto: historyCount > 0,
      title: t('shell.welcomeTab.stepQueryTitle'),
      description: t('shell.welcomeTab.stepQueryDesc'),
      actionLabel: t('shell.welcomeTab.stepQueryAction'),
      run: newQuery,
    },
    {
      id: 'ai', icon: Sparkles, auto: activeModel.trim() !== '',
      title: t('shell.welcomeTab.stepAiTitle'),
      description: t('shell.welcomeTab.stepAiDesc'),
      actionLabel: t('shell.welcomeTab.stepAiAction'),
      run: () => useTabsStore.getState().openSettings('ai'),
    },
    {
      id: 'explore', icon: Compass, auto: false,
      title: t('shell.welcomeTab.stepExploreTitle'),
      description: t('shell.welcomeTab.stepExploreDesc'),
      actionLabel: t('shell.welcomeTab.stepExploreAction'),
      run: () => useUiStore.getState().setActivePanel(ACTIVITY_PANEL.EXPLORER),
    },
    {
      id: 'plugins', icon: Puzzle, auto: false,
      title: t('shell.welcomeTab.stepPluginsTitle'),
      description: t('shell.welcomeTab.stepPluginsDesc'),
      actionLabel: t('shell.welcomeTab.stepPluginsAction'),
      run: () => useTabsStore.getState().openSettings('plugins'),
    },
    {
      id: 'customize', icon: SlidersHorizontal, auto: false,
      title: t('shell.welcomeTab.stepCustomizeTitle'),
      description: t('shell.welcomeTab.stepCustomizeDesc'),
      actionLabel: t('shell.welcomeTab.stepCustomizeAction'),
      run: () => useTabsStore.getState().openSettings('appearance'),
    },
  ], [t, connectionCount, historyCount, activeModel])

  const isDone = (s: StepDef) => s.auto || completedSteps.includes(s.id)
  const doneCount = steps.filter(isDone).length

  const latestRelease = getLatestReleaseNote()
  const openWhatsNew = () => {
    if (latestRelease) useTabsStore.getState().openReleaseNotes(latestRelease.version)
  }

  return (
    <ScrollArea className="h-full bg-bg-tertiary">
      <Box className="mx-auto w-full max-w-4xl px-8 py-10">
        {/* Hero */}
        <GradientSurface tone="accent" intensity="subtle" className="rounded-2xl border border-border-default">
          <Flex align="center" gap="lg" className="p-8 max-sm:flex-col max-sm:text-center">
            <VerqlHero size={84} className="shrink-0" />
            <Stack gap="xs" className="min-w-0">
              <Flex align="center" gap="sm" className="max-sm:justify-center">
                <Text size="xs" weight="semibold" color="accent" className="uppercase tracking-wider">
                  {t('shell.welcomeTab.eyebrow')}
                </Text>
                {version && <Badge tone="accent" size="sm">{t('shell.welcomeTab.versionBadge', { version })}</Badge>}
              </Flex>
              <Heading level={1}>{t('shell.welcomeTab.title')}</Heading>
              <Text size="base" color="secondary" className="leading-relaxed">
                {t('shell.welcomeTab.subtitle')}
              </Text>
            </Stack>
          </Flex>
        </GradientSurface>

        {/* Start */}
        <Box className="mt-10">
          <Text size="xs" weight="semibold" color="muted" className="uppercase tracking-wider">
            {t('shell.welcomeTab.startHeading')}
          </Text>
          <Box className="mt-3 grid grid-cols-3 gap-3 max-sm:grid-cols-1">
            <ActionTile
              icon={Database}
              label={t('shell.welcomeTab.startNewConnection')}
              hint={t('shell.welcomeTab.startNewConnectionHint')}
              onClick={() => runStep('connect', () => useTabsStore.getState().openConnectionForm())}
            />
            <ActionTile
              icon={FilePlus}
              label={t('shell.welcomeTab.startNewQuery')}
              hint={t('shell.welcomeTab.startNewQueryHint')}
              onClick={() => runStep('query', newQuery)}
            />
            <ActionTile
              icon={Puzzle}
              label={t('shell.welcomeTab.startBrowsePlugins')}
              hint={t('shell.welcomeTab.startBrowsePluginsHint')}
              onClick={() => runStep('plugins', () => useTabsStore.getState().openSettings('plugins'))}
            />
          </Box>
        </Box>

        {/* Get started checklist + resources */}
        <Box className="mt-10 grid grid-cols-[1fr_280px] gap-8 max-lg:grid-cols-1">
          <Box>
            <Flex align="center" justify="between">
              <Text size="xs" weight="semibold" color="muted" className="uppercase tracking-wider">
                {t('shell.welcomeTab.stepsHeading')}
              </Text>
              <Text size="xs" color="muted">
                {t('shell.welcomeTab.stepsProgress', { done: doneCount, total: steps.length })}
              </Text>
            </Flex>
            <Stack gap="sm" className="mt-3">
              {steps.map((s) => (
                <GetStartedStep
                  key={s.id}
                  icon={s.icon}
                  title={s.title}
                  description={s.description}
                  actionLabel={s.actionLabel}
                  done={isDone(s)}
                  doneLabel={t('shell.welcomeTab.stepDone')}
                  onAction={() => runStep(s.id, s.run)}
                />
              ))}
            </Stack>
          </Box>

          <Box>
            <Text size="xs" weight="semibold" color="muted" className="uppercase tracking-wider">
              {t('shell.welcomeTab.learnHeading')}
            </Text>
            <Stack gap="none" className="mt-2">
              {latestRelease && (
                <ResourceLink
                  icon={PartyPopper}
                  label={t('shell.welcomeTab.learnWhatsNew')}
                  hint={t('shell.welcomeTab.learnWhatsNewHint')}
                  onClick={openWhatsNew}
                />
              )}
              <ResourceLink
                icon={BookOpen}
                label={t('shell.welcomeTab.learnGuide')}
                hint={t('shell.welcomeTab.learnGuideHint')}
                onClick={() => openExternal(GUIDE_URL)}
              />
              <ResourceLink
                icon={Puzzle}
                label={t('shell.welcomeTab.learnPlugins')}
                hint={t('shell.welcomeTab.learnPluginsHint')}
                onClick={() => openExternal(SDK_URL)}
              />
              <ResourceLink
                icon={Bug}
                label={t('shell.welcomeTab.learnIssues')}
                hint={t('shell.welcomeTab.learnIssuesHint')}
                onClick={() => openExternal(ISSUES_URL)}
              />
            </Stack>
          </Box>
        </Box>

        {/* Footer */}
        <Flex align="center" gap="sm" className="mt-12 border-t border-border-subtle pt-5">
          <Switch
            label={t('shell.welcomeTab.showOnStartup')}
            checked={!hideOnStartup}
            onChange={(e) => void setSetting('onboarding.hideOnStartup', !e.target.checked)}
          />
          <Text size="sm" color="secondary">{t('shell.welcomeTab.showOnStartup')}</Text>
        </Flex>
      </Box>
    </ScrollArea>
  )
}
