import {
  Gauge,
  Table2,
  PanelsTopLeft,
  Info,
  Sparkles,
  Wrench,
  ShieldCheck,
  Network,
  Palette,
  ToggleRight,
  Package,
  PartyPopper,
  Languages,
  MonitorDown,
  Store,
  RefreshCw,
  SquareMenu,
  PencilRuler,
  SlidersHorizontal,
  BellRing,
  Keyboard,
  Contrast,
  Activity,
  Zap,
  Rocket,
  Share2,
  ArrowLeftRight,
  ListOrdered,
  ShieldAlert,
  Hourglass,
} from 'lucide-react'
import type { ReleaseNote } from './types'

/**
 * Curated "What's New" entries, **newest first**.
 *
 * This holds only the *structure* of each release page (version, date, icons,
 * stable ids, tones). All user-facing copy is referenced by i18n key and lives
 * in `shared/i18n/locales/en/whats-new.ts` (the `whatsNew` domain) — release
 * notes are user-facing strings, so they come from the i18n surface, never
 * inlined here.
 *
 * Add a new object to the TOP of this array when you cut a release you want
 * users to see a page for. Versions without an entry simply don't open a release
 * tab on update. Authoring guide: docs/onboarding.md ("Authoring release notes").
 * Keep `version` exactly equal to package.json's version so the running app
 * resolves it.
 */
export const RELEASE_NOTES: ReleaseNote[] = [
  {
    version: '1.8.0',
    date: '2026-08-25',
    headline: 'whatsNew.v1_8_0.headline',
    summary: 'whatsNew.v1_8_0.summary',
    groups: [
      {
        title: 'whatsNew.groups.features',
        tone: 'feature',
        highlights: [
          { id: 'view-data-paging', icon: Table2, title: 'whatsNew.v1_8_0.viewData.title', description: 'whatsNew.v1_8_0.viewData.description' },
          { id: 'redis-scan', icon: Zap, title: 'whatsNew.v1_8_0.redisScan.title', description: 'whatsNew.v1_8_0.redisScan.description' },
          { id: 'activity-panel', icon: Activity, title: 'whatsNew.v1_8_0.activityPanel.title', description: 'whatsNew.v1_8_0.activityPanel.description' },
          { id: 'er-diagram', icon: Share2, title: 'whatsNew.v1_8_0.erDiagram.title', description: 'whatsNew.v1_8_0.erDiagram.description' },
        ],
      },
      {
        title: 'whatsNew.groups.improvements',
        tone: 'improvement',
        highlights: [
          { id: 'faster-start', icon: Rocket, title: 'whatsNew.v1_8_0.fasterStart.title', description: 'whatsNew.v1_8_0.fasterStart.description' },
          { id: 'snappier', icon: Gauge, title: 'whatsNew.v1_8_0.snappier.title', description: 'whatsNew.v1_8_0.snappier.description' },
          { id: 'schema-errors', icon: RefreshCw, title: 'whatsNew.v1_8_0.schemaErrors.title', description: 'whatsNew.v1_8_0.schemaErrors.description' },
          { id: 'database-switch', icon: ArrowLeftRight, title: 'whatsNew.v1_8_0.databaseSwitch.title', description: 'whatsNew.v1_8_0.databaseSwitch.description' },
          { id: 'statements', icon: ListOrdered, title: 'whatsNew.v1_8_0.statements.title', description: 'whatsNew.v1_8_0.statements.description' },
          { id: 'tab-bar', icon: PanelsTopLeft, title: 'whatsNew.v1_8_0.tabBar.title', description: 'whatsNew.v1_8_0.tabBar.description' },
        ],
      },
      {
        title: 'whatsNew.groups.fixes',
        tone: 'fix',
        highlights: [
          { id: 'redis-injection', icon: ShieldCheck, title: 'whatsNew.v1_8_0.redisInjection.title', description: 'whatsNew.v1_8_0.redisInjection.description' },
          { id: 'write-gate', icon: ShieldAlert, title: 'whatsNew.v1_8_0.writeGate.title', description: 'whatsNew.v1_8_0.writeGate.description' },
          { id: 'stale-responses', icon: Hourglass, title: 'whatsNew.v1_8_0.staleResponses.title', description: 'whatsNew.v1_8_0.staleResponses.description' },
        ],
      },
    ],
    links: [
      { label: 'whatsNew.links.changelog', url: 'https://github.com/arshad-shah/verql/blob/main/CHANGELOG.md' },
      { label: 'whatsNew.links.userGuide', url: 'https://verql.arshadshah.com/guide/' },
    ],
  },
  {
    version: '1.5.0',
    date: '2026-07-16',
    headline: 'whatsNew.v1_5_0.headline',
    summary: 'whatsNew.v1_5_0.summary',
    groups: [
      {
        title: 'whatsNew.groups.features',
        tone: 'feature',
        highlights: [
          { id: 'ion', icon: Palette, title: 'whatsNew.v1_5_0.ion.title', description: 'whatsNew.v1_5_0.ion.description' },
          { id: 'mac-menu', icon: SquareMenu, title: 'whatsNew.v1_5_0.macMenu.title', description: 'whatsNew.v1_5_0.macMenu.description' },
          { id: 'text-area', icon: PencilRuler, title: 'whatsNew.v1_5_0.textArea.title', description: 'whatsNew.v1_5_0.textArea.description' },
        ],
      },
      {
        title: 'whatsNew.groups.improvements',
        tone: 'improvement',
        highlights: [
          { id: 'fields', icon: SlidersHorizontal, title: 'whatsNew.v1_5_0.fields.title', description: 'whatsNew.v1_5_0.fields.description' },
          { id: 'toasts', icon: BellRing, title: 'whatsNew.v1_5_0.toasts.title', description: 'whatsNew.v1_5_0.toasts.description' },
          { id: 'about', icon: Info, title: 'whatsNew.v1_5_0.about.title', description: 'whatsNew.v1_5_0.about.description' },
          { id: 'shortcuts', icon: Keyboard, title: 'whatsNew.v1_5_0.shortcuts.title', description: 'whatsNew.v1_5_0.shortcuts.description' },
        ],
      },
      {
        title: 'whatsNew.groups.fixes',
        tone: 'fix',
        highlights: [
          { id: 'contrast', icon: Contrast, title: 'whatsNew.v1_5_0.contrast.title', description: 'whatsNew.v1_5_0.contrast.description' },
          { id: 'security', icon: ShieldCheck, title: 'whatsNew.v1_5_0.security.title', description: 'whatsNew.v1_5_0.security.description' },
        ],
      },
    ],
    links: [
      { label: 'whatsNew.links.changelog', url: 'https://github.com/arshad-shah/verql/blob/main/CHANGELOG.md' },
      { label: 'whatsNew.links.userGuide', url: 'https://verql.arshadshah.com/guide/' },
    ],
  },
  {
    version: '1.3.1',
    date: '2026-06-12',
    headline: 'whatsNew.v1_3_1.headline',
    summary: 'whatsNew.v1_3_1.summary',
    groups: [
      {
        title: 'whatsNew.groups.features',
        tone: 'feature',
        highlights: [
          { id: 'linux', icon: MonitorDown, title: 'whatsNew.v1_3_1.linux.title', description: 'whatsNew.v1_3_1.linux.description' },
          { id: 'microsoft-store', icon: Store, title: 'whatsNew.v1_3_1.microsoftStore.title', description: 'whatsNew.v1_3_1.microsoftStore.description' },
        ],
      },
      {
        title: 'whatsNew.groups.improvements',
        tone: 'improvement',
        highlights: [
          { id: 'effortless-updates', icon: RefreshCw, title: 'whatsNew.v1_3_1.updates.title', description: 'whatsNew.v1_3_1.updates.description' },
          { id: 'verifiable-downloads', icon: ShieldCheck, title: 'whatsNew.v1_3_1.verifiableDownloads.title', description: 'whatsNew.v1_3_1.verifiableDownloads.description' },
        ],
      },
    ],
    links: [
      { label: 'whatsNew.links.userGuide', url: 'https://verql.arshadshah.com/guide/' },
      { label: 'whatsNew.links.changelog', url: 'https://github.com/arshad-shah/verql/blob/main/CHANGELOG.md' },
    ],
  },
  {
    version: '1.2.0',
    date: '2026-06-11',
    headline: 'whatsNew.v1_2_0.headline',
    summary: 'whatsNew.v1_2_0.summary',
    groups: [
      {
        title: 'whatsNew.groups.features',
        tone: 'feature',
        highlights: [
          { id: 'sdk-on-npm', icon: Package, title: 'whatsNew.v1_2_0.sdkOnNpm.title', description: 'whatsNew.v1_2_0.sdkOnNpm.description' },
          { id: 'welcome-walkthrough', icon: Sparkles, title: 'whatsNew.v1_2_0.welcome.title', description: 'whatsNew.v1_2_0.welcome.description' },
          { id: 'in-app-release-notes', icon: PartyPopper, title: 'whatsNew.v1_2_0.releaseNotes.title', description: 'whatsNew.v1_2_0.releaseNotes.description' },
        ],
      },
      {
        title: 'whatsNew.groups.improvements',
        tone: 'improvement',
        highlights: [
          { id: 'db-agnostic-nouns', icon: Languages, title: 'whatsNew.v1_2_0.nouns.title', description: 'whatsNew.v1_2_0.nouns.description' },
        ],
      },
    ],
    links: [
      { label: 'whatsNew.links.sdkDocs', url: 'https://verql.arshadshah.com/plugins/sdk/' },
      { label: 'whatsNew.links.changelog', url: 'https://github.com/arshad-shah/verql/blob/main/CHANGELOG.md' },
    ],
  },
  {
    version: '1.1.0',
    date: '2026-05-20',
    headline: 'whatsNew.v1_1_0.headline',
    summary: 'whatsNew.v1_1_0.summary',
    groups: [
      {
        title: 'whatsNew.groups.features',
        tone: 'feature',
        highlights: [
          { id: 'driver-explain', icon: Gauge, title: 'whatsNew.v1_1_0.explain.title', description: 'whatsNew.v1_1_0.explain.description' },
          { id: 'data-grid-browse', icon: Table2, title: 'whatsNew.v1_1_0.browse.title', description: 'whatsNew.v1_1_0.browse.description' },
          { id: 'app-shell', icon: PanelsTopLeft, title: 'whatsNew.v1_1_0.shell.title', description: 'whatsNew.v1_1_0.shell.description' },
          { id: 'about-modal', icon: Info, title: 'whatsNew.v1_1_0.about.title', description: 'whatsNew.v1_1_0.about.description' },
        ],
      },
      {
        title: 'whatsNew.groups.improvements',
        tone: 'improvement',
        highlights: [
          { id: 'diagnostics', icon: Network, title: 'whatsNew.v1_1_0.diagnostics.title', description: 'whatsNew.v1_1_0.diagnostics.description' },
          { id: 'design-system', icon: Palette, title: 'whatsNew.v1_1_0.design.title', description: 'whatsNew.v1_1_0.design.description' },
          { id: 'connection-form', icon: Sparkles, title: 'whatsNew.v1_1_0.connForm.title', description: 'whatsNew.v1_1_0.connForm.description' },
        ],
      },
      {
        title: 'whatsNew.groups.fixes',
        tone: 'fix',
        highlights: [
          { id: 'live-layout-settings', icon: ToggleRight, title: 'whatsNew.v1_1_0.liveLayout.title', description: 'whatsNew.v1_1_0.liveLayout.description' },
          { id: 'mysql-explorer', icon: Wrench, title: 'whatsNew.v1_1_0.mysql.title', description: 'whatsNew.v1_1_0.mysql.description' },
          { id: 'headless-secrets', icon: ShieldCheck, title: 'whatsNew.v1_1_0.headlessSecrets.title', description: 'whatsNew.v1_1_0.headlessSecrets.description' },
        ],
      },
    ],
    links: [
      { label: 'whatsNew.links.changelog', url: 'https://github.com/arshad-shah/verql/blob/main/CHANGELOG.md' },
      { label: 'whatsNew.links.userGuide', url: 'https://verql.arshadshah.com/guide/' },
    ],
  },
]
