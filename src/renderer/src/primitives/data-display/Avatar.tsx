import React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../utils/cn'
import { BadgeIndicator } from './BadgeIndicator'

/**
 * Avatar: the visual identity of an entity.
 *
 * Shaped by what Verql actually contains, which is not people. There are no
 * accounts, no authors and no emails in this app — the only avatar-shaped
 * things are plugins, connections and the AI assistant. So the usual avatar
 * vocabulary is deliberately re-pointed:
 * - the photo is a plugin's logo,
 * - the person-initials are a single letter (`prod-replica` has no surname),
 * - presence (online/away/busy) is lifecycle (connected/degraded/error),
 * - and there is no stacked "+3 others", because nothing here is a crowd.
 *
 * `shape` exists because its absence forked the codebase: Avatar hardcoded
 * `rounded-full`, so the plugin list wrote its own icon component to get a
 * squircle. One axis lets that component collapse back into this one.
 */

const IDENTITY_HUES = 8

/** Stable colour from a name — the same plugin is the same colour every run.
 *  Not cryptographic; it only has to spread names across the palette. */
export function identityIndex(seed: string): number {
  let hash = 0
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) | 0
  return (Math.abs(hash) % IDENTITY_HUES) + 1
}

const avatarVariants = cva(
  cn(
    'relative inline-flex shrink-0 select-none items-center justify-center overflow-hidden',
    'font-semibold shadow-[var(--shadow-card)]',
    'transition-[box-shadow,opacity] duration-(--transition-fast) motion-reduce:transition-none'
  ),
  {
    variants: {
      // The kit's scale: 16 / 24 / 32 / 48 / 64.
      size: {
        xs: 'h-4 w-4 text-[7px]',
        sm: 'h-6 w-6 text-[9px]',
        md: 'h-8 w-8 text-xs',
        lg: 'h-12 w-12 text-base',
        xl: 'h-16 w-16 text-2xl',
      },
      /** Circle for agents and people-shaped things; squircle for software. */
      shape: {
        circle: 'rounded-full',
        squircle: 'rounded-[26%]',
      },
      /**
       * How the tile is filled.
       * - `identity` fills with a name-derived hue — for an entity with no icon
       *   of its own. It is decorative and carries no status meaning.
       * - the rest are a wash of a semantic colour with a matching label, which
       *   is what the AI assistant already used (accent normally, error when a
       *   message failed).
       */
      tone: {
        identity: 'text-on-fill-dark',
        accent: 'bg-accent/10 text-accent ring-1 ring-inset ring-accent/25',
        neutral: 'bg-bg-tertiary text-text-secondary ring-1 ring-inset ring-border-default',
        success: 'bg-success/10 text-success ring-1 ring-inset ring-success/25',
        warning: 'bg-warning/10 text-warning ring-1 ring-inset ring-warning/25',
        error: 'bg-error/10 text-error ring-1 ring-inset ring-error/25',
      },
      /** The entity this represents is the chosen one — a ring, not a fill, so
       *  it reads on an image tile as well as a letter one. */
      selected: { true: 'shadow-[0_0_0_2px_var(--color-accent)]', false: '' },
      /** Deactivated, not merely absent: greyed and dimmed. */
      disabled: { true: 'opacity-40 grayscale', false: '' },
    },
    defaultVariants: {
      size: 'md',
      shape: 'circle',
      tone: 'accent',
      selected: false,
      disabled: false,
    },
  }
)

/** The dot is set per size rather than derived from a CSS var on the tile:
 *  BadgeIndicator renders the dot as the tile's *sibling*, so a var declared on
 *  the tile is out of scope for it. Explicit is also easier to read than
 *  `max(6px, calc(...))`. */
const DOT_SIZE = {
  xs: 'h-1.5 w-1.5',
  sm: 'h-2 w-2',
  md: 'h-2.5 w-2.5',
  lg: 'h-3 w-3',
  xl: 'h-3.5 w-3.5',
} as const

/** Lifecycle, not presence. These are the two vocabularies the app actually
 *  has: connections are connected or not; plugins are active, degraded or
 *  errored. There is nobody here to be "away". */
export type AvatarStatus =
  | 'connected'
  | 'disconnected'
  | 'active'
  | 'degraded'
  | 'error'

const STATUS_DOT: Record<AvatarStatus, string> = {
  connected: 'bg-success',
  active: 'bg-success',
  disconnected: 'bg-text-tertiary',
  degraded: 'bg-warning',
  error: 'bg-error',
}

export type AvatarVariants = VariantProps<typeof avatarVariants>

export interface AvatarProps extends AvatarVariants {
  /** The entity's name. Always the accessible name; also the source of the
   *  letter and of the identity colour when there's no image or icon. */
  name: string
  /** An image for the entity — a plugin's logo, not a photograph. */
  src?: string
  /** A glyph instead of a letter. `src` wins over this. */
  icon?: React.ReactNode
  /** Lifecycle dot. Anchored to the tile via BadgeIndicator rather than
   *  re-implemented — the app already has nine hand-rolled dots. */
  status?: AvatarStatus
  /** Overrides `name` as the identity-colour seed — use when the display name
   *  changes but the entity doesn't (a plugin's id vs its displayName). */
  colorSeed?: string
  className?: string
}

/** First letter only. A two-word split ("Jane Doe" -> "JD") is a person-name
 *  algorithm, and this app has no people: `prod-replica` and `db-tools` have no
 *  first and last name to split. */
function initial(name: string): string {
  return name.trim().charAt(0).toUpperCase()
}

export function Avatar({
  name,
  src,
  icon,
  status,
  colorSeed,
  size,
  shape,
  tone,
  selected,
  disabled,
  className,
}: AvatarProps) {
  const hue = (tone ?? 'accent') === 'identity' ? identityIndex(colorSeed ?? name) : null

  const tile = (
    <span
      // `img` because the tile *is* the picture of the entity, and `name` is its
      // text alternative. A clickable avatar is not this component's job — wrap
      // it in `Button variant="bare" size="none"`, which already owns focus,
      // keyboard and disabled handling. A span with role="button" would fake
      // half of that.
      role="img"
      aria-label={name}
      className={cn(avatarVariants({ size, shape, tone, selected, disabled }), className)}
      // The hue is a token; the second stop is derived from it, so a theme
      // remaps one value per identity colour rather than sixteen.
      style={
        hue
          ? {
              backgroundImage: `linear-gradient(135deg, var(--color-identity-${hue}), color-mix(in oklab, var(--color-identity-${hue}), black 14%))`,
            }
          : undefined
      }
    >
      {src ? (
        // alt="" — the wrapper already carries the name, and repeating it makes
        // a screen reader say the entity twice.
        <img src={src} alt="" className="h-full w-full object-cover" />
      ) : icon ? (
        icon
      ) : (
        initial(name)
      )}
    </span>
  )

  if (!status) return tile

  return (
    <BadgeIndicator
      side="bottom-right"
      className={cn(DOT_SIZE[size ?? 'md'], 'ring-2 ring-bg-primary', STATUS_DOT[status])}
    >
      {tile}
    </BadgeIndicator>
  )
}
