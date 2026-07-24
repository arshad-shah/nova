import type { ActivityEntry, ActivityKind, ActivityLevel } from '@shared/activity'
import { ACTIVITY_KIND } from '@shared/activity'

/**
 * The Activity panel's filter expression — pure parse / serialize / apply, so
 * the bar holds only the raw string and the stream reads a predicate.
 *
 * Grammar (space-separated, double-quotes group a value with spaces):
 *   level:error   kind:query   source:pg-main   "free text"   bareTerm
 *
 * - `level:` / `kind:` accept a valid level/kind; anything else is treated as
 *   free text (the field never rejects input).
 * - `source:` matches the entry's source as a case-insensitive substring.
 * - Bare terms (and unknown keys like `foo:bar`) are free text, matched as a
 *   case-insensitive substring across title, detail, source and metadata.
 * - Within a key it's OR (level:error level:warn → error OR warn); across keys
 *   and across free-text terms it's AND. This preserves the old chip semantics.
 */

export type FilterToken =
  | { type: 'level'; value: ActivityLevel }
  | { type: 'kind'; value: ActivityKind }
  | { type: 'source'; value: string }
  | { type: 'text'; value: string }

const LEVELS: readonly string[] = ['debug', 'info', 'success', 'warn', 'error']
const KINDS: readonly string[] = Object.values(ACTIVITY_KIND)

function unquote(s: string): string {
  return s.length >= 2 && s.startsWith('"') && s.endsWith('"') ? s.slice(1, -1) : s
}

function needsQuote(s: string): boolean {
  return /\s/.test(s) || s === ''
}

function quote(s: string): string {
  return needsQuote(s) ? `"${s}"` : s
}

/** Split on unquoted whitespace, keeping `key:"a b"` and `"a b"` as one lexeme. */
function lex(input: string): string[] {
  const out: string[] = []
  let cur = ''
  let inQuote = false
  let hasContent = false
  for (const ch of input) {
    if (ch === '"') { inQuote = !inQuote; cur += ch; hasContent = true; continue }
    if (/\s/.test(ch) && !inQuote) {
      if (hasContent) { out.push(cur); cur = ''; hasContent = false }
      continue
    }
    cur += ch
    hasContent = true
  }
  if (hasContent) out.push(cur)
  return out
}

function classify(lexeme: string): FilterToken {
  if (!lexeme.startsWith('"')) {
    const idx = lexeme.indexOf(':')
    if (idx > 0) {
      const key = lexeme.slice(0, idx).toLowerCase()
      const value = unquote(lexeme.slice(idx + 1))
      if (key === 'level' && LEVELS.includes(value.toLowerCase())) {
        return { type: 'level', value: value.toLowerCase() as ActivityLevel }
      }
      if (key === 'kind' && KINDS.includes(value.toLowerCase())) {
        return { type: 'kind', value: value.toLowerCase() as ActivityKind }
      }
      if (key === 'source' && value) {
        return { type: 'source', value }
      }
      // Unknown key or invalid value falls through to free text (the literal),
      // so the field never rejects what the user typed.
    }
  }
  return { type: 'text', value: unquote(lexeme) }
}

/** A stable identity for a token, used to de-duplicate. */
export function tokenKey(token: FilterToken): string {
  return `${token.type}:${token.value.toLowerCase()}`
}

/** De-duplicate tokens by identity, preserving first-seen order. */
export function dedupeTokens(tokens: FilterToken[]): FilterToken[] {
  const seen = new Set<string>()
  const out: FilterToken[] = []
  for (const t of tokens) {
    if (t.type === 'text' && t.value === '') continue
    const key = tokenKey(t)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(t)
  }
  return out
}

export function parseFilter(input: string): FilterToken[] {
  return dedupeTokens(lex(input).map(classify))
}

export function serializeToken(token: FilterToken): string {
  switch (token.type) {
    case 'level': return `level:${token.value}`
    case 'kind': return `kind:${token.value}`
    case 'source': return `source:${quote(token.value)}`
    case 'text': return quote(token.value)
  }
}

export function serializeFilter(tokens: FilterToken[]): string {
  return tokens.map(serializeToken).join(' ')
}

/** Apply a parsed filter to entries. Empty filter → all entries. */
export function applyFilter(entries: ActivityEntry[], tokens: FilterToken[]): ActivityEntry[] {
  const levels = tokens.filter((t): t is Extract<FilterToken, { type: 'level' }> => t.type === 'level').map((t) => t.value)
  const kinds = tokens.filter((t): t is Extract<FilterToken, { type: 'kind' }> => t.type === 'kind').map((t) => t.value)
  const sources = tokens.filter((t): t is Extract<FilterToken, { type: 'source' }> => t.type === 'source').map((t) => t.value.toLowerCase())
  const texts = tokens.filter((t): t is Extract<FilterToken, { type: 'text' }> => t.type === 'text').map((t) => t.value.toLowerCase()).filter(Boolean)

  if (!levels.length && !kinds.length && !sources.length && !texts.length) return entries

  return entries.filter((e) => {
    if (levels.length && !levels.includes(e.level)) return false
    if (kinds.length && !kinds.includes(e.kind)) return false
    if (sources.length) {
      const src = (e.source ?? '').toLowerCase()
      if (!sources.some((s) => src.includes(s))) return false
    }
    if (texts.length) {
      const hay = `${e.title} ${e.detail ?? ''} ${e.source ?? ''} ${e.metadata ? JSON.stringify(e.metadata) : ''}`.toLowerCase()
      if (!texts.every((term) => hay.includes(term))) return false
    }
    return true
  })
}

/**
 * Severity summary for a pill — a **deduplicated** count (distinct titles) plus
 * the raw occurrence total, so a single error hammered 40 times reads as one
 * problem with a ×40 multiplier rather than 40 separate ones.
 */
export interface SeveritySummary {
  distinct: number
  total: number
}

export function summarizeLevel(entries: ActivityEntry[], level: ActivityLevel): SeveritySummary {
  const titles = new Set<string>()
  let total = 0
  for (const e of entries) {
    if (e.level !== level) continue
    total++
    titles.add(e.title)
  }
  return { distinct: titles.size, total }
}
