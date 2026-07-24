import {
  Database, Wrench, Plug, Bell, Globe, ScrollText,
  Cable, Puzzle, Layers, Gauge, type LucideIcon,
} from 'lucide-react'
import type { ActivityKind, ActivityLevel } from '@shared/activity'
import type { MessageKey } from '@shared/i18n'

/**
 * Per-kind presentation for the Activity panel — pure data, so the row just
 * renders it (no kind→icon/colour switch in the component).
 *
 * `tone` is the accent the kind glyph + label carry in the meta line:
 * - `data`  — this touched a data source (query, connection, network, ipc, store)
 * - `agent` — an agent did this (tool-call, plugin)
 * - `muted` — ambient/diagnostic (notification, perf, log)
 *
 * The two accent tones map to `--color-data-accent` (cyan) and
 * `--color-agent-accent` (violet) — theme tokens that existed but were unspent
 * in this panel. Interface state (`--color-accent`, purple) is never used here.
 */
export type KindTone = 'data' | 'agent' | 'muted'

export interface KindMeta {
  icon: LucideIcon
  label: MessageKey
  tone: KindTone
}

export const KIND_META: Record<ActivityKind, KindMeta> = {
  query: { icon: Database, label: 'shell.activity.queries', tone: 'data' },
  'tool-call': { icon: Wrench, label: 'shell.activity.tools', tone: 'agent' },
  connection: { icon: Plug, label: 'shell.activity.connections', tone: 'data' },
  notification: { icon: Bell, label: 'shell.activity.notifications', tone: 'muted' },
  network: { icon: Globe, label: 'shell.activity.network', tone: 'data' },
  ipc: { icon: Cable, label: 'shell.activity.ipc', tone: 'data' },
  plugin: { icon: Puzzle, label: 'shell.activity.plugins', tone: 'agent' },
  store: { icon: Layers, label: 'shell.activity.store', tone: 'data' },
  perf: { icon: Gauge, label: 'shell.activity.perf', tone: 'muted' },
  log: { icon: ScrollText, label: 'shell.activity.logs', tone: 'muted' },
}

/** Text-colour utility for a kind's meta-line accent. */
export const KIND_TONE_CLASS: Record<KindTone, string> = {
  data: 'text-data-accent',
  agent: 'text-agent-accent',
  muted: 'text-text-muted',
}

/**
 * The severity rail — a 2px full-bleed bar on the row's left edge. Severity
 * lives at the panel edge, not only in an icon tint, so an error and a debug
 * line no longer read with identical visual mass. `info`/`debug` are transparent
 * (no rail); the level still reads from the meta line and accessible name.
 */
export const LEVEL_RAIL_CLASS: Record<ActivityLevel, string> = {
  error: 'bg-error',
  warn: 'bg-warning',
  success: 'bg-success',
  info: 'bg-transparent',
  debug: 'bg-transparent',
}

/** Whether a level draws a visible rail (used to gate the error background wash
 *  and to expose the rail's meaning without relying on colour alone). */
export function hasRail(level: ActivityLevel): boolean {
  return level === 'error' || level === 'warn' || level === 'success'
}
